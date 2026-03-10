/**
 * Use Case: Finalize Settle (Power 6/55)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TỔNG QUAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Bước cuối của settle pipeline: chuyển draw status settling → settled,
 * ghi dual jackpot snapshot vào DrawDoc (atomic, 1 query), cập nhật JackpotCycle.
 * CRASH-SAFE + IDEMPOTENT.
 *
 * Power 6/55 có DUAL JACKPOT (JP1: 6/6, JP2: 5/6 + bonus). JP1 và JP2 hoạt
 * động ĐỘC LẬP: JP1 winner không ảnh hưởng JP2 và ngược lại.
 *
 * Power 6/55 KHÔNG có Split Cycle — theo luật Vietlott gốc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JACKPOT KHI CÓ WINNER
 * ─────────────────────────────────────────────────────────────────────────────
 * totalJp1Prize = jp1OpeningAmount + jackpot1Contribution
 * totalJp2Prize = jp2OpeningAmount + jackpot2Contribution
 *   → Winner nhận toàn bộ pool tích luỹ + contribution kỳ này.
 *   → Nhiều winners: chia đều = floor(totalPrize / số winners).
 *
 * Close reasons: jackpot1_winner | jackpot2_winner | both_winner.
 * Cycle mới: seed từ input.config (snapshot). JP không có winner → tiếp tục tích luỹ.
 *
 * RETRY DETECTION:
 *   - findClosedByEndDrawId: nếu đã closed → chỉ ensureNextCycleExists.
 *   - closeCycle filter status = "active" → idempotent (no-op nếu đã closed).
 *   - createCycle guard getActiveCycle() → skip nếu đã tạo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JACKPOT KHI KHÔNG CÓ WINNER (roll-over)
 * ─────────────────────────────────────────────────────────────────────────────
 * DrawDoc.jackpot.closingJp1/2 = opening + contribution (snapshot quỹ JP cuối kỳ).
 * updateCycleStats dùng snapshot drawCount từ PrepareSettle → idempotent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { JackpotCycleClosedReason } from "@megawin/game-power655/entities";
import { JackpotCycleClosedReasons } from "@megawin/game-power655/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { SettleContextWithFinancials } from "./types";

export interface FinalizeSettleResult {
  /** ID kỳ quay đã finalize. */
  drawId: string;
  /** Trạng thái mới sau finalize (= "settled"). */
  status: string;
  /** Số dư Jackpot 1 cuối kỳ (VND). */
  closingJp1: number;
  /** Số dư Jackpot 2 cuối kỳ (VND). */
  closingJp2: number;
  /** Thời điểm hoàn thành settle (ISO 8601). */
  completedAt: string;
}

/**
 * Bước cuối của settle pipeline Power 6/55: chuyển draw settling → settled,
 * ghi dual jackpot snapshot, cập nhật JackpotCycle.
 *
 * CRASH-SAFE + IDEMPOTENT: mọi bước đều idempotent — chạy lại an toàn sau crash.
 *
 * RETRY DETECTION cho winner flow:
 *   - findClosedByEndDrawId: nếu đã có closed cycle → chỉ đảm bảo active cycle tồn tại.
 *   - closeCycle filter status = "active" → idempotent (no-op nếu đã closed).
 *   - createCycle guard getActiveCycle() → skip nếu đã tạo.
 *
 * ROLL-OVER idempotent:
 *   - updateCycleStats dùng snapshot drawCount từ PrepareSettle
 *     (cycleDrawCountBefore + 1) thay vì activeCycle.drawCount + 1.
 *   → chạy lại nhiều lần cho kết quả giống nhau.
 */
export class FinalizeSettleUseCase extends InternalUseCase<
  SettleContextWithFinancials,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();

  protected async execute(input: SettleContextWithFinancials): Promise<FinalizeSettleResult> {
    const { drawId, jp1OpeningAmount, jp2OpeningAmount, financials } = input;
    const { hasJackpot1Winner, hasJackpot2Winner } = financials;
    const closingJp1 = jp1OpeningAmount + financials.jackpot1Contribution;
    const closingJp2 = jp2OpeningAmount + financials.jackpot2Contribution;

    // ── Bước 1: Transition draw settling → settled + ghi dual jackpot snapshot ──
    // settleComplete filter status = "settling" → idempotent (no-op nếu đã settled).
    const updated = await this.drawRepo.settleComplete(drawId, {
      openingJackpot1: jp1OpeningAmount,
      closingJackpot1: closingJp1,
      openingJackpot2: jp2OpeningAmount,
      closingJackpot2: closingJp2,
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

    // ── Bước 2: Cập nhật JackpotCycle ─────────────────────────────────────────
    await this.updateJackpotCycle(input);

    return {
      drawId,
      status: DrawStatus.Settled,
      closingJp1,
      closingJp2,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Cập nhật jackpot cycle sau settle (dual JP1 + JP2).
   *
   * Winner flow (crash-safe):
   *   1. findClosedByEndDrawId(drawId) → nếu đã closed (retry) → chỉ ensureNextCycle.
   *   2. getActiveCycle → lấy cycle hiện tại.
   *   3. closeCycle (filter status=active → idempotent).
   *   4. ensureNextCycleExists (guard getActiveCycle → idempotent).
   *
   * Roll-over flow (idempotent):
   *   - updateCycleStats dùng snapshot cycleDrawCountBefore từ PrepareSettle:
   *     drawCount = cycleDrawCountBefore + 1 (tuyệt đối)
   *   → chạy lại nhiều lần cho kết quả giống nhau.
   */
  private async updateJackpotCycle(input: SettleContextWithFinancials): Promise<void> {
    const { drawId, jp1OpeningAmount, jp2OpeningAmount, financials } = input;
    const { hasJackpot1Winner, hasJackpot2Winner } = financials;

    const shouldCloseCycle = hasJackpot1Winner || hasJackpot2Winner;

    if (shouldCloseCycle) {
      // ── Winner flow ─────────────────────────────────────────────────────────

      // Retry detection: nếu đã có closed cycle với endDrawId = drawId
      // → closeCycle đã chạy thành công lần trước → chỉ đảm bảo active cycle tồn tại.
      const alreadyClosed = await this.cycleRepo.findClosedByEndDrawId(drawId);
      if (alreadyClosed) {
        console.log(
          `Cycle ${alreadyClosed.cycleNo} already closed for draw ${drawId}, ensuring next cycle exists.`,
        );
        await this.ensureNextCycleExists(drawId, input);
        return;
      }

      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) return;

      await this.closeAndCreateNextCycle(activeCycle, input);
    } else {
      // ── Roll-over flow ──────────────────────────────────────────────────────
      // Không có winner: tích luỹ tiếp JP1 và JP2.
      // Dùng snapshot cycleDrawCountBefore từ PrepareSettle thay vì activeCycle.drawCount
      // → idempotent khi retry (không cộng dồn 2 lần).
      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) return;

      await this.cycleRepo.updateCycleStats({
        cycleNo: input.config.cycleNo,
        jackpot1Current: jp1OpeningAmount + financials.jackpot1Contribution,
        jackpot2Current: jp2OpeningAmount + financials.jackpot2Contribution,
        drawCount: input.config.cycleDrawCountBefore + 1,
        lastSettledDrawId: drawId,
      });
    }
  }

  /**
   * Đóng cycle hiện tại + tạo cycle mới.
   *
   * Power 6/55 đặc biệt: JP1 và JP2 hoạt động độc lập.
   * JP không có winner → seed cycle mới = opening + contribution kỳ này.
   *
   * closeCycle idempotent: filter status = "active" → nếu đã closed thì no-op.
   * ensureNextCycleExists: kiểm tra active cycle trước khi tạo → không duplicate.
   */
  private async closeAndCreateNextCycle(
    activeCycle: { cycleNo: number; jackpot1Current: number; jackpot2Current: number },
    input: SettleContextWithFinancials,
  ): Promise<void> {
    const { drawId, jp1OpeningAmount, jp2OpeningAmount, financials } = input;
    const { hasJackpot1Winner, hasJackpot2Winner, jackpot1Contribution, jackpot2Contribution } =
      financials;

    // ── Xác định close reason ──────────────────────────────────────────────
    let closedReason: JackpotCycleClosedReason;
    if (hasJackpot1Winner && hasJackpot2Winner) {
      closedReason = JackpotCycleClosedReasons.BothWinner;
    } else if (hasJackpot1Winner) {
      closedReason = JackpotCycleClosedReasons.Jackpot1Winner;
    } else {
      closedReason = JackpotCycleClosedReasons.Jackpot2Winner;
    }

    // ── finalJp1/finalJp2: toàn bộ pool đã trao cho winner ────────────────
    const finalJp1 = hasJackpot1Winner
      ? jp1OpeningAmount + jackpot1Contribution
      : activeCycle.jackpot1Current;
    const finalJp2 = hasJackpot2Winner
      ? jp2OpeningAmount + jackpot2Contribution
      : activeCycle.jackpot2Current;

    // ── Đóng cycle (idempotent: filter status = "active") ──
    await this.cycleRepo.closeCycle({
      cycleNo: activeCycle.cycleNo,
      endDrawId: drawId,
      closedReason,
      finalJp1,
      finalJp2,
      // jackpotWinners từ PatchJackpotPrize qua settleCtx — tránh re-query DB.
      winners: input.jackpotWinners,
    });

    // ── Tạo cycle mới ──
    await this.ensureNextCycleExists(drawId, input);
  }

  /**
   * Đảm bảo có active cycle cho draw tiếp theo.
   * createCycle có guard findOne({ status: "active" }) → skip nếu đã tồn tại (idempotent).
   *
   * Seed logic (JP độc lập):
   *   - JP có winner → reset về seedAmount (config snapshot).
   *   - JP không có winner → tiếp tục tích luỹ từ opening + contribution.
   */
  private async ensureNextCycleExists(
    drawId: string,
    input: SettleContextWithFinancials,
  ): Promise<void> {
    const existingActive = await this.cycleRepo.getActiveCycle();
    if (existingActive) return;

    const nextDraw = await this.drawRepo.findNextPendingDraw(drawId);
    if (!nextDraw) return;

    const { hasJackpot1Winner, hasJackpot2Winner } = input.financials;
    const closingJp1 = input.jp1OpeningAmount + input.financials.jackpot1Contribution;
    const closingJp2 = input.jp2OpeningAmount + input.financials.jackpot2Contribution;

    await this.cycleRepo.createCycle({
      startDrawId: nextDraw.drawId,
      // Nếu JP winner → seed từ config snapshot. Nếu không → tiếp tục từ closing amount.
      jp1SeedAmount: hasJackpot1Winner ? input.config.jp1SeedAmount : closingJp1,
      jp2SeedAmount: hasJackpot2Winner ? input.config.jp2SeedAmount : closingJp2,
    });
  }
}
