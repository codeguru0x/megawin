/**
 * p0-02 B2 #20–#23 — unique `{tx}` và insertWal không nuốt 11000 thành 503.
 *
 * Cleanup chỉ xoá document mang marker `p002-unique-index`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Constants, getMongoDb, isDuplicateKeyError } from "@megawin/data/mongo";
import { APP_ERROR_CODES } from "@megawin/shared/errors";
import { Currency } from "@megawin/shared/types";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { TxIntentRepository } from "../../src/infras/repos/tx-intent-repo";
import { DebitPlayerService } from "../../src/services/debit-player-service";

const transaction = vi.hoisted(() => vi.fn());

vi.mock("@megawin/tenant-gateway", async () => {
  const actual = await vi.importActual<typeof import("@megawin/tenant-gateway")>("@megawin/tenant-gateway");
  return {
    ...actual,
    tenantGateway: {
      getClient: vi.fn(async () => ({ transaction })),
    },
  };
});

const MARKER = "p002-unique-index";
const GAMES = ["keno", "lotto535", "mega645", "power655", "max3d", "max3dpro", "bingo18"] as const;

const TICKET_COLLECTION: Record<(typeof GAMES)[number], string> = {
  keno: "keno_tickets",
  lotto535: "lotto535_tickets",
  mega645: "mega645_tickets",
  power655: "power655_tickets",
  max3d: "max3d_tickets",
  max3dpro: "max3dpro_tickets",
  bingo18: "bingo18_tickets",
};

describe("unique index tx", () => {
  const txRepo = new TxIntentRepository();
  const probeTx = `${MARKER}-dup`;

  beforeAll(async () => {
    const coll = await txRepo.getCollection();
    await coll.insertOne({ tx: `${MARKER}-bootstrap`, accountId: MARKER, phase: "DEBIT_PENDING" });
    await coll.deleteMany({ tx: `${MARKER}-bootstrap`, accountId: MARKER });
    const indexes = await coll.listIndexes().toArray();
    if (!indexes.some((index) => index.name === "idx_tx_unique")) {
      await coll.createIndex({ tx: 1 }, { unique: true, name: "idx_tx_unique" });
    }
  });

  afterAll(async () => {
    const coll = await txRepo.getCollection();
    await coll.deleteMany({ tx: probeTx, accountId: MARKER });

    const db = await getMongoDb({
      mongoEnvKey: "MONGODB_URI",
      dbName: Constants.Default.GameDbName,
    });
    for (const game of GAMES) {
      await db.collection(TICKET_COLLECTION[game]).deleteMany({
        accountId: MARKER,
        tx: { $in: [`${MARKER}-${game}`, `${MARKER}-${game}-bootstrap`] },
      });
    }
  });

  // #20 — assert code 11000, không assert message (đổi giữa version Mongo).
  it("#20 hai doc cùng tx → lỗi code 11000", async () => {
    const coll = await txRepo.getCollection();
    await coll.deleteMany({ tx: probeTx, accountId: MARKER });
    await coll.insertOne({ tx: probeTx, accountId: MARKER, phase: "DEBIT_PENDING" });

    let code: number | undefined;
    try {
      await coll.insertOne({ tx: probeTx, accountId: MARKER, phase: "DEBIT_PENDING" });
    } catch (error) {
      code = (error as { code?: number }).code;
      expect(isDuplicateKeyError(error)).toBe(true);
    }

    expect(code).toBe(11000);
  });

  // #21 — 11000 phải thành IDEMPOTENCY_CONFLICT, không phải SERVICE_UNAVAILABLE.
  it("#21 insertWal map 11000 sang IDEMPOTENCY_CONFLICT", async () => {
    const service = new DebitPlayerService();
    const tx = `${MARKER}-wal`;
    transaction.mockResolvedValue({ success: true, data: { balance: 1 } });

    const input = {
      tx,
      tenantId: MARKER,
      accountId: MARKER,
      username: MARKER,
      amount: 10_000,
      currency: Currency.VND,
      gameId: "keno",
      roundIds: ["2999-01-01.001"],
      description: "unique index probe",
    };

    await service.debit(input);

    try {
      await service.debit(input);
      expect.fail("lần debit thứ hai phải ném conflict");
    } catch (error) {
      expect(error).toMatchObject({ code: APP_ERROR_CODES.IDEMPOTENCY_CONFLICT });
      expect((error as { code?: string }).code).not.toBe(APP_ERROR_CODES.SERVICE_UNAVAILABLE);
    }

    const coll = await txRepo.getCollection();
    await coll.deleteMany({ tx, accountId: MARKER });
  });

  // #22 — spec trong source + index unique trên cả 7 collection vé.
  it("#22 idx_tx_unique tồn tại và unique ở cả 7 game", async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const db = await getMongoDb({
      mongoEnvKey: "MONGODB_URI",
      dbName: Constants.Default.GameDbName,
    });

    for (const game of GAMES) {
      const sourcePath = join(here, `../../../game-${game}/src/indexes/index.ts`);
      const source = readFileSync(sourcePath, "utf8");
      const nameAt = source.indexOf('name: "idx_tx_unique"');
      expect(nameAt, `${game} thiếu idx_tx_unique`).toBeGreaterThan(-1);
      // Cửa sổ quanh đúng index `{tx}`, không lấy unique của index khác trong file.
      const block = source.slice(Math.max(0, nameAt - 280), nameAt + 220);
      expect(block, game).toMatch(/key:\s*\{\s*tx:\s*1\s*\}/);
      expect(block, game).toContain("unique: true");
      expect(block, game).toContain('partialFilterExpression: { tx: { $type: "string" } }');
      expect(block, game).toContain("collection:");

      const coll = db.collection(TICKET_COLLECTION[game]);
      await coll.insertOne({ tx: `${MARKER}-${game}-bootstrap`, accountId: MARKER });
      await coll.deleteMany({ tx: `${MARKER}-${game}-bootstrap`, accountId: MARKER });
      const indexes = await coll.listIndexes().toArray();
      if (!indexes.some((index) => index.name === "idx_tx_unique")) {
        await coll.createIndex(
          { tx: 1 },
          {
            unique: true,
            name: "idx_tx_unique",
            partialFilterExpression: { tx: { $type: "string" } },
          },
        );
      }

      const listed = await coll.listIndexes().toArray();
      const spec = listed.find((index) => index.name === "idx_tx_unique");
      expect(spec?.unique, game).toBe(true);
      expect(spec?.key, game).toEqual({ tx: 1 });
      expect(spec?.partialFilterExpression, game).toEqual({ tx: { $type: "string" } });

      // Index thật sự chặn 2 vé cùng tx — listIndexes một mình không chứng minh điều này.
      const tx = `${MARKER}-${game}`;
      await coll.deleteMany({ tx, accountId: MARKER });
      await coll.insertOne({ tx, accountId: MARKER, ticketNo: `${MARKER}-${game}` });
      await expect(coll.insertOne({ tx, accountId: MARKER, ticketNo: `${MARKER}-${game}-dup` })).rejects.toMatchObject({
        code: 11000,
      });
      expect(await coll.countDocuments({ tx, accountId: MARKER })).toBe(1);
    }
  });

  // #23
  it("#23 generateTx không còn trên DebitPlayerService", () => {
    const service = new DebitPlayerService();
    expect((service as unknown as Record<string, unknown>).generateTx).toBeUndefined();
  });
});
