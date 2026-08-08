/**
 * Lotto 5/35 – Integration test: PatchJackpotPrize + ApplySplitBonuses betCount hardening
 *
 * Test tích hợp thật với DB staging DÙNG CHUNG (không mock, không ephemeral).
 * TUYỆT ĐỐI KHÔNG `deleteMany`/`drop*` — theo quy tắc `00-overview.md` §"QUY TẮC TEST
 * TRÊN DB STAGING CHUNG". Cách li bằng drawId ngẫu nhiên (năm quá khứ xa, không trùng
 * draw thật) + accountId ngẫu nhiên; mỗi `it` seed data riêng, KHÔNG cleanup, KHÔNG
 * assert count/tồn tại toàn collection — chỉ assert trên docs mình vừa seed (query theo
 * unique key vừa sinh). Settle collections không có TTL → cô lập hoàn toàn bằng key ngẫu
 * nhiên là đủ (xem plan `p0-00-jackpot-betcount-hardening.plan.md`).
 *
 * ## Nguồn gốc — review chéo bug Mega 6/45 (xem `mega645-fix-jackpot-betcount.plan.md`)
 *
 * Lotto 5/35 KHÔNG dính 4 lỗi chia JP theo betCount của Mega 6/45 (xem bảng đối chiếu
 * trong plan p0-00), nhưng thiếu lưới regression cho đúng case đã sinh ra bug đó:
 * 1 entry multi-board có NHIỀU JP line với betCount khác nhau. Test này khoá hành vi
 * đúng hiện tại + hành vi mới sau hardening (V3 — winners dùng 1 nguồn số với entry patch).
 *
 * ## Các case
 *
 * 1. Chuẩn (regression): 2 entry × 1 board standard, betCount 3 + 1.
 * 2. Multi-board multi-line JP (case bug Mega 6/45): 1 entry 2 JP line (betCount 2 + 5).
 * 3. specialCover sinh JP line: betCount tính vào mẫu số bất kể play type nguồn gốc.
 * 4. Split path (ApplySplitBonuses): 1 entry trúng tier1 qua 2 board (betCount 2 + 3).
 * 5. Idempotency/retry: chạy execute 2 lần + giả lập crash giữa chừng (lines đã patch).
 * 6. Split chạy 2 lần → không push tier trùng, không double winAmount ($nor guard).
 * 7. betUnitsByEntry thiếu 1 entryId (bất thường dữ liệu) → winners prizeAmount = 0.
 */

import { describe, it, expect, vi } from "vitest";
import { ObjectId, Long } from "mongodb";
import { EntryRepository } from "../../src/infras/repos/entry-repo";
import { LineRepository } from "../../src/infras/repos/line-repo";
import { PatchJackpotPrizeUseCase } from "../../src/use-cases/settle/patch-jackpot-prize";
import { ApplySplitBonusesUseCase } from "../../src/use-cases/settle/apply-split-bonuses";
import type { SettleContext, SettleFinancials } from "../../src/use-cases/settle/types";
import { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-lotto535/entities/enums";
import type { EntryPayoutTier, TicketLineDoc } from "@megawin/game-lotto535/entities";

const entryRepo = new EntryRepository();
const lineRepo = new LineRepository();
const patchJackpotUseCase = new PatchJackpotPrizeUseCase();
const applySplitUseCase = new ApplySplitBonusesUseCase();

// ─── Helpers ─────────────────────────────────────────────

/**
 * Sinh 1 drawId giả KHÔNG trùng draw thật — năm quá khứ xa ngẫu nhiên (1900-1999),
 * ngày/số hiệu ngẫu nhiên. Không gian đủ lớn để mỗi `it` độc lập, không cần cleanup.
 */
function randomPastDrawId(): string {
  const year = 1900 + Math.floor(Math.random() * 100);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
  const seq = String(1 + Math.floor(Math.random() * 999)).padStart(3, "0");
  return `${year}-${month}-${day}.${seq}`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Tier JP chưa patch (hitCount > 0, amount = 0) — trạng thái sau SettleEntries. */
function jpTierPending(hitCount: number, betUnitCount: number): EntryPayoutTier {
  return { tier: PrizeTier.Jackpot, hitCount, betUnitCount, unitAmount: 0, amount: 0 };
}

/** Tier thường (tier1-tier5) chưa có split bonus — trạng thái sau SettleEntries. */
function fixedTierSettled(
  tier: PrizeTier,
  hitCount: number,
  betUnitCount: number,
  unitAmount: number,
): EntryPayoutTier {
  return { tier, hitCount, betUnitCount, unitAmount, amount: unitAmount * betUnitCount };
}

/** Seed 1 entry Settled + Win với payout.tiers tuỳ biến. Trả về hex id. */
async function seedEntry(params: {
  drawId: string;
  financialDate: string;
  tiers: EntryPayoutTier[];
  accountSuffix: string;
}): Promise<string> {
  const _id = new ObjectId();
  const winAmount = params.tiers.reduce((s, t) => s + t.amount, 0);
  await entryRepo.insertMany([
    {
      _id,
      tenantId: "tenantTest",
      accountId: `acc-${params.accountSuffix}`,
      username: `user-${params.accountSuffix}`,
      ticketId: new ObjectId().toHexString(),
      drawId: params.drawId,
      financialDate: params.financialDate,
      tenant: { commissionRate: 0.2, commissionAmount: 0 },
      status: EntryStatus.Settled,
      lineCount: params.tiers.reduce((s, t) => s + t.hitCount, 0),
      betUnitCount: params.tiers.reduce((s, t) => s + t.betUnitCount, 0),
      amount: 60_000,
      unitPrice: 10_000,
      entrySummary: { ticketNo: `L535-TEST-${params.accountSuffix}`, boards: [] },
      outcome: EntryOutcome.Win,
      payout: {
        winAmount,
        payoutAmount: winAmount,
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

/** Seed 1 line cho entry — winAmount = 0 (trạng thái sau SettleEntries, chưa patch). */
async function seedLine(params: {
  drawId: string;
  financialDate: string;
  entryId: string;
  lineIndex: number;
  tier: PrizeTier | null;
  betCount: number;
  accountSuffix: string;
}): Promise<void> {
  const line: Omit<TicketLineDoc, "_id"> = {
    tenantId: "tenantTest",
    accountId: `acc-${params.accountSuffix}`,
    username: `user-${params.accountSuffix}`,
    ticketId: new ObjectId().toHexString(),
    entryId: params.entryId,
    drawId: params.drawId,
    financialDate: params.financialDate,
    boardNo: "A",
    lineIndex: params.lineIndex,
    main: ["01", "02", "03", "04", "05"],
    special: "07",
    betCount: params.betCount,
    matchResult: {
      mainMatchCount: params.tier === PrizeTier.Jackpot ? 5 : 3,
      specialMatched: params.tier === PrizeTier.Jackpot,
      tier: params.tier,
      winAmount: 0,
    },
    createdAt: new Date(),
  };
  await lineRepo.upsertLines([line]);
}

/** Build SettleContext tối thiểu cho PatchJackpotPrizeUseCase.execute. */
function buildJackpotInput(params: {
  drawId: string;
  jackpotOpeningAmount: number;
  jackpotContribution: number;
}): SettleContext {
  return {
    drawId: params.drawId,
    jackpotOpeningAmount: params.jackpotOpeningAmount,
    financials: {
      jackpotContribution: params.jackpotContribution,
    } as SettleFinancials,
  } as unknown as SettleContext;
}

/** Build SettleContext tối thiểu cho ApplySplitBonusesUseCase.execute. */
function buildSplitInput(params: { drawId: string; splitDetails: SettleFinancials["splitDetails"] }): SettleContext {
  return {
    drawId: params.drawId,
    financials: {
      splitDetails: params.splitDetails,
    } as SettleFinancials,
  } as unknown as SettleContext;
}

// ─────────────────────────────────────────────
// PatchJackpotPrize — chia theo betCount (regression)
// ─────────────────────────────────────────────

describe("Lotto 5/35 – PatchJackpotPrize", () => {
  it("Case 1 — 2 entry × 1 board standard (betCount 3 + 1) → chia đúng tỷ lệ, line khớp entry", async () => {
    const drawId = randomPastDrawId();
    const financialDate = drawId.slice(0, 10);
    const sfx = randomSuffix();

    // totalBetUnits = 3 + 1 = 4 → perUnit = floor(40M / 4) = 10_000_000.
    const entryA = await seedEntry({
      drawId,
      financialDate,
      tiers: [jpTierPending(1, 3)],
      accountSuffix: `A-${sfx}`,
    });
    const entryB = await seedEntry({
      drawId,
      financialDate,
      tiers: [jpTierPending(1, 1)],
      accountSuffix: `B-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryA,
      lineIndex: 0,
      tier: PrizeTier.Jackpot,
      betCount: 3,
      accountSuffix: `A-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryB,
      lineIndex: 0,
      tier: PrizeTier.Jackpot,
      betCount: 1,
      accountSuffix: `B-${sfx}`,
    });

    const result = await patchJackpotUseCase.run(
      buildJackpotInput({ drawId, jackpotOpeningAmount: 40_000_000, jackpotContribution: 0 }),
    );

    expect(result.entriesPatched).toBe(2);
    expect(result.winners).toHaveLength(2);

    const perUnit = Math.floor(40_000_000 / 4); // 10_000_000
    const docA = await entryRepo.getEntryById(entryA);
    const docB = await entryRepo.getEntryById(entryB);
    const tierA = docA!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot)!;
    const tierB = docB!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot)!;

    expect(tierA.unitAmount).toBe(perUnit);
    expect(tierA.amount).toBe(perUnit * 3);
    expect(tierB.amount).toBe(perUnit * 1);
    expect(docA!.payout!.winAmount).toBe(perUnit * 3);

    const { lines: linesA } = await lineRepo.getLinesByEntryId(entryA);
    const sumLinesA = linesA.reduce((s, l) => s + l.matchResult.winAmount, 0);
    expect(sumLinesA).toBe(tierA.amount);

    const winnerA = result.winners.find((w) => w.entryId === entryA)!;
    expect(winnerA.prizeAmount).toBe(perUnit * 3);
  });

  it("Case 2 — 1 entry 2 JP line (betCount 2 + 5, case bug Mega 6/45) → cộng dồn, line-level đúng", async () => {
    const drawId = randomPastDrawId();
    const financialDate = drawId.slice(0, 10);
    const sfx = randomSuffix();

    // Entry multi-board: 2 JP line (betCount 2 + 5). Entry khác: 1 JP line betCount 1.
    // totalBetUnits = 2 + 5 + 1 = 8 → perUnit = floor(40M / 8) = 5_000_000.
    const entryMulti = await seedEntry({
      drawId,
      financialDate,
      tiers: [jpTierPending(2, 7)], // hitCount = 2 line vật lý, betUnitCount = 2+5
      accountSuffix: `MULTI-${sfx}`,
    });
    const entrySingle = await seedEntry({
      drawId,
      financialDate,
      tiers: [jpTierPending(1, 1)],
      accountSuffix: `SINGLE-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryMulti,
      lineIndex: 0,
      tier: PrizeTier.Jackpot,
      betCount: 2,
      accountSuffix: `MULTI-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryMulti,
      lineIndex: 1,
      tier: PrizeTier.Jackpot,
      betCount: 5,
      accountSuffix: `MULTI-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entrySingle,
      lineIndex: 0,
      tier: PrizeTier.Jackpot,
      betCount: 1,
      accountSuffix: `SINGLE-${sfx}`,
    });

    const result = await patchJackpotUseCase.run(
      buildJackpotInput({ drawId, jackpotOpeningAmount: 40_000_000, jackpotContribution: 0 }),
    );

    const perUnit = Math.floor(40_000_000 / 8); // 5_000_000
    const docMulti = await entryRepo.getEntryById(entryMulti);
    const tierMulti = docMulti!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot)!;
    expect(tierMulti.amount).toBe(perUnit * 7); // (2 + 5) × perUnit
    expect(tierMulti.unitAmount).toBe(perUnit);

    // Line-level: mỗi line = perUnit × betCount của CHÍNH line đó.
    const { lines } = await lineRepo.getLinesByEntryId(entryMulti);
    const winAmounts = lines.map((l) => l.matchResult.winAmount).sort((a, b) => a - b);
    expect(winAmounts).toEqual([perUnit * 2, perUnit * 5]);
    // Σ lines = entry amount (bất biến line↔entry).
    expect(winAmounts.reduce((s, w) => s + w, 0)).toBe(tierMulti.amount);

    // winners[].prizeAmount dùng CHÍNH betUnitsByEntry (V3) — khớp entry patch.
    const winnerMulti = result.winners.find((w) => w.entryId === entryMulti)!;
    expect(winnerMulti.prizeAmount).toBe(perUnit * 7);
    expect(winnerMulti.prizeAmount).toBe(tierMulti.amount);
  });

  it("Case 3 — JP line sinh từ specialCover (betCount 4) tính vào mẫu số như mọi play type khác", async () => {
    const drawId = randomPastDrawId();
    const financialDate = drawId.slice(0, 10);
    const sfx = randomSuffix();

    // PatchJackpotPrize KHÔNG biết/không cần biết play type nguồn gốc của line — chỉ
    // đọc matchResult.tier + betCount. Test khẳng định line "specialCover" (betCount 4)
    // được cộng vào mẫu số totalBetUnits giống mọi line khác.
    // totalBetUnits = 4 (specialCover) + 1 (standard) = 5 → perUnit = floor(50M/5)=10M.
    const entrySpecial = await seedEntry({
      drawId,
      financialDate,
      tiers: [jpTierPending(1, 4)],
      accountSuffix: `SPECIAL-${sfx}`,
    });
    const entryStandard = await seedEntry({
      drawId,
      financialDate,
      tiers: [jpTierPending(1, 1)],
      accountSuffix: `STD-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entrySpecial,
      lineIndex: 0,
      tier: PrizeTier.Jackpot,
      betCount: 4,
      accountSuffix: `SPECIAL-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryStandard,
      lineIndex: 0,
      tier: PrizeTier.Jackpot,
      betCount: 1,
      accountSuffix: `STD-${sfx}`,
    });

    const result = await patchJackpotUseCase.run(
      buildJackpotInput({ drawId, jackpotOpeningAmount: 50_000_000, jackpotContribution: 0 }),
    );

    const perUnit = Math.floor(50_000_000 / 5); // 10_000_000
    const docSpecial = await entryRepo.getEntryById(entrySpecial);
    const tierSpecial = docSpecial!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot)!;
    expect(tierSpecial.amount).toBe(perUnit * 4);

    const winnerSpecial = result.winners.find((w) => w.entryId === entrySpecial)!;
    expect(winnerSpecial.prizeAmount).toBe(perUnit * 4);
  });

  it("Case 5 — idempotency: chạy execute 2 lần → winners/amount không đổi", async () => {
    const drawId = randomPastDrawId();
    const financialDate = drawId.slice(0, 10);
    const sfx = randomSuffix();

    const entryA = await seedEntry({
      drawId,
      financialDate,
      tiers: [jpTierPending(1, 4)],
      accountSuffix: `IDEM-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryA,
      lineIndex: 0,
      tier: PrizeTier.Jackpot,
      betCount: 4,
      accountSuffix: `IDEM-${sfx}`,
    });

    const input = buildJackpotInput({
      drawId,
      jackpotOpeningAmount: 40_000_000,
      jackpotContribution: 0,
    });

    const run1 = await patchJackpotUseCase.run(input);
    const run2 = await patchJackpotUseCase.run(input);

    const perUnit = Math.floor(40_000_000 / 4);
    expect(run1.winners).toHaveLength(1);
    expect(run2.winners).toHaveLength(1);
    expect(run2.winners[0]!.prizeAmount).toBe(run1.winners[0]!.prizeAmount);

    const docA = await entryRepo.getEntryById(entryA);
    expect(docA!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot)!.amount).toBe(perUnit * 4);
  });

  it("Case 5b — crash-sim: lines đã patch HẾT trước, entries chưa → execute VẪN patch entry đúng", async () => {
    const drawId = randomPastDrawId();
    const financialDate = drawId.slice(0, 10);
    const sfx = randomSuffix();

    // totalBetUnits = 3 + 1 = 4 → perUnit = 10_000_000.
    const entryA = await seedEntry({
      drawId,
      financialDate,
      tiers: [jpTierPending(1, 3)],
      accountSuffix: `CRASH-A-${sfx}`,
    });
    const entryB = await seedEntry({
      drawId,
      financialDate,
      tiers: [jpTierPending(1, 1)],
      accountSuffix: `CRASH-B-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryA,
      lineIndex: 0,
      tier: PrizeTier.Jackpot,
      betCount: 3,
      accountSuffix: `CRASH-A-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryB,
      lineIndex: 0,
      tier: PrizeTier.Jackpot,
      betCount: 1,
      accountSuffix: `CRASH-B-${sfx}`,
    });

    const perUnit = Math.floor(40_000_000 / 4); // 10_000_000

    // Giả lập crash SAU khi lines đã patch nhưng TRƯỚC khi entries patch: patch tay
    // TẤT CẢ lines với perUnit đúng (như lần chạy 1 đã làm xong bước lines).
    await lineRepo.patchJackpotLineWinAmount(drawId, perUnit);

    // Mẫu số đọc TẤT CẢ JP lines (không filter winAmount:0) → deterministic dù lines
    // đã patch trước — đây là điểm hardening V.comment ghi rõ trong patch-jackpot-prize.ts.
    const result = await patchJackpotUseCase.run(
      buildJackpotInput({ drawId, jackpotOpeningAmount: 40_000_000, jackpotContribution: 0 }),
    );

    expect(result.winners).toHaveLength(2);
    const docA = await entryRepo.getEntryById(entryA);
    const tierA = docA!.payout!.tiers.find((t) => t.tier === PrizeTier.Jackpot)!;
    expect(tierA.amount).toBe(perUnit * 3); // KHÔNG còn 0.
    expect(tierA.unitAmount).toBe(perUnit);
  });

  it("Case 7 — entry có JP tier nhưng KHÔNG có JP line khớp (bất thường dữ liệu) → prizeAmount = 0, log warn", async () => {
    const drawId = randomPastDrawId();
    const financialDate = drawId.slice(0, 10);
    const sfx = randomSuffix();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // entryOrphan: có payout.tiers[jackpot] pending nhưng KHÔNG seed line nào cho nó
    // (mô phỏng bất thường dữ liệu: SettleEntries ghi tier nhưng line bị mất/lỗi ghi).
    const entryOrphan = await seedEntry({
      drawId,
      financialDate,
      tiers: [jpTierPending(1, 1)],
      accountSuffix: `ORPHAN-${sfx}`,
    });
    // entryNormal cung cấp mẫu số hợp lệ để jackpotPerUnit > 0.
    const entryNormal = await seedEntry({
      drawId,
      financialDate,
      tiers: [jpTierPending(1, 2)],
      accountSuffix: `NORMAL-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryNormal,
      lineIndex: 0,
      tier: PrizeTier.Jackpot,
      betCount: 2,
      accountSuffix: `NORMAL-${sfx}`,
    });

    const result = await patchJackpotUseCase.run(
      buildJackpotInput({ drawId, jackpotOpeningAmount: 20_000_000, jackpotContribution: 0 }),
    );

    const winnerOrphan = result.winners.find((w) => w.entryId === entryOrphan)!;
    expect(winnerOrphan).toBeDefined();
    expect(winnerOrphan.prizeAmount).toBe(0);
    expect(Number.isNaN(winnerOrphan.prizeAmount)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(entryOrphan));

    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// ApplySplitBonuses — chia split bonus theo betCount
// ─────────────────────────────────────────────

describe("Lotto 5/35 – ApplySplitBonuses", () => {
  it("Case 4 — 1 entry trúng tier1 qua 2 board (betCount 2 + 3) → bonus = bonusPerUnit × 5", async () => {
    const drawId = randomPastDrawId();
    const financialDate = drawId.slice(0, 10);
    const sfx = randomSuffix();
    const bonusPerUnit = 1_000_000;

    // Entry đã settle tier1 base (unitAmount 10M, betUnitCount 5 = 2+3, amount 50M).
    const entryA = await seedEntry({
      drawId,
      financialDate,
      tiers: [fixedTierSettled(PrizeTier.Tier1, 2, 5, 10_000_000)],
      accountSuffix: `SPLIT-A-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryA,
      lineIndex: 0,
      tier: PrizeTier.Tier1,
      betCount: 2,
      accountSuffix: `SPLIT-A-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryA,
      lineIndex: 1,
      tier: PrizeTier.Tier1,
      betCount: 3,
      accountSuffix: `SPLIT-A-${sfx}`,
    });

    const result = await applySplitUseCase.run(
      buildSplitInput({
        drawId,
        splitDetails: {
          [PrizeTier.Tier1]: {
            initialAmount: 0,
            redistributedAmount: 0,
            totalAmount: bonusPerUnit * 5,
            winnerCount: 1,
            bonusPerWinner: bonusPerUnit,
          },
        },
      }),
    );

    expect(result.entriesPatched).toBe(1);

    const docA = await entryRepo.getEntryById(entryA);
    const splitTier = docA!.payout!.tiers.find((t) => t.tier === PrizeTier.Tier1 && t.isSplitBonus === true)!;
    expect(splitTier).toBeDefined();
    expect(splitTier.unitAmount).toBe(bonusPerUnit);
    expect(splitTier.amount).toBe(bonusPerUnit * 5);

    const baseTier = docA!.payout!.tiers.find((t) => t.tier === PrizeTier.Tier1 && !t.isSplitBonus)!;
    expect(baseTier.amount).toBe(50_000_000); // base tier1 KHÔNG bị đổi.
    expect(docA!.payout!.winAmount).toBe(50_000_000 + bonusPerUnit * 5);
  });

  it("Case 6 — chạy applySplitBonuses 2 lần → KHÔNG duplicate tier, KHÔNG double winAmount", async () => {
    const drawId = randomPastDrawId();
    const financialDate = drawId.slice(0, 10);
    const sfx = randomSuffix();
    const bonusPerUnit = 2_000_000;

    const entryA = await seedEntry({
      drawId,
      financialDate,
      tiers: [fixedTierSettled(PrizeTier.Tier2, 1, 1, 5_000_000)],
      accountSuffix: `SPLIT2-A-${sfx}`,
    });
    await seedLine({
      drawId,
      financialDate,
      entryId: entryA,
      lineIndex: 0,
      tier: PrizeTier.Tier2,
      betCount: 1,
      accountSuffix: `SPLIT2-A-${sfx}`,
    });

    const input = buildSplitInput({
      drawId,
      splitDetails: {
        [PrizeTier.Tier2]: {
          initialAmount: 0,
          redistributedAmount: 0,
          totalAmount: bonusPerUnit,
          winnerCount: 1,
          bonusPerWinner: bonusPerUnit,
        },
      },
    });

    const run1 = await applySplitUseCase.run(input);
    const run2 = await applySplitUseCase.run(input);

    expect(run1.entriesPatched).toBe(1);
    expect(run2.entriesPatched).toBe(0); // $nor guard — lần 2 không có entry nào match.

    const docA = await entryRepo.getEntryById(entryA);
    const splitTiers = docA!.payout!.tiers.filter((t) => t.tier === PrizeTier.Tier2 && t.isSplitBonus === true);
    expect(splitTiers).toHaveLength(1); // KHÔNG duplicate.
    expect(docA!.payout!.winAmount).toBe(5_000_000 + bonusPerUnit); // KHÔNG double.
  });
});
