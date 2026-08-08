/**
 * Use Case: Finalize Settle (Mega 6/45)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TỔNG QUAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Bước cuối của settle pipeline: chuyển draw status settling → settled,
 * ghi jackpot snapshot vào DrawDoc (atomic, 1 query), cập nhật JackpotCycle.
 * CRASH-SAFE + IDEMPOTENT.
 *
 * Mega 6/45 theo luật Vietlott: KHÔNG có Split Cycle.
 * Cycle chỉ đóng khi có winner hoặc manual_reset.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JACKPOT KHI CÓ WINNER
 * ─────────────────────────────────────────────────────────────────────────────
 * totalJackpotPrize = jackpotOpeningAmount + jackpotContribution
 *   → Winner nhận toàn bộ pool tích luỹ + contribution kỳ này.
 *   → Nhiều winners: chia đều = floor(totalJackpotPrize / số winners).
 *
 * closeCycle với finalAmount = totalJackpotPrize (ghi lịch sử Jackpot đã trao).
 * Cycle mới bắt đầu từ seedAmount (lấy từ settleCtx.config).
 *
 * RETRY DETECTION cho winner flow:
 *   - findClosedByEndDrawId: nếu đã có closed cycle → chỉ đảm bảo active cycle tồn tại.
 *   - closeCycle filter status = "active" → idempotent (no-op nếu đã closed).
 *   - createCycle guard getActiveCycle() → skip nếu đã tạo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JACKPOT KHI KHÔNG CÓ WINNER (roll-over)
 * ─────────────────────────────────────────────────────────────────────────────
 * DrawDoc.jackpot.closingAmount = openingAmount + contribution (snapshot quỹ JP cuối kỳ).
 * updateCycleStats dùng giá trị snapshot từ PrepareSettle → idempotent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { JackpotCycleCloseReason } from "@megawin/game-mega645/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { JackpotCycleEntryRepository } from "../../infras/repos/jackpot-cycle-entry-repo";
import type { SettleConfig, SettleContextWithFinancials } from "./types";

export interface FinalizeSettleResult {
  /** ID kỳ quay đã hoàn tất settle. */
  drawId: string;
  /** Trạng thái sau khi hoàn tất (= "settled"). */
  status: string;
  /** Giá trị quỹ jackpot cuối kỳ (VND) = openingAmount + contribution. */
  closingJackpot: number;
  /** Thời điểm hoàn tất settle (ISO datetime). */
  completedAt: string;
}

/**
 * Bước cuối của settle pipeline Mega 6/45: chuyển draw settling → settled,
 * ghi jackpot snapshot, cập nhật JackpotCycle.
 *
 * CRASH-SAFE + IDEMPOTENT: mọi bước đều idempotent — chạy lại an toàn sau crash.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JACKPOT KHI CÓ WINNER
 * ─────────────────────────────────────────────────────────────────────────────
 * totalJackpotPrize = jackpotOpeningAmount + jackpotContribution
 *   → Winner nhận toàn bộ pool tích luỹ + contribution kỳ này.
 *   → Nhiều winners: chia đều = floor(totalJackpotPrize / số winners).
 *
 * RETRY DETECTION cho winner flow:
 *   - findClosedByEndDrawId: nếu đã có closed cycle → chỉ đảm bảo active cycle tồn tại.
 *   - closeCycle filter status = "active" → idempotent (no-op nếu đã closed).
 *   - createCycle guard getActiveCycle() → skip nếu đã tạo.
 *
 * JACKPOT KHI KHÔNG CÓ WINNER (roll-over)
 * ─────────────────────────────────────────────────────────────────────────────
 * closingAmount = openingAmount + contribution → tích luỹ sang kỳ sau.
 * updateCycleStats dùng giá trị tuyệt đối (không cộng dồn từ activeCycle) → idempotent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CYCLE LEDGER + RESETTLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Bước 2 LUÔN upsert 1 entry vào mega645_jackpot_cycle_entries (cả settle lần đầu
 * lẫn resettle) — single source of truth opening/closing per-draw.
 * Khi có `resettleContext`:
 *   - skipCycleUpdate=true (Type B1/B2) → BỎ QUA updateJackpotCycle (DBA chốt cycle).
 *   - cascadeOpeningUpdate=true (cascade B2) → upsertEntry ghi đè openingJp ledger.
 */
export class FinalizeSettleUseCase extends InternalUseCase<SettleContextWithFinancials, FinalizeSettleResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly cycleEntryRepo = new JackpotCycleEntryRepository();

  protected async execute(input: SettleContextWithFinancials): Promise<FinalizeSettleResult> {
    const { drawId, jackpotOpeningAmount, financials, resettleContext } = input;
    const closingAmount = jackpotOpeningAmount + financials.jackpotContribution;

    // ── Bước 1: Chuyển draw status settling → settled + ghi jackpot snapshot ──
    // settleComplete filter status = "settling" → idempotent (no-op nếu đã settled).
    const updated = await this.drawRepo.settleComplete(drawId, {
      openingAmount: jackpotOpeningAmount,
      closingAmount,
    });

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Settled) {
        console.log(`Draw ${drawId} đã được hoàn tất, bỏ qua chuyển trạng thái.`);
      } else {
        throw AppException.internal(`Không thể hoàn tất draw ${drawId}. Trạng thái hiện tại: ${draw?.status}`);
      }
    }

    // ── Bước 2: Upsert Cycle Ledger entry (luôn chạy — cả lần đầu lẫn resettle) ──
    // Ghi/cập nhật immutable record per-draw vào mega645_jackpot_cycle_entries.
    // `seq` = cycleDrawCountBefore + 1 = vị trí kỳ này trong cycle (1-based).
    // Settle lần đầu: upsert tạo entry mới.
    // Resettle Type A: upsert cập nhật entry cũ (jpContribution mới, hasJpWinner mới,
    //   closingJp mới) — openingJp KHÔNG đổi ($setOnInsert giữ nguyên).
    // Cascade B2: cascadeOpeningUpdate=true → ghi đè cả openingJp (= closing kỳ trước).
    await this.cycleEntryRepo.upsertEntry(
      {
        cycleNo: input.config.cycleNo,
        drawId,
        drawNo: input.drawNo,
        seq: input.config.cycleDrawCountBefore + 1,
        openingJp: jackpotOpeningAmount,
        jpContribution: financials.jackpotContribution,
        closingJp: closingAmount,
        hasJpWinner: financials.hasJackpotWinner,
        settledAt: new Date(),
      },
      // Cascade B2 (kỳ T+n): opening = closing kỳ trước vừa đổi → ghi đè opening
      // trong ledger thay vì giữ $setOnInsert. Các trường hợp khác: opening bất biến.
      resettleContext?.cascadeOpeningUpdate ?? false,
    );

    // ── Bước 3: Cập nhật JackpotCycle ─────────────────────────────────────────
    // skipCycleUpdate = true (Type B1/B2): DBA can thiệp cycle thủ công → bỏ qua.
    // skipCycleUpdate = false hoặc undefined (Type A + settle lần đầu): cập nhật bình thường.
    if (resettleContext?.skipCycleUpdate) {
      console.log(
        `[Resettle] skipCycleUpdate=true (scenario=${resettleContext.scenario}) → bỏ qua updateJackpotCycle. DBA sẽ cập nhật cycle thủ công.`,
      );
    } else {
      await this.updateJackpotCycle(input);
    }

    return {
      drawId,
      status: DrawStatus.Settled,
      closingJackpot: closingAmount,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Cập nhật jackpot cycle sau settle.
   *
   * Winner flow (crash-safe):
   *   1. findClosedByEndDrawId(drawId) → nếu đã closed (retry) → chỉ ensureNextCycle.
   *   2. getActiveCycle → lấy cycle hiện tại.
   *   3. closeCycle (filter status=active → idempotent).
   *   4. ensureNextCycleExists (guard getActiveCycle → idempotent).
   *
   * Roll-over flow (idempotent):
   *   - updateCycleStats dùng giá trị snapshot từ PrepareSettle:
   *     contribution = cycleContributionBefore + jackpotContribution (tuyệt đối)
   *     drawCount = cycleDrawCountBefore + 1 (tuyệt đối)
   *   → chạy lại nhiều lần cho kết quả giống nhau.
   */
  private async updateJackpotCycle(input: SettleContextWithFinancials): Promise<void> {
    const { drawId, financials } = input;

    if (financials.hasJackpotWinner) {
      // ── Winner flow ─────────────────────────────────────────────────────────

      // Retry detection: nếu đã có closed cycle với endDrawId = drawId
      // → closeCycle đã chạy thành công lần trước → chỉ đảm bảo active cycle tồn tại.
      const alreadyClosed = await this.cycleRepo.findClosedByEndDrawId(drawId);
      if (alreadyClosed) {
        console.log(`Cycle ${alreadyClosed.cycleNo} đã đóng cho draw ${drawId}, đảm bảo cycle tiếp theo tồn tại.`);
        await this.ensureNextCycleExists(drawId, input.config);
        return;
      }

      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) return;

      await this.closeAndCreateNextCycle(activeCycle, input);
    } else {
      // ── Roll-over flow ──────────────────────────────────────────────────────
      // Không có winner: tích luỹ tiếp.
      // Dùng giá trị snapshot từ PrepareSettle (cycleContributionBefore, cycleDrawCountBefore)
      // thay vì đọc lại activeCycle → idempotent khi retry (không cộng dồn 2 lần).
      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) return;

      await this.cycleRepo.updateCycleStats({
        cycleNo: input.config.cycleNo,
        currentAmount: input.jackpotOpeningAmount + financials.jackpotContribution,
        contribution: input.config.cycleContributionBefore + financials.jackpotContribution,
        drawCount: input.config.cycleDrawCountBefore + 1,
        lastSettledDrawId: drawId,
      });
    }
  }

  /**
   * Đóng cycle hiện tại + tạo cycle mới.
   *
   * closeCycle idempotent: filter status = "active" → nếu đã closed thì no-op.
   * ensureNextCycleExists: kiểm tra active cycle trước khi tạo → không duplicate.
   */
  private async closeAndCreateNextCycle(
    activeCycle: { cycleNo: number; currentAmount: number },
    input: SettleContextWithFinancials,
  ): Promise<void> {
    const { drawId, jackpotOpeningAmount, financials } = input;
    const { hasJackpotWinner } = financials;

    const totalJackpotPrize = jackpotOpeningAmount + financials.jackpotContribution;

    // ── Đóng cycle (idempotent: filter status = "active") ──
    await this.cycleRepo.closeCycle({
      cycleNo: activeCycle.cycleNo,
      endDrawId: drawId,
      closeReason: JackpotCycleCloseReason.Winner,
      finalAmount: totalJackpotPrize,
      // cycleDrawCountBefore + 1 = số kỳ bao gồm kỳ đang đóng (tuyệt đối → idempotent khi retry).
      drawCount: input.config.cycleDrawCountBefore + 1,
      winners: hasJackpotWinner ? (input.jackpotWinners ?? []) : undefined,
    });

    // ── Tạo cycle mới ──
    await this.ensureNextCycleExists(drawId, input.config);
  }

  /**
   * Đảm bảo có active cycle cho draw tiếp theo.
   * createCycle có guard findOne({ status: Active }) → skip nếu đã tồn tại (idempotent).
   * Nếu không có draw tiếp → skip (create-draws hoặc prepare-settle sẽ tạo sau).
   */
  private async ensureNextCycleExists(drawId: string, config: SettleConfig): Promise<void> {
    const existingActive = await this.cycleRepo.getActiveCycle();
    if (existingActive) {
      return;
    }

    const nextDraw = await this.drawRepo.findNextPendingDraw(drawId);
    if (!nextDraw) {
      return;
    }

    await this.cycleRepo.createCycle({
      startDrawId: nextDraw.drawId,
      seedAmount: config.seedAmount,
    });
  }
}
