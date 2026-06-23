/**
 * Use Case: Trigger Resettle (Lotto 5/35) — bước 2 của workflow Resettle.
 *
 * Bắt đầu phiên kết sổ lại sau khi kết quả đã được republish qua
 * `republishResultAfterSettled` (handler `/republish-result`).
 *
 * Flow:
 *   1. Validate draw tồn tại + có result.
 *   2. Phân biệt Resettle vs Settle lần đầu:
 *      - `settledAt == null` → chưa từng settle → reject `DRAW_NEVER_SETTLED`.
 *      - `result.publishedAt <= settledAt` → chưa có kết quả mới → reject `DRAW_NO_NEW_RESULT`.
 *   3. Validate status: `Published` (lần đầu) hoặc `Settling` (retry idempotent).
 *   4. Build `resettleContext` từ Cycle Ledger:
 *      - Query `JackpotCycleEntryRepository.findByDraw(drawId)`.
 *      - Nếu ledger null → reject `LEDGER_MISSING` (bất thường data integrity,
 *        không xảy ra trong production bình thường → báo kỹ thuật).
 *      - Re-detect scenario với result mới (draw.result sau republish).
 *      - TYPE_B1 / TYPE_B2 → BẮT BUỘC `dbaConfirmed=true`, nếu không → reject
 *        `RESETTLE_REQUIRES_DBA`. Cả hai dùng `skipCycleUpdate=true` (worker auto
 *        payout, DBA chốt cycle thủ công). Khác biệt: B1 chain rỗng (1 kỳ),
 *        B2 cascade nhiều kỳ XUYÊN CYCLE — staff resettle tuần tự theo `drawId`,
 *        DBA checkpoint/tái cấu trúc cycle (đóng/mở/gộp cycleNo) giữa các bước.
 *      - Resolve opening (single jackpot) qua `resolveOpening`: opening(K) =
 *        closing(kỳ settle liền trước theo THỜI GIAN), đọc qua
 *        `findClosingBeforeDraw(drawId)` (XUYÊN CYCLE). Trong cascade B2,
 *        closing kỳ trước đã được resettle kỳ trước cập nhật → opening(K) đúng dù
 *        ledger(K).opening cũ bị $setOnInsert đóng băng. Bật `cascadeOpeningUpdate`
 *        khi lấy từ kỳ trước. `closing` đã phản ánh split reset → opening đúng cả
 *        khi kỳ trước split.
 *      - Build `ResettleContext` với opening, seq, scenario, skipCycleUpdate,
 *        cascadeOpeningUpdate. Split Cycle (Lotto 5/35 đặc thù) được tính lại ở
 *        FinalizeSettle dựa trên `opening >= splitThreshold` + không có JP winner.
 *   5. Sinh `resettleId` (UUIDv7) — propagate xuyên SFN.
 *   6. Acquire business lock `lotto535:resettle:{drawId}` TTL 600s.
 *   7. Transition `Published → Settling` (skip nếu đã `Settling`).
 *   8. StartExecution Resettle SFN với name deterministic theo `settledAt`.
 *
 * IDEMPOTENT: execution name deterministic theo `(drawId, settledAt.getTime())`
 * không cho phép 2 phiên cùng chạy trong 1 lần settle cycle.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { buildResettleLockKey, toExecutionName } from "@megawin/game-core/utils";
import { startExecution, ExecutionAlreadyExists } from "@megawin/app-core/aws/sf";
import { generateId, logError } from "@megawin/shared/utils";
import { BusinessLockCoordinator } from "@megawin/worker-core";
import { ResettleScenario } from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleEntryRepository } from "../../infras/repos/jackpot-cycle-entry-repo";
import { DetectResettleBoundariesInternalUseCase } from "../resettle/detect-boundaries";
import type { TriggerResettleInput, TriggerResettleOutput } from "./dto/draw.dto";
import type { ResettleContext } from "../settle/types";

const RESETTLE_LOCK_TTL_SECONDS = 600;

export class TriggerResettleUseCase extends NextApiUseCase<
  TriggerResettleInput,
  TriggerResettleOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly lockCoordinator = new BusinessLockCoordinator();
  private readonly cycleEntryRepo = new JackpotCycleEntryRepository();
  private readonly detectBoundaries = new DetectResettleBoundariesInternalUseCase();

  protected async execute(input: TriggerResettleInput): Promise<TriggerResettleOutput> {
    const { drawId } = input;

    // ── Step 1: validate draw + result ───────────────────────────────────
    const draw = await this.drawRepo.getDrawById(drawId);

    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    if (!draw.result) {
      throw AppException.badRequest(
        "Chưa có kết quả quay – phải republish result trước khi resettle.",
      );
    }

    // ── Step 2: phân biệt Settle lần đầu vs Resettle ─────────────────────
    if (!draw.settledAt) {
      throw new AppException(
        "DRAW_NEVER_SETTLED",
        `Kỳ quay ${drawId} chưa từng được kết sổ. Vui lòng dùng "Kết sổ" thay vì "Kết sổ lại".`,
      );
    }

    const resultPublishedAt = draw.result.publishedAt;
    if (!resultPublishedAt || resultPublishedAt.getTime() <= draw.settledAt.getTime()) {
      throw new AppException(
        "DRAW_NO_NEW_RESULT",
        `Không thể resettle – chưa có kết quả mới sau lần kết sổ gần nhất.`,
      );
    }

    // ── Step 3: validate status ──────────────────────────────────────────
    // Chỉ cho phép `Published` (entry point sau republish) hoặc `Settling`
    // (retry idempotent — phiên trước đã transition nhưng SFN start lỗi/DBA
    // bấm lại). Mọi status khác (Scheduled/Settled/Cancelled) bị reject.
    if (draw.status !== DrawStatus.Published && draw.status !== DrawStatus.Settling) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể resettle – draw đang ở "${draw.status}".`,
      );
    }

    // ── Step 4: build resettleContext từ Cycle Ledger ────────────────────
    // Ledger entry null → BẤT THƯỜNG về data integrity. Ledger writer ghi entry
    // cho mọi kỳ settle từ khi go-live → kỳ đã settled PHẢI có ledger entry.
    // Null nghĩa là entry bị xoá/mất/migration lỗi → KHÔNG tự resettle, báo kỹ thuật.
    const ledgerEntry = await this.cycleEntryRepo.findByDraw(drawId);

    if (!ledgerEntry) {
      throw new AppException(
        "LEDGER_MISSING",
        `Kỳ ${drawId} không có ledger entry — liên hệ đội kỹ thuật kiểm tra collection lotto535_jackpot_cycle_entries.`,
      );
    }

    // Re-detect scenario với result mới (draw.result đã được republish).
    const detection = await this.detectBoundaries.run({
      drawId,
      proposedWinningMain: draw.result.winningMain,
      proposedWinningSpecial: draw.result.winningSpecial,
    });

    // TYPE_B1 (1 kỳ) và TYPE_B2 (cascade nhiều kỳ) đều cần Quản trị hệ thống
    // chốt cycle thủ công → BẮT BUỘC dbaConfirmed=true trước khi worker chạy.
    // Khác biệt: B2 còn có chain kỳ sau cần resettle TUẦN TỰ — DBA checkpoint
    // cycle giữa mỗi kỳ. Worker xử lý payout giống hệt nhau (skipCycleUpdate=true).
    const requiresDbaCycle =
      detection.scenario === ResettleScenario.TYPE_B1 ||
      detection.scenario === ResettleScenario.TYPE_B2;

    if (requiresDbaCycle && !input.dbaConfirmed) {
      throw new AppException("RESETTLE_REQUIRES_DBA", detection.message);
    }

    // ── Guard thứ tự cascade (chỉ TYPE_B2) ───────────────────────────────
    // Cascade yêu cầu resettle TUẦN TỰ theo thời gian vì opening kỳ sau =
    // closing kỳ trước. Nếu còn kỳ TRƯỚC drawId (XUYÊN CYCLE, theo drawId) đang dở
    // (status != Settled do đã republish nhưng chưa re-settle xong) → chặn,
    // bắt buộc hoàn tất kỳ trước (gồm DBA chốt/tái cấu trúc cycle) rồi mới sang kỳ này.
    if (detection.scenario === ResettleScenario.TYPE_B2) {
      await this.assertNoPendingPriorDraw(drawId);
    }

    // ── Resolve opening cho kỳ này ───────────────────────────────────────
    // Bất biến ledger theo THỜI GIAN: opening(K) = closing(kỳ settle liền trước K).
    // Cascade B2: closing kỳ trước vừa đổi do resettle kỳ trước → đọc lại từ kỳ liền
    // trước (XUYÊN CYCLE, theo drawId), bật cascadeOpeningUpdate. Kỳ đầu cascade (T)
    // hoặc kỳ settle đầu tiên trong ledger → fallback ledger(T).opening (bất biến).
    const { opening, cascadeOpeningUpdate } = await this.resolveOpening(
      drawId,
      ledgerEntry.opening,
    );

    const cycleDrawCountBefore = ledgerEntry.seq - 1;
    // Σ contribution các kỳ TRƯỚC kỳ này TRONG CÙNG CYCLE — aggregate $sum server-side
    // (1 số), KHÔNG load toàn cycle rồi reduce. Lấy contribution thực tế từng kỳ vì
    // split cycle reset closing → không suy được từ `opening - seed`.
    //
    // Cross-cycle (cascade B2): trước khi resettle kỳ T+n, DBA đã tái cấu trúc ledger
    // (đổi `cycleNo`/`seq` của T+n về cycle gốc đã reopen + đóng/gộp cycle thừa). Do đó
    // `ledgerEntry.cycleNo`/`seq` tại đây LUÔN là giá trị thật sau restructure →
    // `sumContributionBefore` aggregate đúng phạm vi cycle. Guard assertNoPendingPriorDraw
    // đảm bảo cascade chạy tuần tự nên thứ tự "DBA tái cấu trúc → resettle kỳ kế" được
    // tôn trọng.
    const cycleContributionBefore = await this.cycleEntryRepo.sumContributionBefore(
      ledgerEntry.cycleNo,
      ledgerEntry.seq,
    );

    // ── Step 5: sinh resettleId ───────────────────────────────────────────
    const resettleId = generateId();

    // Build resettleContext — Settle SFN đọc để override opening và quyết định
    // skipCycleUpdate tại FinalizeSettle.
    const resettleContext: ResettleContext = {
      resettleId,
      scenario: detection.scenario,
      opening,
      cycleContributionBefore,
      cycleDrawCountBefore,
      // cycleNo của cycle CHỨA kỳ T — PrepareSettle đọc cycle theo số này
      // (getCycleByNo) thay vì getActiveCycle, để xử lý đúng cả khi cycle đã
      // closed (kỳ T trúng Jackpot, chưa có kỳ sau → chưa có active cycle).
      cycleNo: ledgerEntry.cycleNo,
      // TYPE_B1 + TYPE_B2: FinalizeSettle bỏ qua updateCycle, DBA chốt cycle
      // thủ công sau (B1: 1 lần; B2: sau mỗi kỳ cascade). Chỉ TYPE_A worker tự ghi.
      skipCycleUpdate: requiresDbaCycle,
      cascadeOpeningUpdate,
    };

    // ── Step 6: acquire business lock ────────────────────────────────────
    const lockKey = buildResettleLockKey(GameProduct.Lotto535, drawId);
    const lockOwnerToken = await this.lockCoordinator.acquire({
      lockKey,
      ttlSeconds: RESETTLE_LOCK_TTL_SECONDS,
      heldErrorCode: "RESETTLE_LOCK_HELD",
      heldErrorMessage: `Kỳ quay ${drawId} đang được resettle bởi phiên khác.`,
    });

    // ── Step 7+8: transition status + start SFN ───────────────────────────
    try {
      if (draw.status !== DrawStatus.Settling) {
        const updated = await this.drawRepo.triggerSettle(drawId);

        if (!updated) {
          throw new AppException(
            "DRAW_INVALID_TRANSITION",
            `Không thể resettle – draw không còn ở "published".`,
          );
        }
      }

      // Execution name deterministic theo `(drawId, settledAt.getTime())`.
      // `settledAt` chỉ đổi khi FinalizeSettle hoàn tất → đảm bảo mỗi phiên
      // resettle có execution name khác nhau. KHÔNG dùng resettleId (đổi mỗi retry).
      const settledAtToken = draw.settledAt.getTime();
      await startExecution({
        stateMachineArn: input.RESETTLE_SFN_ARN,
        name: `${toExecutionName(drawId)}-${settledAtToken}`,
        input: {
          drawId,
          resettleId,
          lockOwnerToken,
          lockKey,
          resettleContext,
        },
      });
    } catch (err) {
      const isAlreadyRunning = err instanceof ExecutionAlreadyExists;

      await this.lockCoordinator.release({
        lockKey,
        ownerToken: lockOwnerToken,
        error: isAlreadyRunning ? undefined : err,
      });

      if (isAlreadyRunning) {
        return {
          drawId,
          status: DrawStatus.Settling,
          resettleId,
          lockOwnerToken,
        };
      }

      logError("TriggerResettle Lotto535", err, { drawId, resettleId });
      throw err instanceof AppException
        ? err
        : new AppException("SFN_START_FAILED", `Không thể khởi chạy resettle worker.`);
    }

    return {
      drawId,
      status: DrawStatus.Settling,
      resettleId,
      lockOwnerToken,
    };
  }

  /**
   * Resolve opening (single jackpot) cho kỳ đang resettle dựa trên bất biến
   * ledger theo THỜI GIAN: opening(K) = closing(kỳ settle liền trước K).
   *
   * Dùng `findClosingBeforeDraw(drawId)` — closing kỳ settle liền trước theo `drawId`
   * (thời gian), XUYÊN CYCLE. Đây là điểm mấu chốt cho cross-cycle cascade: sau khi
   * gỡ JP winner/Split ở kỳ T (T từng đóng cycle), kỳ T+1 không còn ở "đầu cycle
   * mới" → opening(T+1) = closing(T) mới (tích lũy), KHÔNG phải seed. Tìm theo
   * `(cycleNo, seq-1)` sẽ sai vì ranh giới cycle vừa bị xoá.
   *
   * - Không có kỳ trước (T là kỳ settle đầu tiên trong ledger) → dùng
   *   `fallbackOpening` (chính `ledger(T).opening`), `cascadeOpeningUpdate=false`.
   * - Có kỳ trước → opening = `closing` kỳ liền trước. Trong cascade B2 giá trị này
   *   vừa được resettle kỳ trước cập nhật → opening(K) đúng dù `ledger(K).opening` cũ
   *   đã bị $setOnInsert đóng băng. Bật `cascadeOpeningUpdate=true` để FinalizeSettle
   *   ghi đè opening ledger.
   *
   * Lưu ý: `closing` kỳ trước đã phản ánh đúng split reset (nếu kỳ trước split,
   * `closing` = seed sau reset) → opening(K) tự động đúng cho cả trường hợp split.
   */
  private async resolveOpening(
    drawId: string,
    fallbackOpening: number,
  ): Promise<{ opening: number; cascadeOpeningUpdate: boolean }> {
    const prevClosing = await this.cycleEntryRepo.findClosingBeforeDraw(drawId);

    if (prevClosing === null) {
      return { opening: fallbackOpening, cascadeOpeningUpdate: false };
    }

    return {
      opening: prevClosing,
      cascadeOpeningUpdate: true,
    };
  }

  /**
   * Guard thứ tự cascade (TYPE_B2): đảm bảo mọi kỳ TRƯỚC `drawId` (XUYÊN CYCLE,
   * theo thời gian) đã hoàn tất resettle trước khi resettle kỳ này.
   *
   * Cascade phải chạy TUẦN TỰ theo thời gian vì opening(K) = closing(kỳ trước).
   * Cross-cycle: kỳ trước có thể nằm ở cycle khác (ranh giới cycle bị xoá khi gỡ
   * JP winner/Split) → quét theo `drawId` thay vì `(cycleNo, seq)`.
   *
   * Một kỳ trước được coi là "đang dở" nếu đã republish result mới
   * (`result.publishedAt > settledAt`) nhưng chưa re-settle xong (status !=
   * Settled) → chặn `RESETTLE_CASCADE_ORDER`, bắt buộc hoàn tất kỳ trước (gồm DBA
   * chốt/tái cấu trúc cycle) rồi mới sang kỳ này.
   *
   * ── Tối ưu: KHÔNG quét ledger ────────────────────────────────────────────────
   * Guard chỉ cần biết "có kỳ dở gần T nhất không" — query 1 phát trên `draws`
   * (`drawRepo.findPendingResettleBeforeDraw`): `findOne` + `limit(1)` trên IXSCAN
   * `{status, drawId}`. KHÔNG tải toàn bộ chain ledger trước T (tránh O(n) trên
   * game nhiều năm hàng chục nghìn kỳ + rủi ro cap limit findMany).
   */
  private async assertNoPendingPriorDraw(drawId: string): Promise<void> {
    const pending = await this.drawRepo.findPendingResettleBeforeDraw(drawId);
    if (!pending) return;

    throw new AppException(
      "RESETTLE_CASCADE_ORDER",
      `Không thể resettle kỳ ${drawId} — kỳ trước ${pending.drawId} chưa hoàn tất resettle. ` +
        `Cascade phải chạy TUẦN TỰ theo thứ tự kỳ: hoàn tất kỳ ${pending.drawId} (gồm Quản trị hệ thống chốt/tái cấu trúc cycle) rồi mới sang kỳ này.`,
    );
  }
}
