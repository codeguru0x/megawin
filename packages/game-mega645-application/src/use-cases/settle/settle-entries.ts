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
 * - Chỉ có main numbers (6 số từ 1-45), không có số đặc biệt.
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
  MainTuple,
  EntryPayout,
  EntryPayoutTier,
  EntryResult,
} from "@megawin/game-mega645/entities";
import { expandAllBoards } from "@megawin/game-mega645/helpers";
import { matchLines, type DrawResultForMatch } from "@megawin/game-mega645/helpers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
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

    // DrawResultForMatch chỉ cần winningMain — cast MainTuple từ string[].
    const drawResult: DrawResultForMatch = {
      winningMain: result.winningMain as any,
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

      // settleOps: dùng EntryPayout + EntryResult từ entity layer
      // để bulkSettleEntries type-safe, không cần `as any`.
      const settleOps: Array<{
        entryId: string;
        payout: EntryPayout;
        outcome: string;
        result: EntryResult;
      }> = [];

      for (const entry of entries) {
        // ── Bước 2: Expand boards → danh sách lines đầy đủ ──────────────────
        // Boards đã được snapshot vào entry lúc place-bet — không cần fetch ticket.
        // expandAllBoards xử lý bao5 / bao7-18 → sinh ra nhiều combinations.
        const lines = expandAllBoards(entry.entrySummary.boards as any);

        // ── Bước 3: Match lines vs kết quả quay ──────────────────────────────
        // matchLines trả về { perLineResults, tierCounts }:
        //   - perLineResults[i]: { mainMatchCount, tier } cho từng line.
        //   - tierCounts: Map<tier, số line trúng hạng đó>.
        const matchResult = matchLines(lines, drawResult);

        // ── Bước 4: Tạo line documents để persist ────────────────────────────
        // Ghi lại chi tiết từng line: số chọn + kết quả match + tiền thưởng.
        // Jackpot winAmount = 0 tại đây; FinalizeSettle cập nhật sau.
        const lineDocs: Array<Omit<TicketLineDoc, "_id">> = lines.map((line, i) => {
          const perLine = matchResult.perLineResults[i]!;
          const unitAmount = perLine.tier != null ? (prizeAmounts[perLine.tier] ?? 0) : 0;

          return {
            // Các field identity copy từ entry (snapshot lúc place-bet).
            tenantId: entry.tenantId,
            accountId: entry.accountId,
            username: entry.username,
            ticketId: entry.ticketId,
            entryId: entry.id,
            drawId: entry.drawId,
            // Chi tiết line.
            boardNo: line.boardNo,
            lineIndex: line.lineIndex,
            main: line.main,
            matchResult: {
              mainMatchCount: perLine.mainMatchCount,
              tier: perLine.tier,
              // Jackpot: ghi 0, FinalizeSettle sẽ điền sau khi biết pool cuối kỳ.
              winAmount: perLine.tier === PrizeTier.Jackpot ? 0 : unitAmount,
            },
            createdAt: now,
          };
        });

        // upsert (không insert trùng nếu chạy lại sau crash).
        await this.lineRepo.upsertLines(lineDocs);

        // ── Bước 5: Tổng hợp payout cho entry ────────────────────────────────
        // Tổng hợp từ tierCounts → danh sách EntryPayoutTier.
        const payoutTiers = buildPayoutTiers(matchResult.tierCounts, prizeAmounts);

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
            winningMain: result.winningMain as unknown as MainTuple,
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
 * Chuyển `tierCounts` (Map từ matchLines) thành danh sách `EntryPayoutTier`
 * để ghi vào `entry.payout.tiers`.
 *
 * Jackpot: unitAmount = 0 và amount = 0 ở đây. PatchJackpotPrize sẽ cập nhật
 * sau khi tính được pool Jackpot cuối kỳ và số winners thực tế.
 * Dù amount = 0, entry vẫn được đánh dấu outcome = "win" nếu hitCount > 0.
 *
 * @param tierCounts  Map<tier, số line trúng> — output của matchLines.
 * @param prizeAmounts  Bảng tiền thưởng cố định: tier → VND.
 */
function buildPayoutTiers(
  tierCounts: Map<string, number>,
  prizeAmounts: Record<string, number>,
): EntryPayoutTier[] {
  const tiers: EntryPayoutTier[] = [];

  for (const [tier, hitCount] of tierCounts) {
    if (hitCount === 0) continue;

    if (tier === PrizeTier.Jackpot) {
      // Jackpot: placeholder amount = 0, FinalizeSettle điền sau.
      tiers.push({
        tier: tier as EntryPayoutTier["tier"],
        hitCount,
        unitAmount: 0,
        amount: 0,
      });
      continue;
    }

    // Giải cố định: amount = unitAmount × số line trúng.
    const unitAmount = prizeAmounts[tier] ?? 0;
    tiers.push({
      tier: tier as EntryPayoutTier["tier"],
      hitCount,
      unitAmount,
      amount: unitAmount * hitCount,
    });
  }

  return tiers;
}
