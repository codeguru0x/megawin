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
 * Power 6/55 có DUAL JACKPOT (JP1: 6/6, JP2: 5/6 + bonus).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LUẬT VIETLOTT: VÒNG ĐỜI JACKPOT CYCLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Cycle chỉ đóng khi JP1 có winner (hoặc admin reset).
 * JP2 winner KHÔNG đóng cycle — JP2 reset về seed, JP1 tiếp tục tích lũy.
 * JP2 có thể reset NHIỀU LẦN trong 1 cycle.
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ Sự kiện         │ JP1             │ JP2             │ Đóng cycle? │
 *   ├────────────────────────────────────────────────────────────────────┤
 *   │ JP1 winner      │ Reset → seed    │ Carry over      │ CÓ          │
 *   │ JP1+JP2 winner  │ Reset → seed    │ Reset → seed    │ CÓ          │
 *   │ JP2 winner only │ Tiếp tục        │ Reset → seed    │ KHÔNG       │
 *   │ Không ai trúng  │ Tiếp tục        │ Tiếp tục        │ KHÔNG       │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Khi đóng cycle (JP1 win): cycle mới JP2 seed = closingJp2 (carry over),
 * KHÔNG phải config.jp2SeedAmount, trừ khi cùng kỳ JP2 cũng trúng (BothWinner).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JACKPOT KHI CÓ WINNER
 * ─────────────────────────────────────────────────────────────────────────────
 * totalJp1Prize = jp1CurrentAmount + jackpot1Contribution
 * totalJp2Prize = jp2CurrentAmount + jackpot2Contribution
 *   → Winner nhận toàn bộ pool tích luỹ + contribution kỳ này.
 *   → Nhiều winners: chia đều = floor(totalPrize / số winners).
 *
 * Close reasons: jackpot1_winner | both_winner.
 * (jackpot2_winner đã bị xoá — JP2 winner không đóng cycle)
 *
 * RETRY DETECTION:
 *   JP1 winner flow:
 *     - findClosedByEndDrawId: nếu đã closed → chỉ ensureNextCycleExists.
 *     - closeCycle filter status = "active" → idempotent (no-op nếu đã closed).
 *     - createCycle guard getActiveCycle() → skip nếu đã tạo.
 *
 *   JP2 winner flow (không đóng cycle):
 *     - findCycleWithJp2ResetForDraw: nếu đã reset JP2 → skip resetJp2InCycle.
 *     - resetJp2InCycle guard jackpot2CurrentAmount ≠ jp2SeedAmount → idempotent.
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
import { JackpotCycleClosedReasons, JackpotType } from "@megawin/game-power655/entities";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleEntryRepository } from "../../infras/repos/jackpot-cycle-entry-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
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
 * ghi dual jackpot snapshot, cập nhật JackpotCycle theo luật Vietlott.
 *
 * CRASH-SAFE + IDEMPOTENT: mọi bước đều idempotent — chạy lại an toàn sau crash.
 *
 * RETRY DETECTION:
 *   - JP1 winner: findClosedByEndDrawId → nếu đã có closed cycle → chỉ ensureNextCycleExists.
 *   - JP2 winner: findCycleWithJp2ResetForDraw → nếu đã reset → skip resetJp2InCycle.
 *   - closeCycle filter status = "active" → idempotent (no-op nếu đã closed).
 *   - createCycle guard getActiveCycle() → skip nếu đã tạo.
 *   - resetJp2InCycle guard jackpot2CurrentAmount ≠ seed → idempotent (no-op nếu đã reset).
 */
export class FinalizeSettleUseCase extends InternalUseCase<SettleContextWithFinancials, FinalizeSettleResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly cycleEntryRepo = new JackpotCycleEntryRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: SettleContextWithFinancials): Promise<FinalizeSettleResult> {
    const { drawId, jp1CurrentAmount, jp2CurrentAmount, financials, resettleContext } = input;

    // closingJp1 = JP1 pool cuối kỳ = opening + contribution kỳ này.
    // Nếu có JP1 winner → đây là tổng tiền winner nhận (contribution không bị cap vì overflow
    //   không kích hoạt khi có JP1 winner).
    // Nếu overflow kích hoạt (!JP1 winner, có JP2 winner, JP1 > threshold) → jackpot1Contribution
    //   đã bị trừ jp1Overflow (cap tại threshold), nên closingJp1 = threshold.
    // Nếu không ai trúng → closingJp1 = opening + contribution đầy đủ (JP1 vượt threshold
    //   bình thường, KHÔNG bị cap — theo luật Vietlott "tiếp tục tăng lên").
    const closingJp1 = jp1CurrentAmount + financials.jackpot1Contribution;

    // closingJp2 = JP2 pool cuối kỳ = opening + contribution kỳ này.
    // jackpot2Contribution đã bao gồm jp1Overflow nếu overflow kích hoạt VÀ có JP2 winner
    //   (jp1Overflow chuyển sang JP2 để trao cho JP2 winner).
    // Nếu overflow kích hoạt nhưng không có JP2 winner → jackpot2Contribution không tăng
    //   (jp1Overflow sẽ được hoàn về JP1 kỳ tiếp qua ensureNextCycleExists).
    const closingJp2 = jp2CurrentAmount + financials.jackpot2Contribution;

    // ── Bước 1: Transition draw settling → settled + ghi dual jackpot snapshot ──
    // settleComplete filter status = "settling" → idempotent (no-op nếu đã settled).
    const updated = await this.drawRepo.settleComplete(drawId, {
      openingJackpot1: jp1CurrentAmount,
      closingJackpot1: closingJp1,
      openingJackpot2: jp2CurrentAmount,
      closingJackpot2: closingJp2,
    });

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Settled) {
        console.log(`Kỳ ${drawId} đã được hoàn tất, bỏ qua chuyển trạng thái.`);
      } else {
        throw AppException.internal(`Không thể hoàn tất kỳ ${drawId}. Trạng thái hiện tại: ${draw?.status}`);
      }
    }

    // ── Bước 2: Upsert Cycle Ledger entry (luôn chạy — cả lần đầu lẫn resettle) ──
    // Ghi/cập nhật immutable record per-draw vào JackpotCycleEntries.
    // `seq` = cycleDrawCountBefore + 1 = vị trí kỳ này trong cycle (1-based).
    // Với settle lần đầu: upsert tạo entry mới.
    // Với resettle (Type A): upsert cập nhật entry cũ (contribution mới, winner flag mới,
    //   closingJp1/2 mới) — opening KHÔNG thay đổi ($setOnInsert giữ nguyên).
    await this.cycleEntryRepo.upsertEntry(
      {
        cycleNo: input.config.cycleNo,
        drawId,
        drawNo: input.drawNo,
        seq: input.config.cycleDrawCountBefore + 1,
        openingJp1: jp1CurrentAmount,
        openingJp2: jp2CurrentAmount,
        jp1Contribution: financials.jackpot1Contribution,
        jp2Contribution: financials.jackpot2Contribution,
        jp1Overflow: financials.jp1Overflow,
        closingJp1,
        closingJp2,
        hasJp1Winner: financials.hasJackpot1Winner,
        hasJp2Winner: financials.hasJackpot2Winner,
        jp2DidReset: financials.hasJackpot2Winner,
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
      closingJp1,
      closingJp2,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Cập nhật jackpot cycle sau settle — 4 flow theo luật Vietlott:
   *
   *   1. JP1 winner (hoặc both): đóng cycle → tạo cycle mới. JP2 carry over khi chỉ JP1 win.
   *   2. JP2 winner only: KHÔNG đóng cycle → reset JP2 về seed trong cycle hiện tại.
   *   3. Roll-over: cả 2 tiếp tục tích lũy → updateCycleStats.
   *
   * Roll-over idempotent:
   *   - updateCycleStats dùng snapshot cycleDrawCountBefore từ PrepareSettle:
   *     drawCount = cycleDrawCountBefore + 1 (tuyệt đối)
   *   → chạy lại nhiều lần cho kết quả giống nhau.
   */
  private async updateJackpotCycle(input: SettleContextWithFinancials): Promise<void> {
    const { drawId, jp1CurrentAmount, jp2CurrentAmount, financials } = input;
    const { hasJackpot1Winner, hasJackpot2Winner } = financials;

    // Cycle chỉ đóng khi JP1 có winner. JP2 winner KHÔNG đóng cycle.
    const shouldCloseCycle = hasJackpot1Winner;

    if (shouldCloseCycle) {
      // ── JP1 winner flow: đóng cycle + tạo cycle mới ─────────────────────────

      // Retry detection: nếu đã có closed cycle với endDrawId = drawId
      // → closeCycle đã chạy thành công lần trước → chỉ đảm bảo active cycle tồn tại.
      const alreadyClosed = await this.cycleRepo.findClosedByEndDrawId(drawId);
      if (alreadyClosed) {
        console.log(`Jackpot cycle ${alreadyClosed.cycleNo} đã đóng cho kỳ ${drawId}, đảm bảo tạo cycle mới.`);
        await this.ensureNextCycleExists(drawId, input);
        return;
      }

      const activeCycle = await this.cycleRepo.getActiveCycle();

      if (!activeCycle) {
        console.log(`Không có cycle active, bỏ qua.`);
        return;
      }

      // Khi cùng kỳ có cả JP2 winner (BothWinner): JP2 cần reset về seed trước
      // khi đóng cycle → resetJp2InCycle chạy trước closeAndCreateNextCycle.
      // Khi chỉ JP1 winner: JP2 carry over, không cần reset trước.
      if (hasJackpot2Winner) {
        await this.resetJp2WithinCycle(drawId, input, activeCycle.cycleNo);
      }

      await this.closeAndCreateNextCycle(activeCycle, input);
    } else if (hasJackpot2Winner) {
      // ── JP2 winner only: reset JP2, KHÔNG đóng cycle ────────────────────────
      // JP1 tiếp tục tích lũy bình thường. JP2 reset về seed.
      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) return;

      await this.resetJp2WithinCycle(drawId, input, activeCycle.cycleNo);

      // JP1 và drawCount được cập nhật trong resetJp2InCycle (1 DB call).
      // Không cần gọi updateCycleStats riêng.
    } else {
      // ── Roll-over flow: không ai trúng, cả 2 tiếp tục tích luỹ ─────────────
      // Dùng snapshot cycleDrawCountBefore từ PrepareSettle thay vì activeCycle.drawCount
      // → idempotent khi retry (không cộng dồn 2 lần).
      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) return;

      await this.cycleRepo.updateCycleStats({
        cycleNo: input.config.cycleNo,
        jackpot1CurrentAmount: jp1CurrentAmount + financials.jackpot1Contribution,
        jackpot2CurrentAmount: jp2CurrentAmount + financials.jackpot2Contribution,
        drawCount: input.config.cycleDrawCountBefore + 1,
        lastSettledDrawId: drawId,
      });
    }
  }

  /**
   * Reset JP2 về seed trong cycle hiện tại và ghi lịch sử.
   *
   * Dùng trong 2 trường hợp:
   *   1. JP2 winner only → reset JP2, JP1 tiếp tục.
   *   2. BothWinner → reset JP2 trước khi closeAndCreateNextCycle.
   *
   * Retry detection: findCycleWithJp2ResetForDraw → nếu đã có bản ghi reset cho
   * drawId này → skip (idempotent). resetJp2InCycle cũng có guard thứ 2 tại repo
   * (jackpot2CurrentAmount ≠ seed).
   */
  private async resetJp2WithinCycle(
    drawId: string,
    input: SettleContextWithFinancials,
    cycleNo: number,
  ): Promise<void> {
    const { jp1CurrentAmount, jp2CurrentAmount, financials } = input;
    const { jackpot1Contribution, jackpot2Contribution } = financials;

    // Retry detection: nếu cycle đã có bản ghi reset cho drawId này → skip.
    const alreadyReset = await this.cycleRepo.findCycleWithJp2ResetForDraw(drawId);
    if (alreadyReset) {
      console.log(`JP2 đã được reset cho kỳ ${drawId} trong cycle ${cycleNo}, bỏ qua.`);
      return;
    }

    // jackpot2PrizePool = tổng quỹ JP2 tại thời điểm trao thưởng kỳ này.
    // jackpot2Contribution đã bao gồm jp1Overflow nếu JP1 vượt ngưỡng kỳ này.
    const jackpot2PrizePool = jp2CurrentAmount + jackpot2Contribution;

    // Build winners list từ jackpotWinners (đã được PatchJackpotPrize điền trước).
    const jp2Winners = (input.jackpotWinners ?? []).filter((w) => w.jackpotType === JackpotType.Jackpot2);

    await this.cycleRepo.resetJp2InCycle({
      cycleNo,
      // JP1 tiếp tục tích lũy — cập nhật cùng lúc để tránh 2 DB calls riêng.
      jackpot1CurrentAmount: jp1CurrentAmount + jackpot1Contribution,
      // JP2 trao thưởng xong → reset về seed = số tiền thực tế đang có sau kỳ này.
      jackpot2CurrentAmount: input.config.jp2SeedAmount,
      drawCount: input.config.cycleDrawCountBefore + 1,
      resetRecord: {
        drawId,
        jackpot2PrizePool,
        winners: jp2Winners,
        resetAt: new Date(),
      },
    });
  }

  /**
   * Đóng cycle hiện tại + tạo cycle mới. Chỉ gọi khi JP1 có winner.
   *
   * finalJp1/finalJp2 = opening + contribution kỳ này (giá trị closing thực tế),
   * bất kể có winner hay không — đây là số tiền cuối cùng của pool trước khi đóng cycle.
   *
   * Nếu BothWinner: resetJp2InCycle đã chạy trước bước này → jackpot2CurrentAmount
   * đã = jp2SeedAmount. finalJp2 tính từ jp2CurrentAmount (opening trước reset) +
   * jackpot2Contribution để phản ánh đúng giá trị pool trước khi trao.
   *
   * closeCycle idempotent: filter status = "active" → nếu đã closed thì no-op.
   * ensureNextCycleExists: kiểm tra active cycle trước khi tạo → không duplicate.
   */
  private async closeAndCreateNextCycle(
    activeCycle: { cycleNo: number; jackpot1CurrentAmount: number; jackpot2CurrentAmount: number },
    input: SettleContextWithFinancials,
  ): Promise<void> {
    const { drawId, jp1CurrentAmount, jp2CurrentAmount, financials } = input;
    const { hasJackpot1Winner, hasJackpot2Winner, jackpot1Contribution, jackpot2Contribution } = financials;

    // ── Xác định close reason ──────────────────────────────────────────────
    // Chỉ JP1 winner mới đóng cycle — BothWinner khi cùng kỳ JP2 cũng trúng.
    let closedReason: JackpotCycleClosedReason;
    if (hasJackpot1Winner && hasJackpot2Winner) {
      closedReason = JackpotCycleClosedReasons.BothWinner;
    } else {
      // hasJackpot1Winner = true (đảm bảo bởi caller shouldCloseCycle = hasJackpot1Winner)
      closedReason = JackpotCycleClosedReasons.Jackpot1Winner;
    }

    // ── finalJp1/finalJp2: giá trị cuối kỳ của mỗi jackpot pool ─────────────
    // = opening + contribution kỳ này, bất kể có winner hay không.
    // Đây là số tiền thực tế của pool tại thời điểm đóng cycle — phản ánh đúng
    // tổng tích lũy trước khi trao (finalJp1 = số tiền JP1 winner nhận được).
    // KHÔNG dùng activeCycle.jackpot1CurrentAmount — đó là giá trị opening,
    // chưa cộng contribution kỳ đang đóng → lịch sử cycle sẽ thiếu tiền kỳ cuối.
    const finalJp1 = jp1CurrentAmount + jackpot1Contribution;
    const finalJp2 = jp2CurrentAmount + jackpot2Contribution;

    // JP1 winners từ jackpotWinners (PatchJackpotPrize đã điền).
    // JP2 winners KHÔNG lưu ở cycle.winners — đã lưu trong jackpot2Resets[].
    const jp1Winners = (input.jackpotWinners ?? []).filter((w) => w.jackpotType === JackpotType.Jackpot1);

    // ── Đóng cycle (idempotent: filter status = "active") ──
    await this.cycleRepo.closeCycle({
      cycleNo: activeCycle.cycleNo,
      endDrawId: drawId,
      closedReason,
      finalJp1,
      finalJp2,
      // cycleDrawCountBefore + 1 = số kỳ bao gồm kỳ đang đóng (tuyệt đối → idempotent khi retry).
      drawCount: input.config.cycleDrawCountBefore + 1,
      // Chỉ JP1 winners — JP2 winners lưu trong jackpot2Resets[].
      winners: jp1Winners.length > 0 ? jp1Winners : undefined,
    });

    // ── Tạo cycle mới ──
    await this.ensureNextCycleExists(drawId, input);
  }

  /**
   * Đảm bảo có active cycle cho draw tiếp theo.
   * createCycle có guard findOne({ status: "active" }) → skip nếu đã tồn tại (idempotent).
   *
   * Chỉ gọi từ JP1 winner flow (shouldCloseCycle = hasJackpot1Winner = true).
   *
   * Seed logic:
   *   JP1: luôn reset về jp1SeedAmount (config snapshot) vì JP1 có winner.
   *     jp1Overflow luôn = 0 ở đây (overflow chỉ kích hoạt khi !hasJackpot1Winner).
   *   JP2:
   *     - BothWinner (JP1 + JP2 cùng kỳ) → reset về jp2SeedAmount.
   *     - JP1 winner only → JP2 CARRY OVER = closingJp2 (tiếp tục tích lũy cycle mới).
   *
   * Config cho cycle mới: luôn đọc từ GlobalConfig tại thời điểm tạo cycle mới.
   */
  private async ensureNextCycleExists(drawId: string, input: SettleContextWithFinancials): Promise<void> {
    const existingActive = await this.cycleRepo.getActiveCycle();
    if (existingActive) {
      return;
    }

    const nextDraw = await this.drawRepo.findNextPendingDraw(drawId);
    if (!nextDraw) {
      console.log(`Không tìm thấy kỳ tiếp theo, bỏ qua.`);
      return;
    }

    const { hasJackpot2Winner } = input.financials;

    // closingJp2 = giá trị pool JP2 cuối kỳ = opening + contribution kỳ này.
    const closingJp2 = input.jp2CurrentAmount + input.financials.jackpot2Contribution;

    // Đọc GlobalConfig để snapshot config mới nhất cho cycle tiếp theo.
    const globalConfig = await this.getGlobalConfig.run();

    // JP1 seed: luôn reset về seedAmount vì JP1 có winner (hàm này chỉ gọi từ JP1 winner flow).
    // jp1Overflow luôn = 0 ở đây (overflow chỉ kích hoạt khi !hasJackpot1Winner && hasJackpot2Winner).
    const jp1SeedAmount = input.config.jp1SeedAmount;

    // Seed JP2 kỳ tiếp:
    //   - BothWinner (JP1 + JP2 cùng kỳ) → JP2 reset về jp2SeedAmount (config).
    //   - JP1 winner only → JP2 CARRY OVER: seed = closingJp2 (tiếp tục tích lũy).
    const jp2SeedAmount = hasJackpot2Winner ? input.config.jp2SeedAmount : closingJp2;

    await this.cycleRepo.createCycle({
      startDrawId: nextDraw.drawId,
      jp1SeedAmount,
      jp2SeedAmount,
      config: {
        jp1ContributionRatio: globalConfig.jackpot.jp1ContributionRatio,
        jp2ContributionRatio: globalConfig.jackpot.jp2ContributionRatio,
        jp1OverflowThreshold: globalConfig.jackpot.jp1OverflowThreshold,
      },
    });
  }
}
