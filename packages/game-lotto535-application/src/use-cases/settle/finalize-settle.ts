/**
 * Use Case: Finalize Settle (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 7 TRONG SETTLE FLOW (BƯỚC CUỐI TRƯỚC DISPATCH PAYOUTS)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Bước cuối cùng trong settle flow (trước payout):
 *   1. Chuyển draw: settling → settled + ghi jackpot snapshot (atomic, 1 query)
 *   2. Cập nhật / đóng jackpot cycle
 *
 * ────────────────────────────────────────────────
 * LOGIC CHÍNH:
 * ────────────────────────────────────────────────
 *
 *   A. TRANSITION DRAW STATUS:
 *      - settling → settled (atomic update với guard status = "settling")
 *      - Ghi jackpot snapshot lên draw:
 *        { openingAmount, closingAmount, isSplitCycle }
 *      - Nếu draw đã settled (retry) → skip, không throw
 *
 *   B. CẬP NHẬT JACKPOT CYCLE:
 *      Có 2 trường hợp:
 *
 *      B1. CÓ WINNER JACKPOT hoặc SPLIT THỰC TẾ (có winner tier1-tier5):
 *          → Đóng cycle hiện tại (closeCycle):
 *            - closeReason: "winner" hoặc "split"
 *            - Ghi finalAmount, winners (nếu có), splitDetail (nếu split)
 *            - Nếu có winner Jackpot: chia đều JP cho winners
 *              (jackpotPerWinner = (openingAmount + contribution) / số winners)
 *            - Nếu split: ghi tierAllocations, totalWinners, totalPaid
 *          → Tạo cycle mới NẾU có draw tiếp theo (startDrawId = next draw):
 *            - Nếu không có draw tiếp → create-draws hoặc prepare-settle sẽ tạo
 *
 *      B2. KHÔNG CÓ WINNER, KHÔNG SPLIT THỰC TẾ:
 *          → Update stats cycle hiện tại (updateCycleStats):
 *            - currentAmount = closingJackpot (tích luỹ = opening + contribution)
 *            - totalContribution += contribution kỳ này
 *            - drawCount += 1
 *            - lastSettledDrawId = drawId
 *
 * ────────────────────────────────────────────────
 * CRASH-SAFE:
 * ────────────────────────────────────────────────
 *   - settleComplete atomic: settling → settled + jackpot snapshot
 *   - Nếu draw đã settled → skip (không throw) → idempotent
 *   - Cycle update idempotent: overwrite stats / close + recreate OK
 *
 * ────────────────────────────────────────────────
 * JACKPOT SOURCE OF TRUTH:
 * ────────────────────────────────────────────────
 *   - Active draws: Jackpot KHÔNG lưu trên draw → đọc từ jackpot_cycles.currentAmount
 *   - Settled draws: snapshot Jackpot được ghi lên draw tại step này (bản ghi lịch sử)
 *   - Kỳ tiếp theo lấy Jackpot opening từ cycle mới (hoặc cycle đã update)
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { JackpotCycleCloseReason } from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { LottoSplitDetails } from "./types";

export interface FinalizeSettleInput {
  /** Mã kỳ quay cần finalize. */
  drawId: string;
  /** Số tiền Jackpot đầu kỳ (VND) — từ PrepareSettle. */
  jackpotOpeningAmount: number;
  /** Số tiền Jackpot cuối kỳ (VND) — từ CalculateFinancials. */
  closingJackpot: number;
  /** Có người trúng Jackpot hay không. */
  hasJackpotWinner: boolean;
  /** Kỳ này có phải kỳ chia Jackpot hay không. */
  isSplitCycle: boolean;
  /** Chi tiết phân bổ split — chỉ có khi isSplitCycle = true VÀ có winner tier1-tier5. */
  splitDetails?: LottoSplitDetails;
}

export interface FinalizeSettleResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Trạng thái sau finalize (= "settled"). */
  status: string;
  /** Số tiền Jackpot cuối kỳ (VND). */
  closingJackpot: number;
  /** Thời điểm hoàn thành settle (ISO 8601). */
  completedAt: string;
}

export class FinalizeSettleUseCase extends InternalUseCase<
  FinalizeSettleInput,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: FinalizeSettleInput): Promise<FinalizeSettleResult> {
    const { drawId, closingJackpot, hasJackpotWinner, isSplitCycle, splitDetails } = input;

    // ── STEP A: Transition draw settling → settled + ghi jackpot snapshot ──
    const updated = await this.drawRepo.settleComplete(drawId, {
      openingAmount: input.jackpotOpeningAmount,
      closingAmount: closingJackpot,
      isSplitCycle: isSplitCycle || undefined,
    });

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Settled) {
        console.log(`Draw ${drawId} already settled, skipping transition.`);
      } else {
        throw new Error(`Cannot finalize draw ${drawId}. Current status: ${draw?.status}`);
      }
    }

    // ── STEP B: Cập nhật Jackpot Cycle ──
    await this.updateJackpotCycle(input);

    return {
      drawId,
      status: DrawStatus.Settled,
      closingJackpot,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Cập nhật jackpot cycle sau settle.
   *
   * 2 nhánh logic:
   *   ① Có winner Jackpot hoặc split thực tế → ĐÓNG cycle
   *      + tạo cycle MỚI nếu có draw tiếp theo (không gap cho player)
   *   ② Không có winner → UPDATE stats cycle hiện tại (tích luỹ)
   *
   * Nếu không có draw tiếp theo, cycle mới sẽ được tạo bởi create-draws
   * hoặc prepare-settle (safety net).
   */
  private async updateJackpotCycle(input: FinalizeSettleInput): Promise<void> {
    const { drawId, closingJackpot, hasJackpotWinner, isSplitCycle, splitDetails } = input;

    const activeCycle = await this.cycleRepo.getActiveCycle();
    if (!activeCycle) return;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) return;

    const contribution = draw.financial?.jackpotContribution ?? 0;
    const newDrawCount = activeCycle.drawCount + 1;

    const splitExecuted = isSplitCycle && splitDetails != null;
    const shouldCloseCycle = hasJackpotWinner || splitExecuted;

    if (shouldCloseCycle) {
      // ── NHÁNH ①: ĐÓNG CYCLE ──

      let winners = undefined;
      if (hasJackpotWinner) {
        const jackpotEntries = await this.entryRepo.findJackpotWinners(drawId);
        // Winner nhận opening + contribution kỳ này (toàn bộ giá trị JP)
        const totalJackpotPrize = input.jackpotOpeningAmount + contribution;
        const jackpotPerWinner =
          jackpotEntries.length > 0 ? Math.floor(totalJackpotPrize / jackpotEntries.length) : 0;
        winners = jackpotEntries.map((e) => ({
          accountId: e.accountId,
          tenantId: e.tenantId,
          prizeAmount: jackpotPerWinner,
          entryId: e.id,
          drawId,
        }));
      }

      let splitDetail = undefined;
      if (splitExecuted && splitDetails) {
        let totalWinners = 0;
        let totalPaid = 0;
        for (const tier of Object.values(splitDetails)) {
          totalWinners += tier.winnerCount;
          totalPaid += tier.bonusPerWinner * tier.winnerCount;
        }
        splitDetail = {
          splitAmount: activeCycle.currentAmount,
          tierAllocations: Object.fromEntries(
            Object.entries(splitDetails).map(([tier, d]) => [
              tier,
              {
                winnerCount: d.winnerCount,
                bonusPerWinner: d.bonusPerWinner,
                totalAmount: d.totalAmount,
              },
            ]),
          ),
          totalWinners,
          totalPaid,
        };
      }

      await this.cycleRepo.closeCycle({
        cycleNo: activeCycle.cycleNo,
        endDrawId: drawId,
        closeReason: hasJackpotWinner
          ? JackpotCycleCloseReason.Winner
          : JackpotCycleCloseReason.Split,
        finalAmount: activeCycle.currentAmount,
        splitDetail,
        winners,
      });

      // Tạo cycle mới chỉ khi có draw tiếp theo (startDrawId chính xác).
      // Nếu không có draw tiếp → create-draws hoặc prepare-settle sẽ tạo sau.
      const nextDraw = await this.drawRepo.findNextPendingDraw(drawId);
      if (nextDraw) {
        const globalConfig = await this.getGlobalConfig.run();
        await this.cycleRepo.createCycle({
          startDrawId: nextDraw.drawId,
          seedAmount: globalConfig.jackpot.seedAmount,
          config: {
            splitThreshold: globalConfig.jackpot.splitThreshold,
            splitRatios: globalConfig.jackpot.splitRatios,
          },
        });
      }
    } else {
      // ── NHÁNH ②: UPDATE STATS ──
      await this.cycleRepo.updateCycleStats({
        cycleNo: activeCycle.cycleNo,
        currentAmount: closingJackpot,
        contribution: activeCycle.totalContribution + contribution,
        drawCount: newDrawCount,
        lastSettledDrawId: drawId,
      });
    }
  }
}
