/**
 * Use Case: Settle Entries (Batch) — Mega 6/45
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TỔNG QUAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Xử lý settle theo batch trong vòng lặp `while` có giới hạn thời gian
 * MAX_EXECUTION_MS. Mỗi iteration:
 *   1. Query batch entries có status = "scheduled" (BATCH_SIZE).
 *   2. Với mỗi entry: expand boards → match lines vs kết quả quay → upsert lines.
 *   3. Tính winAmount, payoutTiers, outcome từ kết quả match.
 *   4. Thu thập settle ops → bulkSettle toàn batch trong 1 lần ghi.
 *
 * CRASH-SAFE:
 * Luôn query lại status = "scheduled" đầu mỗi vòng lặp → nếu process crash
 * giữa chừng, entry chưa settled sẽ được xử lý lại ở lần chạy tiếp theo.
 * bulkSettle filter theo status = "scheduled" nên không thể double-settle.
 *
 * MEGA 6/45 — ĐẶC ĐIỂM:
 * - Chỉ có numbers (6 số từ 1-45), không có số đặc biệt.
 * - Jackpot ghi amount = 0 tại bước này; FinalizeSettle cập nhật sau khi biết
 *   chính xác số winners và pool Jackpot cuối kỳ.
 * - Không có Split Cycle (khác Power 6/55).
 *
 * KHÔNG CẦN FETCH TICKET:
 * Toàn bộ thông tin cần thiết (tenantId, accountId, username, ticketId, boards)
 * đã được snapshot vào entry khi tạo (place-bet). Không cần JOIN ticket.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier, PayoutStatus } from "@megawin/game-mega645/entities";
import type {
  TicketLineDoc,
  EntryPayout,
  EntryPayoutTier,
  EntryResult,
  PrizeAmounts,
} from "@megawin/game-mega645/entities";
import { expandAllBoards } from "@megawin/game-mega645/helpers";
import { matchLines, type DrawResultForMatch } from "@megawin/game-mega645/helpers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { SettleContext } from "./types";
import { EntryOutcome } from "@megawin/game-core/entities";

/** Số entry xử lý mỗi vòng lặp. Giữ nhỏ để tránh timeout Lambda và OOM. */
const BATCH_SIZE = 500;

/**
 * Thời gian tối đa 1 lần chạy use case (ms).
 * Step Function gọi lại nếu trả về `done: false`.
 */
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SettleEntriesBatchResult {
  done: boolean;
}

export class SettleEntriesBatchUseCase extends InternalUseCase<
  SettleContext,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();

  protected async execute(input: SettleContext): Promise<SettleEntriesBatchResult> {
    const { drawId, result, prizeAmounts } = input;

    // DrawResultForMatch chỉ cần winningNumbers — string[] từ DB, tương thích trực tiếp.
    const drawResult: DrawResultForMatch = {
      winningNumbers: result.winningNumbers,
    };

    const startTime = Date.now();

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      // ── Bước 1: Lấy batch entries chưa settle ──────────────────────────────
      // Luôn query lại từ DB để đảm bảo crash-safe (idempotent).
      const entries = await this.entryRepo.getScheduledEntries(drawId, BATCH_SIZE);

      if (entries.length === 0) {
        // Tất cả entries đã được settle → báo done.
        return { done: true };
      }

      const now = new Date();

      // settleOps: dùng EntryPayout + EntryResult + EntryOutcome từ entity layer
      // → bulkSettleEntries type-safe, không cần `as any`.
      const settleOps: Array<{
        entryId: string;
        payout: EntryPayout;
        outcome: EntryOutcome;
        result: EntryResult;
      }> = [];

      for (const entry of entries) {
        // ── Bước 2: Expand boards → danh sách lines đầy đủ ──────────────────
        // Boards đã được snapshot vào entry lúc place-bet — không cần fetch ticket.
        // expandAllBoards xử lý bao5 / bao7-18 → sinh ra nhiều combinations.
        const lines = expandAllBoards(entry.entrySummary.boards);

        // ── Bước 2b: Build betCount map ──────────────────────────────────────
        // boardNo → betCount: mỗi board có betCount riêng (multiplier).
        const betCountByBoard = new Map<string, number>();
        for (const b of entry.entrySummary.boards) {
          betCountByBoard.set(b.boardNo, b.betCount);
        }

        // ── Bước 3: Match lines vs kết quả quay ──────────────────────────────
        // matchLines trả về { perLineResults, tierCounts }:
        //   - perLineResults[i]: { matchCount, tier } cho từng line.
        //   - tierCounts: Map<tier, số line trúng hạng đó>.
        const matchResult = matchLines(lines, drawResult);

        // ── Bước 4: Tạo line documents để persist ────────────────────────────
        // Ghi lại chi tiết từng line: số chọn + kết quả match + tiền thưởng.
        // Jackpot winAmount = 0 tại đây; PatchJackpotPrize cập nhật sau.
        // Giải cố định: winAmount = unitAmount × betCount (của board chứa line).
        const lineDocs: Array<Omit<TicketLineDoc, "_id">> = lines.map((line, i) => {
          const perLine = matchResult.perLineResults[i]!;
          const unitAmount = getFixedPrizeAmount(perLine.tier, prizeAmounts);
          const betCount = betCountByBoard.get(line.boardNo)!;

          return {
            tenantId: entry.tenantId,
            accountId: entry.accountId,
            username: entry.username,
            ticketId: entry.ticketId,
            entryId: entry.id,
            drawId: entry.drawId,
            financialDate: entry.financialDate,
            boardNo: line.boardNo,
            lineIndex: line.lineIndex,
            numbers: line.numbers,
            betCount,
            matchResult: {
              matchCount: perLine.matchCount,
              tier: perLine.tier,
              // Jackpot: ghi 0, PatchJackpotPrize sẽ điền sau khi biết pool cuối kỳ.
              // Giải cố định: winAmount = unitAmount × betCount.
              winAmount: perLine.tier === PrizeTier.Jackpot ? 0 : unitAmount * betCount,
            },
            createdAt: now,
          };
        });

        // upsert (không insert trùng nếu chạy lại sau crash).
        await this.lineRepo.upsertLines(lineDocs);

        // ── Bước 5: Tổng hợp payout cho entry ────────────────────────────────
        // Build payout tiers từ lineDocs đã có betCount trong winAmount.
        // Multi-board ticket: board A betCount=1, board B betCount=3
        // → mỗi line có betCount khác nhau, không thể dùng flat tierCounts × betCount.
        const payoutTiers = buildPayoutTiersFromLines(lineDocs, prizeAmounts);

        // winAmount = tổng tiền các hạng giải (Jackpot đóng góp 0 ở đây).
        const winAmount = payoutTiers.reduce((sum, t) => sum + t.amount, 0);
        // Entry win nếu có giải cố định HOẶC trúng Jackpot (dù winAmount = 0 lúc này).
        // tierCounts chỉ chứa tier có count > 0 → .has() đủ, O(1) Map lookup.
        const hasWin = winAmount > 0 || matchResult.tierCounts.has(PrizeTier.Jackpot);

        settleOps.push({
          entryId: entry.id,
          payout: {
            winAmount,
            payoutAmount: winAmount,
            tiers: payoutTiers,
            settledAt: now,
            // payoutStatus = "pending" chỉ khi có tiền thưởng thực (> 0).
            // Jackpot winner: winAmount = 0 lúc này → sẽ được set bởi FinalizeSettle.
            payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
          } satisfies EntryPayout,
          outcome: hasWin ? EntryOutcome.Win : EntryOutcome.Loss,
          result: {
            winningNumbers: result.winningNumbers,
            publishedAt: now,
          } satisfies EntryResult,
        });
      }

      // ── Bước 6: Bulk settle toàn batch ───────────────────────────────────
      // 1 lần ghi cho toàn batch → giảm round-trips.
      // bulkSettleEntries filter status = "scheduled" → an toàn khi chạy lại.
      if (settleOps.length > 0) {
        await this.entryRepo.bulkSettleEntries(settleOps);
      }
    }

    // Hết thời gian MAX_EXECUTION_MS → Step Function sẽ gọi lại use case này.
    return { done: false };
  }
}

/**
 * Trả về giá trị giải cố định cho tier. Jackpot → 0 (xử lý bởi FinalizeSettle).
 *
 * Tách hàm riêng để tránh dùng `as keyof` cast không an toàn tại call-site.
 */
function getFixedPrizeAmount(tier: PrizeTier | null, prizeAmounts: PrizeAmounts): number {
  if (tier === PrizeTier.Tier1) return prizeAmounts.tier1;
  if (tier === PrizeTier.Tier2) return prizeAmounts.tier2;
  if (tier === PrizeTier.Tier3) return prizeAmounts.tier3;
  // Jackpot hoặc null: giải tích luỹ — FinalizeSettle tính sau khi biết pool + số winners.
  return 0;
}

/**
 * Build payout tiers từ line docs đã có winAmount (đã nhân betCount).
 *
 * Multi-board ticket: board A betCount=1, board B betCount=3
 * → mỗi line có betCount khác nhau, không thể dùng flat tierCounts.
 * Aggregate: group by tier → sum winAmount → derive hitCount + unitAmount.
 *
 * hitCount = số LINES trúng (không nhân betCount).
 * amount = tổng thưởng đã nhân betCount.
 * Jackpot: amount = 0, PatchJackpotPrize điền sau.
 */
function buildPayoutTiersFromLines(
  lineDocs: Array<Omit<TicketLineDoc, "_id">>,
  prizeAmounts: PrizeAmounts,
): EntryPayoutTier[] {
  const tierMap = new Map<string, { hitCount: number; totalAmount: number }>();

  for (const line of lineDocs) {
    const { tier, winAmount } = line.matchResult;
    if (tier == null) continue;

    const existing = tierMap.get(tier) ?? { hitCount: 0, totalAmount: 0 };
    existing.hitCount += 1;
    existing.totalAmount += winAmount;
    tierMap.set(tier, existing);
  }

  const tiers: EntryPayoutTier[] = [];
  for (const [tier, data] of tierMap) {
    if (tier === PrizeTier.Jackpot) {
      // Jackpot: placeholder amount = 0, PatchJackpotPrize điền sau.
      tiers.push({
        tier: tier as PrizeTier,
        hitCount: data.hitCount,
        unitAmount: 0,
        amount: 0,
      });
    } else {
      const unitAmount = getFixedPrizeAmount(tier as PrizeTier, prizeAmounts);
      tiers.push({
        tier: tier as PrizeTier,
        hitCount: data.hitCount,
        unitAmount,
        amount: data.totalAmount,
      });
    }
  }

  return tiers;
}
