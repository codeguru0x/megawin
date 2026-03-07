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
import type { SettleContextWithFinancials } from "./types";
import { AppException } from "@megawin/shared/errors";

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
  SettleContextWithFinancials,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: SettleContextWithFinancials): Promise<FinalizeSettleResult> {
    const { drawId, isSplitCycle, jackpotOpeningAmount, financials } = input;
    const { closingJackpot, splitDetails } = financials;

    // ── STEP A: Transition draw settling → settled + ghi jackpot snapshot ──
    const updated = await this.drawRepo.settleComplete(drawId, {
      openingAmount: jackpotOpeningAmount,
      closingAmount: closingJackpot,
      isSplitCycle: isSplitCycle || undefined,
    });

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Settled) {
        console.log(`Draw ${drawId} already settled, skipping transition.`);
      } else {
        throw AppException.internal(
          `Cannot finalize draw ${drawId}. Current status: ${draw?.status}`,
        );
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
  private async updateJackpotCycle(input: SettleContextWithFinancials): Promise<void> {
    const { drawId, isSplitCycle, jackpotOpeningAmount, financials } = input;
    const { closingJackpot, hasJackpotWinner, splitDetails, jackpotContribution } = financials;

    const activeCycle = await this.cycleRepo.getActiveCycle();
    if (!activeCycle) return;

    // jackpotContribution đã được tính bởi CalculateFinancials và lưu trong financials.
    // KHÔNG cần re-fetch draw document để lấy draw.financial.jackpotContribution.
    const contribution = jackpotContribution;
    const newDrawCount = activeCycle.drawCount + 1;

    const splitExecuted = isSplitCycle && splitDetails != null;
    const shouldCloseCycle = hasJackpotWinner || splitExecuted;

    if (shouldCloseCycle) {
      // ── NHÁNH ①: ĐÓNG CYCLE ──

      let winners = undefined;
      if (hasJackpotWinner) {
        const jackpotEntries = await this.entryRepo.findJackpotWinners(drawId);

        // Tổng giải Jackpot = opening + contribution kỳ này.
        // Lý do: contribution kỳ này ban đầu sẽ tích luỹ vào pool, nhưng khi có winner
        // → cycle đóng lại → contribution này thuộc về giải thưởng (không vào cycle mới).
        // closingJackpot = seedAmount (reset), tức contribution đã "bị tiêu" vào giải.
        const totalJackpotPrize = jackpotOpeningAmount + contribution;

        // Chia đều cho tất cả winners (làm tròn xuống để không vượt quá pool).
        // Phần dư do làm tròn nằm lại quỹ công ty (không đáng kể).
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
        // totalWinners: tổng số người trúng qua tất cả tier tham gia split (tier1-tier5).
        // totalPaid: tổng tiền thực chi = Σ(bonusPerWinner × winnerCount), đã làm tròn.
        //   Có thể nhỏ hơn splitAmount (= activeCycle.currentAmount) một chút do làm tròn.
        let totalWinners = 0;
        let totalPaid = 0;
        for (const tier of Object.values(splitDetails)) {
          totalWinners += tier.winnerCount;
          totalPaid += tier.bonusPerWinner * tier.winnerCount;
        }

        // splitAmount = activeCycle.currentAmount tại thời điểm settle kỳ này.
        // Đây chính là jackpotOpeningAmount (đã đọc từ cycle lúc PrepareSettle).
        // Không dùng jackpotOpeningAmount từ context vì activeCycle.currentAmount
        // là giá trị chính xác nhất (có thể có minor drift nếu updateCycleStats chạy nhiều lần).
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
