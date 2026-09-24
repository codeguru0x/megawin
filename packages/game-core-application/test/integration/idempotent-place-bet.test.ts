/**
 * p0-02 B2 #11–#19 — đường tiền idempotent place-bet.
 *
 * Đếm document thật (vé + WAL) và số lần gọi tenant. Không chỉ đọc status code.
 * Fingerprint body đã bỏ: cùng key luôn cùng `tx`. Body khác không tạo vé thứ hai;
 * WAL `COMPLETED` thì replay, `DEBIT_PENDING` thì 409.
 *
 * Redis không tham gia đường này (#19).
 */

import { Constants, getMongoClient, getMongoDb } from "@megawin/data/mongo";
import { TxIntentPhase } from "@megawin/game-core/entities";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { Currency } from "@megawin/shared/types";
import { extractIdempotencyKeyFromApiGatewayV2 } from "@megawin/shared/utils/api-gateway-v2";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TxIntentRepository } from "../../src/infras/repos/tx-intent-repo";
import { DebitPlayerService, type DebitPlayerInput } from "../../src/services/debit-player-service";
import { deriveTx } from "../../src/services/derive-tx";

const transaction = vi.hoisted(() => vi.fn());
const getClient = vi.hoisted(() => vi.fn(async () => ({ transaction })));

vi.mock("@megawin/tenant-gateway", async () => {
  const actual = await vi.importActual<typeof import("@megawin/tenant-gateway")>("@megawin/tenant-gateway");
  return {
    ...actual,
    tenantGateway: {
      getClient,
    },
  };
});

/** Marker chỉ thuộc file này — cleanup không đụng document khác. */
const MARKER = "p002-idem-place-bet";

const TICKET_COLLECTIONS = [
  "keno_tickets",
  "lotto535_tickets",
  "mega645_tickets",
  "power655_tickets",
  "max3d_tickets",
  "max3dpro_tickets",
  "bingo18_tickets",
] as const;

let service: DebitPlayerService;
let txRepo: TxIntentRepository;
const createdTx = new Set<string>();

function debitInput(tx: string, accountId: string, amount = 10_000): DebitPlayerInput {
  createdTx.add(tx);
  return {
    tx,
    tenantId: `${MARKER}-tenant`,
    accountId,
    username: `${MARKER}-user`,
    amount,
    currency: Currency.VND,
    gameId: "keno",
    roundIds: ["2999-01-01.001"],
    description: "p0-02 idempotent test",
    metadata: { ticketNo: `${MARKER}-ticket` },
  };
}

async function gameDb() {
  return await getMongoDb({
    mongoEnvKey: "MONGODB_URI",
    dbName: Constants.Default.GameDbName,
  });
}

async function countWal(tx: string): Promise<number> {
  const coll = await txRepo.getCollection();
  return await coll.countDocuments({ tx, accountId: { $regex: `^${MARKER}` } });
}

async function countTickets(tx: string): Promise<number> {
  const db = await gameDb();
  const coll = db.collection("keno_tickets");
  return await coll.countDocuments({ tx, accountId: { $regex: `^${MARKER}` } });
}

beforeAll(async () => {
  service = new DebitPlayerService();
  txRepo = new TxIntentRepository();

  // B0 0c — transaction/session cần replica set.
  const client = await getMongoClient({ mongoEnvKey: "MONGODB_URI" });
  const hello = await client.db("admin").command({ hello: 1 });
  expect(hello.setName, "Mongo testcontainer phải là replica set").toBeTruthy();

  const coll = await txRepo.getCollection();
  await coll.insertOne({ tx: `${MARKER}-bootstrap-wal`, accountId: MARKER, phase: "DEBIT_PENDING" });
  await coll.deleteMany({ tx: `${MARKER}-bootstrap-wal`, accountId: MARKER });
  const indexes = await coll.listIndexes().toArray();
  if (!indexes.some((index) => index.name === "idx_tx_unique")) {
    await coll.createIndex({ tx: 1 }, { unique: true, name: "idx_tx_unique" });
  }

  const db = await gameDb();
  for (const name of TICKET_COLLECTIONS) {
    const tickets = db.collection(name);
    await tickets.insertOne({ tx: `${MARKER}-bootstrap-${name}`, accountId: MARKER });
    await tickets.deleteMany({ tx: `${MARKER}-bootstrap-${name}`, accountId: MARKER });
    const ticketIndexes = await tickets.listIndexes().toArray();
    if (!ticketIndexes.some((index) => index.name === "idx_tx_unique")) {
      await tickets.createIndex(
        { tx: 1 },
        {
          unique: true,
          name: "idx_tx_unique",
          partialFilterExpression: { tx: { $type: "string" } },
        },
      );
    }
  }
});

afterEach(async () => {
  transaction.mockReset();
  getClient.mockResolvedValue({ transaction } as never);

  const coll = await txRepo.getCollection();
  for (const tx of createdTx) {
    await coll.deleteMany({ tx, accountId: { $regex: `^${MARKER}` } });
  }

  const db = await gameDb();
  for (const name of TICKET_COLLECTIONS) {
    for (const tx of createdTx) {
      await db.collection(name).deleteMany({ tx, accountId: { $regex: `^${MARKER}` } });
    }
  }
  createdTx.clear();
});

describe("idempotent debit + ticket (p0-02 B2)", () => {
  // #11 — DebitPlayerService: lần 2 chết ở unique WAL trước tenant.
  // Vé do test ghi sau debit thành công để đếm; debit không tự tạo vé.
  it("#11 cùng Idempotency-Key → 1 vé, 1 WAL, tenant debit tiền 1 lần", async () => {
    const accountId = `${MARKER}-11`;
    const tx = deriveTx(accountId, "same-key-11");
    transaction.mockResolvedValue({ success: true, data: { balance: 90_000 } });

    await service.debit(debitInput(tx, accountId));
    const db = await gameDb();
    await db.collection("keno_tickets").insertOne({
      tx,
      accountId,
      ticketNo: `${MARKER}-11`,
      totalAmount: 10_000,
    });

    await expect(service.debit(debitInput(tx, accountId))).rejects.toMatchObject({
      code: APP_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    });

    expect(await countWal(tx)).toBe(1);
    expect(await countTickets(tx)).toBe(1);
    // Lần thứ hai chết ở unique WAL, chưa gọi tenant.
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  // #12 — replay COMPLETED trả đúng vé cũ + số dư tươi từ tenant (cùng tx).
  it("#12 replay COMPLETED trả vé cũ và số dư tươi", async () => {
    const accountId = `${MARKER}-12`;
    const tx = deriveTx(accountId, "same-key-12");
    transaction
      .mockResolvedValueOnce({ success: true, data: { balance: 90_000 } })
      .mockResolvedValueOnce({ success: true, data: { balance: 80_000, duplicate: true } });

    const input = debitInput(tx, accountId, 10_000);
    const first = await service.debit(input);
    await service.markCompleted(tx);

    const db = await gameDb();
    await db.collection("keno_tickets").insertOne({
      tx,
      accountId,
      ticketNo: `${MARKER}-T12`,
      ticketId: "ticket-12",
      totalAmount: 10_000,
    });

    await expect(service.debit(debitInput(tx, accountId, 99_000))).rejects.toMatchObject({
      code: APP_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    });
    const replay = await service.replayCompletedDebit(input);

    const ticket = await db.collection("keno_tickets").findOne({ tx, accountId });
    expect(ticket?.ticketNo).toBe(`${MARKER}-T12`);
    expect(ticket?.totalAmount).toBe(10_000);
    expect(first.balance).toBe(90_000);
    expect(replay.balance).toBe(80_000);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[1]?.[0]).toMatchObject({ tx });
    expect(await countWal(tx)).toBe(1);
    expect(await countTickets(tx)).toBe(1);
  });

  // #13 — request 2 khi WAL còn DEBIT_PENDING → 409, không thêm vé.
  it("#13 DEBIT_PENDING → 409, không tạo vé thứ hai", async () => {
    const accountId = `${MARKER}-13`;
    const tx = deriveTx(accountId, "pending-key-13");
    transaction.mockResolvedValue({ success: true, data: { balance: 50_000 } });

    await service.debit(debitInput(tx, accountId));
    const wal = await service.findWal(tx);
    expect(wal?.phase).toBe(TxIntentPhase.DebitPending);

    await expect(service.replayCompletedDebit(debitInput(tx, accountId))).rejects.toMatchObject({
      code: APP_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      message: "Yêu cầu đang được xử lý, vui lòng chờ và thử lại.",
    });

    expect(await countWal(tx)).toBe(1);
    expect(await countTickets(tx)).toBe(0);
  });

  // #14 — cùng key, amount (body) khác. Không có fingerprint: không tạo tx/vé mới.
  it("#14 cùng key body khác → không tạo vé thứ hai", async () => {
    const accountId = `${MARKER}-14`;
    const tx = deriveTx(accountId, "reuse-key-14");
    transaction.mockResolvedValue({ success: true, data: { balance: 40_000 } });

    await service.debit(debitInput(tx, accountId, 10_000));
    const db = await gameDb();
    await db.collection("keno_tickets").insertOne({ tx, accountId, ticketNo: `${MARKER}-14`, totalAmount: 10_000 });
    await service.markCompleted(tx);

    await expect(service.debit(debitInput(tx, accountId, 20_000))).rejects.toBeInstanceOf(AppException);
    await service.replayCompletedDebit(debitInput(tx, accountId, 20_000));

    expect(await countTickets(tx)).toBe(1);
    expect(await countWal(tx)).toBe(1);
    const ticket = await db.collection("keno_tickets").findOne({ tx, accountId });
    expect(ticket?.totalAmount).toBe(10_000);
  });

  // #15 — key khác là hai ý định cược. Hai tx, hai vé.
  it("#15 key khác nhau, body giống → 2 vé", async () => {
    const accountId = `${MARKER}-15`;
    transaction.mockResolvedValue({ success: true, data: { balance: 70_000 } });
    const txA = deriveTx(accountId, "key-a");
    const txB = deriveTx(accountId, "key-b");
    expect(txA).not.toBe(txB);

    await service.debit(debitInput(txA, accountId));
    await service.debit(debitInput(txB, accountId));

    const db = await gameDb();
    await db.collection("keno_tickets").insertMany([
      { tx: txA, accountId, ticketNo: `${MARKER}-15a` },
      { tx: txB, accountId, ticketNo: `${MARKER}-15b` },
    ]);

    expect(await countWal(txA)).toBe(1);
    expect(await countWal(txB)).toBe(1);
    expect(await db.collection("keno_tickets").countDocuments({ accountId })).toBe(2);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  // #16 — race thật. Tuần tự không bắt được hai insert cùng lúc.
  it("#16 Promise.all 5 request cùng key → 1 WAL, tenant debit 1 lần", async () => {
    const accountId = `${MARKER}-16`;
    const tx = deriveTx(accountId, "race-key-16");
    transaction.mockResolvedValue({ success: true, data: { balance: 10_000 } });

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.debit(debitInput(tx, accountId))));

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const result of rejected) {
      expect(result.reason).toMatchObject({
        code: APP_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      });
    }

    expect(await countWal(tx)).toBe(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(await countTickets(tx)).toBe(0);
  });

  // #17 — extract ném 400 đồng bộ. Đếm WAL/vé = 0 vì chưa gọi debit,
  // không chứng minh thứ tự trong handler (handler gọi extract trước useCase.run).
  it("#17 thiếu header → 400, 0 vé, 0 WAL", async () => {
    const accountId = `${MARKER}-17`;
    const ghostTx = deriveTx(accountId, "would-have-been-used");
    createdTx.add(ghostTx);
    transaction.mockResolvedValue({ success: true, data: { balance: 1 } });

    expect(() => extractIdempotencyKeyFromApiGatewayV2({ headers: {} })).toThrow(AppException);
    try {
      extractIdempotencyKeyFromApiGatewayV2({ headers: {} });
    } catch (error) {
      expect(error).toMatchObject({ code: APP_ERROR_CODES.BAD_REQUEST });
    }

    expect(transaction).not.toHaveBeenCalled();
    expect(await countWal(ghostTx)).toBe(0);
    expect(await countTickets(ghostTx)).toBe(0);
  });

  // #18 — key scope theo accountId.
  it("#18 hai account cùng giá trị key → 2 vé, 2 tx", async () => {
    const key = "shared-client-key";
    const accountA = `${MARKER}-18a`;
    const accountB = `${MARKER}-18b`;
    const txA = deriveTx(accountA, key);
    const txB = deriveTx(accountB, key);
    expect(txA).not.toBe(txB);
    transaction.mockResolvedValue({ success: true, data: { balance: 30_000 } });

    await service.debit(debitInput(txA, accountA));
    await service.debit(debitInput(txB, accountB));

    const db = await gameDb();
    await db.collection("keno_tickets").insertMany([
      { tx: txA, accountId: accountA, ticketNo: `${MARKER}-18a` },
      { tx: txB, accountId: accountB, ticketNo: `${MARKER}-18b` },
    ]);

    expect(await countWal(txA)).toBe(1);
    expect(await countWal(txB)).toBe(1);
    expect(await db.collection("keno_tickets").countDocuments({ accountId: { $in: [accountA, accountB] } })).toBe(2);
  });

  // #19 — đường tiền không đọc Redis. Tắt URI rồi vẫn debit được.
  it("#19 không có Redis vẫn idempotent, không 5xx", async () => {
    const previous = process.env.REDIS_URI;
    delete process.env.REDIS_URI;

    try {
      const accountId = `${MARKER}-19`;
      const tx = deriveTx(accountId, "no-redis-key");
      transaction.mockResolvedValue({ success: true, data: { balance: 12_000 } });

      const result = await service.debit(debitInput(tx, accountId));
      expect(result.balance).toBe(12_000);
      await expect(service.debit(debitInput(tx, accountId))).rejects.toMatchObject({
        code: APP_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      });
      expect(await countWal(tx)).toBe(1);
    } finally {
      if (previous !== undefined) {
        process.env.REDIS_URI = previous;
      }
    }
  });
});
