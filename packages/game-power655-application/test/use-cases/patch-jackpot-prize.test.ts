/**
 * Power 6/55 – Integration test: PatchJackpotPrize retry-safe idempotency
 *
 * Test tích hợp thật với DB (không mock) — theo tiền lệ `stats-repos-idempotency.test.ts`.
 * Dùng `drawId` giả lập RÕ RÀNG không trùng draw thật (`9999-...`), cleanup CHỈ theo
 * `TEST_DRAW_ID` ở `beforeAll` + `afterAll` — TUYỆT ĐỐI không `deleteMany({})` (bài học
 * sự cố xoá tenant config 06/08).
 *
 * ## Bug được cover (xem plan power655-fix-jackpot-idempotency)
 *
 * Trước fix: mẫu số `totalBetUnits` + winners đọc từ `getJackpotWinningLines`
 * (filter `winAmount: 0` → chỉ lines CHƯA patch). SFN retry sau crash giữa chừng
 * (lines đã patch, entries chưa) → mẫu số co lại / rỗng → entries trúng JP bị bỏ
 * sót vĩnh viễn hoặc chia perUnit phình to. Sau fix: đọc `getAllJackpotLines`
 * (tất cả line JP) → deterministic.
 *
 * ## Các case
 *
 * 1. Chuẩn (regression): 2 entry × 1 line JP1, betCount 3 + 1.
 * 2. Multi-line bao: 1 entry 2 line JP1 (betCount 2+5) + 1 entry 1 line (betCount 1).
 * 3. Crash-sim (chính): lines đã patch trước, entries chưa → execute vẫn patch entry đúng.
 * 4. Crash-sim partial: patch tay 1/3 lines → mẫu số KHÔNG co lại.
 * 5. Idempotency thuần: chạy execute 2 lần → winners/amount không đổi.
 * 6. JP1 + JP2 cùng kỳ: 2 tier tính mẫu số độc lập.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { ObjectId, Long } from "mongodb";
import { EntryRepository } from "../../src/infras/repos/entry-repo";
import { LineRepository } from "../../src/infras/repos/line-repo";
import { PatchJackpotPrizeUseCase } from "../../src/use-cases/settle/patch-jackpot-prize";
import type { SettleContextWithFinancials } from "../../src/use-cases/settle/types";
import { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import { PrizeTier, PlayType, JackpotType } from "@megawin/game-power655/entities";
import type { TicketLineDoc, EntryPayoutTier } from "@megawin/game-power655/entities";

const TEST_DRAW_ID = "9999-01-02.001"; // Không trùng draw thật.
const FINANCIAL_DATE = "9999-01-02";

const entryRepo = new EntryRepository();
const lineRepo = new LineRepository();
const useCase = new PatchJackpotPrizeUseCase();

// ─── Helpers ─────────────────────────────────────────────

/** Tạo 1 tier JP chưa patch (hitCount > 0, amount = 0) — trạng thái sau SettleEntries. */
function jpTierPending(tier: PrizeTier, hitCount: number): EntryPayoutTier {
  return { tier, hitCount, unitAmount: 0, amount: 0 };
}

/**
 * Seed 1 entry trúng JP (Settled + Win + tiers có JP pending) và trả về hex id.
 * Tự sinh _id trước để dùng làm entryId cho lines.
 */
async function seedJpEntry(params: { tiers: EntryPayoutTier[]; accountSuffix: string }): Promise<string> {
  const _id = new ObjectId();
  await entryRepo.insertMany([
    {
      _id,
      tenantId: "tenantTest",
      accountId: `acc-${params.accountSuffix}`,
      username: `user-${params.accountSuffix}`,
      ticketId: new ObjectId().toHexString(),
      drawId: TEST_DRAW_ID,
      financialDate: FINANCIAL_DATE,
      tenant: { commissionRate: 0.2, commissionAmount: 0 },
      status: EntryStatus.Settled,
      lineCount: 1,
      betUnitCount: 1,
      amount: 60_000,
      unitPrice: 10_000,
      entrySummary: { ticketNo: `P655-TEST-${params.accountSuffix}`, boards: [] },
      outcome: EntryOutcome.Win,
      payout: {
        winAmount: 0,
        payoutAmount: 0,
        tiers: params.tiers,
        settledAt: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      version: Long.fromNumber(1),
    } as Record<string, unknown>,
  ]);
  return _id.toHexString();
}

/** Seed 1 line JP cho entry (winAmount = 0 — trạng thái sau SettleEntries). */
async function seedJpLine(params: {
  entryId: string;
  lineIndex: number;
  tier: PrizeTier;
  betCount: number;
  accountSuffix: string;
}): Promise<void> {
  const line: Omit<TicketLineDoc, "_id"> = {
    tenantId: "tenantTest",
    accountId: `acc-${params.accountSuffix}`,
    username: `user-${params.accountSuffix}`,
    ticketId: new ObjectId().toHexString(),
    entryId: params.entryId,
    drawId: TEST_DRAW_ID,
    financialDate: FINANCIAL_DATE,
    boardNo: "A",
    lineIndex: params.lineIndex,
    main: ["01", "02", "03", "04", "05", "06"],
    betCount: params.betCount,
    matchResult: {
      mainMatchCount: params.tier === PrizeTier.Jackpot1 ? 6 : 5,
      bonusMatched: params.tier === PrizeTier.Jackpot2,
      tier: params.tier,
      winAmount: 0,
    },
    createdAt: new Date(),
  };
  await lineRepo.upsertLines([line]);
}

/** Build input tối thiểu cho execute — chỉ các field execute thực đọc. */
function buildInput(params: {
  jp1CurrentAmount: number;
  jp2CurrentAmount: number;
  hasJackpot1Winner: boolean;
  hasJackpot2Winner: boolean;
  jackpot1Contribution: number;
  jackpot2Contribution: number;
}): SettleContextWithFinancials {
  return {
    drawId: TEST_DRAW_ID,
    jp1CurrentAmount: params.jp1CurrentAmount,
    jp2CurrentAmount: params.jp2CurrentAmount,
    financials: {
      hasJackpot1Winner: params.hasJackpot1Winner,
      hasJackpot2Winner: params.hasJackpot2Winner,
      jackpot1Contribution: params.jackpot1Contribution,
      jackpot2Contribution: params.jackpot2Contribution,
    },
  } as unknown as SettleContextWithFinancials;
}

async function cleanup(): Promise<void> {
  await entryRepo.deleteMany({ drawId: TEST_DRAW_ID });
  await lineRepo.deleteMany({ drawId: TEST_DRAW_ID });
}

/**
 * Đọc winAmount các line JP của 1 entry (theo drawId + entryId string — khớp cách
 * seed). KHÔNG dùng getLinesByEntryId vì method đó query entryId bằng ObjectId,
 * trong khi lines seed lưu entryId dạng hex string.
 */
async function readLineWinAmounts(entryId: string): Promise<number[]> {
  const docs = await lineRepo.findManyAsDocuments(
    { drawId: TEST_DRAW_ID, entryId },
    { projection: { "matchResult.winAmount": 1 } },
  );
  return docs.map((d) => (d.matchResult as { winAmount: number }).winAmount);
}

beforeAll(cleanup);
afterAll(cleanup);

// Mỗi case tự tạo baseline sạch — không phụ thuộc thứ tự chạy giữa các it.
async function resetBeforeEach(): Promise<void> {
  await cleanup();
}

describe("PatchJackpotPrize — chia theo betCount (regression)", () => {
  it("2 entry × 1 line JP1 (betCount 3 + 1) → chia đúng tỷ lệ, line khớp entry", async () => {
    await resetBeforeEach();

    // totalPool = 40_000_000; totalBetUnits = 4 → perUnit = 10_000_000.
    const entryA = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot1, 1)],
      accountSuffix: "A",
    });
    const entryB = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot1, 1)],
      accountSuffix: "B",
    });
    await seedJpLine({
      entryId: entryA,
      lineIndex: 0,
      tier: PrizeTier.Jackpot1,
      betCount: 3,
      accountSuffix: "A",
    });
    await seedJpLine({
      entryId: entryB,
      lineIndex: 0,
      tier: PrizeTier.Jackpot1,
      betCount: 1,
      accountSuffix: "B",
    });

    const result = await useCase.run(
      buildInput({
        jp1CurrentAmount: 40_000_000,
        jp2CurrentAmount: 0,
        hasJackpot1Winner: true,
        hasJackpot2Winner: false,
        jackpot1Contribution: 0,
        jackpot2Contribution: 0,
      }),
    );

    expect(result.jp1EntriesPatched).toBe(2);
    expect(result.winners).toHaveLength(2);

    const perUnit = Math.floor(40_000_000 / 4); // 10_000_000
    const docA = await entryRepo.getEntryById(entryA);
    const docB = await entryRepo.getEntryById(entryB);
    const tierA = docA!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot1)!;
    const tierB = docB!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot1)!;

    expect(tierA.unitAmount).toBe(perUnit);
    expect(tierA.amount).toBe(perUnit * 3);
    expect(tierB.amount).toBe(perUnit * 1);
    expect(docA!.payout!.winAmount).toBe(perUnit * 3);

    // Σ(line.winAmount per entry) = entry.amount
    const winAmountsA = await readLineWinAmounts(entryA);
    const sumLinesA = winAmountsA.reduce((s, w) => s + w, 0);
    expect(sumLinesA).toBe(tierA.amount);

    // winners.prizeAmount đúng theo entry
    const winnerA = result.winners.find((w) => w.entryId === entryA)!;
    expect(winnerA.prizeAmount).toBe(perUnit * 3);
    expect(winnerA.jackpotType).toBe(JackpotType.Jackpot1);
  });

  it("1 entry có 2 line JP1 (betCount 2 + 5) → cộng dồn betCount, line-level đúng", async () => {
    await resetBeforeEach();

    // Entry multi-board: 2 line JP1 (betCount 2 + 5). Entry khác: 1 line betCount 1.
    // totalBetUnits = 2 + 5 + 1 = 8 → perUnit = floor(40M / 8) = 5_000_000.
    const entryMulti = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot1, 2)], // hitCount = 2 line vật lý
      accountSuffix: "MULTI",
    });
    const entrySingle = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot1, 1)],
      accountSuffix: "SINGLE",
    });
    await seedJpLine({
      entryId: entryMulti,
      lineIndex: 0,
      tier: PrizeTier.Jackpot1,
      betCount: 2,
      accountSuffix: "MULTI",
    });
    await seedJpLine({
      entryId: entryMulti,
      lineIndex: 1,
      tier: PrizeTier.Jackpot1,
      betCount: 5,
      accountSuffix: "MULTI",
    });
    await seedJpLine({
      entryId: entrySingle,
      lineIndex: 0,
      tier: PrizeTier.Jackpot1,
      betCount: 1,
      accountSuffix: "SINGLE",
    });

    const result = await useCase.run(
      buildInput({
        jp1CurrentAmount: 40_000_000,
        jp2CurrentAmount: 0,
        hasJackpot1Winner: true,
        hasJackpot2Winner: false,
        jackpot1Contribution: 0,
        jackpot2Contribution: 0,
      }),
    );

    const perUnit = Math.floor(40_000_000 / 8); // 5_000_000
    const docMulti = await entryRepo.getEntryById(entryMulti);
    const tierMulti = docMulti!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot1)!;
    expect(tierMulti.amount).toBe(perUnit * 7); // (2 + 5) × perUnit
    expect(tierMulti.unitAmount).toBe(perUnit);

    // Line-level: mỗi line = perUnit × betCount của CHÍNH line đó.
    const winAmounts = (await readLineWinAmounts(entryMulti)).sort((a, b) => a - b);
    expect(winAmounts).toEqual([perUnit * 2, perUnit * 5]);
    // Σ lines = entry amount (bất biến line↔entry).
    expect(winAmounts.reduce((s, w) => s + w, 0)).toBe(tierMulti.amount);

    const winnerMulti = result.winners.find((w) => w.entryId === entryMulti)!;
    expect(winnerMulti.prizeAmount).toBe(perUnit * 7);
  });
});

describe("PatchJackpotPrize — retry-safe sau crash giữa chừng (bug chính)", () => {
  it("lines đã patch HẾT, entries chưa → execute VẪN patch entry đúng + winners đầy đủ", async () => {
    await resetBeforeEach();

    // totalBetUnits = 3 + 1 = 4 → perUnit = 10_000_000.
    const entryA = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot1, 1)],
      accountSuffix: "A",
    });
    const entryB = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot1, 1)],
      accountSuffix: "B",
    });
    await seedJpLine({
      entryId: entryA,
      lineIndex: 0,
      tier: PrizeTier.Jackpot1,
      betCount: 3,
      accountSuffix: "A",
    });
    await seedJpLine({
      entryId: entryB,
      lineIndex: 0,
      tier: PrizeTier.Jackpot1,
      betCount: 1,
      accountSuffix: "B",
    });

    const perUnit = Math.floor(40_000_000 / 4); // 10_000_000

    // Giả lập crash SAU khi lines đã patch nhưng TRƯỚC khi entries patch:
    // patch tay TẤT CẢ lines với perUnit đúng (như lần chạy 1 đã làm xong lines).
    await lineRepo.patchJackpotLinesPerUnit(TEST_DRAW_ID, PrizeTier.Jackpot1, perUnit);

    // Trước fix: getJackpotWinningLines (filter winAmount:0) trả [] → early-return,
    // entries mãi amount=0. Sau fix: getAllJackpotLines đọc cả line đã patch → đúng.
    const result = await useCase.run(
      buildInput({
        jp1CurrentAmount: 40_000_000,
        jp2CurrentAmount: 0,
        hasJackpot1Winner: true,
        hasJackpot2Winner: false,
        jackpot1Contribution: 0,
        jackpot2Contribution: 0,
      }),
    );

    expect(result.winners).toHaveLength(2);
    const docA = await entryRepo.getEntryById(entryA);
    const tierA = docA!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot1)!;
    expect(tierA.amount).toBe(perUnit * 3); // KHÔNG còn 0.
    expect(tierA.unitAmount).toBe(perUnit);

    const docB = await entryRepo.getEntryById(entryB);
    const tierB = docB!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot1)!;
    expect(tierB.amount).toBe(perUnit * 1);
  });

  it("chỉ 1/3 line đã patch → mẫu số KHÔNG co lại, perUnit vẫn tính trên cả 3 line", async () => {
    await resetBeforeEach();

    // 3 line JP1 betCount 2, 3, 5 (3 entry) → totalBetUnits = 10 → perUnit = 4_000_000.
    const e1 = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot1, 1)],
      accountSuffix: "1",
    });
    const e2 = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot1, 1)],
      accountSuffix: "2",
    });
    const e3 = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot1, 1)],
      accountSuffix: "3",
    });
    await seedJpLine({
      entryId: e1,
      lineIndex: 0,
      tier: PrizeTier.Jackpot1,
      betCount: 2,
      accountSuffix: "1",
    });
    await seedJpLine({
      entryId: e2,
      lineIndex: 0,
      tier: PrizeTier.Jackpot1,
      betCount: 3,
      accountSuffix: "2",
    });
    await seedJpLine({
      entryId: e3,
      lineIndex: 0,
      tier: PrizeTier.Jackpot1,
      betCount: 5,
      accountSuffix: "3",
    });

    const perUnit = Math.floor(40_000_000 / 10); // 4_000_000

    // Patch tay CHỈ line của e1 với perUnit đúng (giả lập crash giữa bulkWrite lines).
    const e1Lines = await lineRepo.findManyAsDocuments(
      { drawId: TEST_DRAW_ID, entryId: e1 },
      { projection: { _id: 1 } },
    );
    const lineE1Id = (e1Lines[0]!._id as ObjectId).toHexString();
    await lineRepo.bulkWrite(
      [
        {
          updateOne: {
            filter: { _id: new ObjectId(lineE1Id) },
            update: { $set: { "matchResult.winAmount": perUnit * 2 } },
          },
        },
      ],
      { ordered: false },
    );

    const result = await useCase.run(
      buildInput({
        jp1CurrentAmount: 40_000_000,
        jp2CurrentAmount: 0,
        hasJackpot1Winner: true,
        hasJackpot2Winner: false,
        jackpot1Contribution: 0,
        jackpot2Contribution: 0,
      }),
    );

    // Tất cả 3 entry phải nhận perUnit tính trên mẫu số = 10 (KHÔNG phải 8 = 10-2).
    expect(result.winners).toHaveLength(3);
    const doc2 = await entryRepo.getEntryById(e2);
    const doc3 = await entryRepo.getEntryById(e3);
    expect(doc2!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot1)!.amount).toBe(perUnit * 3);
    expect(doc3!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot1)!.amount).toBe(perUnit * 5);
    // e1 không bị ghi 0 dù line của nó đã patch trước.
    const doc1 = await entryRepo.getEntryById(e1);
    expect(doc1!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot1)!.amount).toBe(perUnit * 2);
  });
});

describe("PatchJackpotPrize — idempotency thuần + dual jackpot", () => {
  it("chạy execute 2 lần → winners + amount không đổi", async () => {
    await resetBeforeEach();

    const entryA = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot1, 1)],
      accountSuffix: "A",
    });
    await seedJpLine({
      entryId: entryA,
      lineIndex: 0,
      tier: PrizeTier.Jackpot1,
      betCount: 4,
      accountSuffix: "A",
    });

    const input = buildInput({
      jp1CurrentAmount: 40_000_000,
      jp2CurrentAmount: 0,
      hasJackpot1Winner: true,
      hasJackpot2Winner: false,
      jackpot1Contribution: 0,
      jackpot2Contribution: 0,
    });

    const run1 = await useCase.run(input);
    const run2 = await useCase.run(input);

    const perUnit = Math.floor(40_000_000 / 4);
    // Lần 1 patch thật; lần 2 modifiedCount = 0 nhưng winners deterministic vẫn đầy đủ.
    expect(run1.winners).toHaveLength(1);
    expect(run2.winners).toHaveLength(1);
    expect(run2.winners[0]!.prizeAmount).toBe(run1.winners[0]!.prizeAmount);

    const docA = await entryRepo.getEntryById(entryA);
    expect(docA!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot1)!.amount).toBe(perUnit * 4);
  });

  it("JP1 + JP2 cùng kỳ → 2 tier tính mẫu số độc lập", async () => {
    await resetBeforeEach();

    // JP1: 1 entry betCount 2 (pool 40M → perUnit1 = 20M).
    // JP2: 1 entry betCount 3 (pool 30M → perUnit2 = 10M).
    const eJp1 = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot1, 1)],
      accountSuffix: "JP1",
    });
    const eJp2 = await seedJpEntry({
      tiers: [jpTierPending(PrizeTier.Jackpot2, 1)],
      accountSuffix: "JP2",
    });
    await seedJpLine({
      entryId: eJp1,
      lineIndex: 0,
      tier: PrizeTier.Jackpot1,
      betCount: 2,
      accountSuffix: "JP1",
    });
    await seedJpLine({
      entryId: eJp2,
      lineIndex: 0,
      tier: PrizeTier.Jackpot2,
      betCount: 3,
      accountSuffix: "JP2",
    });

    const result = await useCase.run(
      buildInput({
        jp1CurrentAmount: 40_000_000,
        jp2CurrentAmount: 30_000_000,
        hasJackpot1Winner: true,
        hasJackpot2Winner: true,
        jackpot1Contribution: 0,
        jackpot2Contribution: 0,
      }),
    );

    expect(result.jp1EntriesPatched).toBe(1);
    expect(result.jp2EntriesPatched).toBe(1);
    expect(result.winners).toHaveLength(2);

    const docJp1 = await entryRepo.getEntryById(eJp1);
    const docJp2 = await entryRepo.getEntryById(eJp2);
    // perUnit1 = 40M / 2 = 20M → amount = 20M × 2 = 40M.
    expect(docJp1!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot1)!.amount).toBe(40_000_000);
    // perUnit2 = 30M / 3 = 10M → amount = 10M × 3 = 30M.
    expect(docJp2!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot2)!.amount).toBe(30_000_000);

    const wJp1 = result.winners.find((w) => w.jackpotType === JackpotType.Jackpot1)!;
    const wJp2 = result.winners.find((w) => w.jackpotType === JackpotType.Jackpot2)!;
    expect(wJp1.prizeAmount).toBe(40_000_000);
    expect(wJp2.prizeAmount).toBe(30_000_000);
  });
});
