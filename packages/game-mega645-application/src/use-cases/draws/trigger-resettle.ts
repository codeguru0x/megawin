/**
 * Use Case: Trigger Resettle (Mega 6/45) — bước 2 của workflow Resettle.
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
 *        B2 cascade nhiều kỳ — staff resettle tuần tự, DBA checkpoint giữa các bước.
 *      - Resolve opening (single jackpot) qua `resolveOpening`: opening(K) =
 *        closing(K-1) đọc từ ledger kỳ liền trước (bất biến cycle). Trong cascade
 *        B2, closing(K-1) đã được resettle kỳ trước cập nhật → opening(K) đúng dù
 *        ledger(K).opening cũ bị $setOnInsert đóng băng. Bật `cascadeOpeningUpdate`
 *        khi lấy từ kỳ trước.
 *      - Build `ResettleContext` với openingJp, seq, scenario, skipCycleUpdate,
 *        cascadeOpeningUpdate.
 *   5. Sinh `resettleId` (UUIDv7) — propagate xuyên SFN.
 *   6. Acquire business lock `mega645:resettle:{drawId}` TTL 600s.
 *   7. Transition `Published → Settling` (skip nếu đã `Settling`).
 *   8. StartExecution Resettle SFN với name deterministic theo `settledAt`.
 *
 * Mega 6/45 là SINGLE JACKPOT (6/6), KHÔNG bonus, KHÔNG split cycle. Bất biến
 * cycle: `openingJp(T) = seedAmount + Σ contribution các kỳ < T` (vì cycle chỉ
 * đóng khi có winner) → `cycleContributionBefore = openingJp - seedAmount`.
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
import { ResettleScenario } from "@megawin/game-mega645/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { JackpotCycleEntryRepository } from "../../infras/repos/jackpot-cycle-entry-repo";
import { DetectResettleBoundariesInternalUseCase } from "../resettle/detect-boundaries";
import { auditResettle } from "../../services/audit-log";
import type { TriggerResettleInput, TriggerResettleOutput } from "./dto/draw.dto";
import type { ResettleContext } from "../settle/types";

const RESETTLE_LOCK_TTL_SECONDS = 600;

export class TriggerResettleUseCase extends NextApiUseCase<
  TriggerResettleInput,
  TriggerResettleOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly lockCoordinator = new BusinessLockCoordinator();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly cycleEntryRepo = new JackpotCycleEntryRepository();
  private readonly detectBoundaries = new DetectResettleBoundariesInternalUseCase();

  /** @inheritdoc */
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
        `Kỳ ${drawId} không có ledger entry dù đã settled — bất thường về data integrity (entry bị mất/xoá). Dừng resettle, liên hệ đội kỹ thuật kiểm tra collection mega645_jackpot_cycle_entries.`,
      );
    }

    // Re-detect scenario với result mới (draw.result đã được republish).
    const detection = await this.detectBoundaries.run({
      drawId,
      proposedWinningNumbers: draw.result.winningNumbers,
    });

    // TYPE_B1 (1 kỳ) và TYPE_B2 (cascade nhiều kỳ, có thể xuyên cycle) đều cần Quản
    // trị hệ thống chốt/tái cấu trúc cycle thủ công → BẮT BUỘC dbaConfirmed=true
    // trước khi worker chạy. Khác biệt: B2 còn có chain kỳ sau cần resettle TUẦN TỰ
    // — DBA checkpoint cycle giữa mỗi kỳ. Worker xử lý payout giống hệt nhau
    // (skipCycleUpdate=true). Cross-cycle restructure (gỡ winner đóng cycle) rơi vào
    // B2 vì chain detect xuyên cycle thấy các kỳ ở cycle kế.
    const requiresDbaCycle =
      detection.scenario === ResettleScenario.TYPE_B1 ||
      detection.scenario === ResettleScenario.TYPE_B2;

    if (requiresDbaCycle && !input.dbaConfirmed) {
      throw new AppException("RESETTLE_REQUIRES_DBA", detection.message);
    }

    // ── Guard thứ tự cascade (chỉ TYPE_B2) ───────────────────────────────
    // Cascade yêu cầu resettle TUẦN TỰ theo thời gian (drawId tăng dần) vì opening
    // kỳ sau = closing kỳ trước. Nếu còn kỳ TRƯỚC drawId (theo thời gian, XUYÊN
    // CYCLE) đang dở (status != Settled do đã republish nhưng chưa re-settle xong)
    // → chặn, bắt buộc hoàn tất kỳ trước (gồm DBA chốt/tái cấu trúc cycle) rồi mới
    // sang kỳ này. Cross-cycle: kỳ trước có thể nằm ở cycle khác → guard theo drawId.
    if (detection.scenario === ResettleScenario.TYPE_B2) {
      await this.assertNoPendingPriorDraw(drawId);
    }

    // ── Resolve opening (single jackpot) cho kỳ này ──────────────────────
    // Bất biến ledger theo thời gian: opening(K) = closing(kỳ settle liền trước K).
    // Cascade B2: closing kỳ trước vừa đổi do resettle kỳ trước → đọc lại từ kỳ liền
    // trước (XUYÊN CYCLE, theo drawId), bật cascadeOpeningUpdate. Kỳ đầu cascade (T)
    // hoặc kỳ settle đầu tiên trong ledger → fallback ledger(T).openingJp (bất biến).
    const { opening, cascadeOpeningUpdate } = await this.resolveOpening(
      drawId,
      ledgerEntry.openingJp,
    );

    const cycleDrawCountBefore = ledgerEntry.seq - 1;

    // cycleContributionBefore = opening - seedAmount (bất biến single-jackpot,
    // không split cycle → opening tích lũy liên tục từ seed). Lấy seedAmount theo
    // CHÍNH cycle của kỳ T (getCycleByNo — đúng cả khi cycle đã đóng), KHÔNG dùng
    // getActiveCycle (active cycle có thể là cycle MỚI sau khi cycle T đã đóng).
    //
    // Cross-cycle (cascade B2): trước khi resettle kỳ T+n, DBA đã tái cấu trúc ledger
    // (đổi cycleNo của T+n về cycle gốc đã reopen + đóng/xoá cycle thừa). Do đó
    // `ledgerEntry.cycleNo` tại đây LUÔN là cycle thật của kỳ, `getCycleByNo` trả
    // đúng seedAmount → cycleContributionBefore chính xác. Guard assertNoPendingPriorDraw
    // đảm bảo cascade chạy tuần tự nên thứ tự "DBA tái cấu trúc → resettle kỳ kế" được
    // tôn trọng.
    const cycle = await this.cycleRepo.getCycleByNo(ledgerEntry.cycleNo);
    if (!cycle) {
      throw new AppException(
        "CYCLE_MISSING",
        `Không tìm thấy jackpot cycle #${ledgerEntry.cycleNo} của kỳ ${drawId} — bất thường data integrity. Liên hệ đội kỹ thuật.`,
      );
    }
    const cycleContributionBefore = opening - cycle.seedAmount;

    // ── Step 5: sinh resettleId ───────────────────────────────────────────
    const resettleId = generateId();

    // Build resettleContext — Settle SFN đọc để override opening và quyết định
    // skipCycleUpdate tại FinalizeSettle.
    const resettleContext: ResettleContext = {
      resettleId,
      scenario: detection.scenario,
      openingJp: opening,
      cycleContributionBefore,
      cycleDrawCountBefore,
      // cycleNo của cycle CHỨA kỳ T — PrepareSettle đọc cycle theo số này
      // (getCycleByNo) thay vì getActiveCycle, để xử lý đúng cả khi cycle đã
      // closed (kỳ T trúng JP, chưa có kỳ sau → chưa có active cycle).
      cycleNo: ledgerEntry.cycleNo,
      // TYPE_B1 + TYPE_B2: FinalizeSettle bỏ qua updateCycle, DBA chốt cycle
      // thủ công sau (B1: 1 lần; B2: sau mỗi kỳ cascade). Chỉ TYPE_A worker tự ghi.
      skipCycleUpdate: requiresDbaCycle,
      cascadeOpeningUpdate,
    };

    // ── Step 6: acquire business lock ────────────────────────────────────
    const lockKey = buildResettleLockKey(GameProduct.Mega645, drawId);
    const lockOwnerToken = await this.lockCoordinator.acquire({
      lockKey,
      ttlSeconds: RESETTLE_LOCK_TTL_SECONDS,
      heldErrorCode: "RESETTLE_LOCK_HELD",
      heldErrorMessage: `Kỳ quay ${drawId} đang được resettle bởi phiên khác. Vui lòng đợi ~10 phút hoặc liên hệ admin.`,
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

        // Audit staff bấm kết sổ lại (chỉ ghi ở lần transition thật, không ghi
        // lại ở retry idempotent). Fire-and-forget.
        if (input.actor) {
          auditResettle({
            actor: input.actor,
            drawId,
            prevStatus: draw.status,
            resettleId,
          });
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

      logError("TriggerResettle Mega645", err, { drawId, resettleId });
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
   * Dùng `findClosingJpBeforeDraw(drawId)` — closingJp kỳ settle liền trước theo
   * `drawId` (thời gian), XUYÊN CYCLE. Đây là điểm mấu chốt cho cross-cycle cascade: sau khi
   * resettle kỳ T (đóng cycle #N) gỡ winner, kỳ T+1 (vốn ở cycle #N+1) có opening
   * mới = closing(T) — KHÔNG còn là seedAmount của cycle mới. Tìm theo seq trong
   * cùng cycle sẽ sai; tìm theo drawId (kỳ liền trước thời gian) mới đúng.
   *
   * - Không có kỳ settle nào trước `drawId` (kỳ settle đầu tiên trong ledger) →
   *   dùng `fallbackOpening` (chính là `ledger(K).openingJp`), `cascadeOpeningUpdate=false`.
   * - Ngược lại → đọc `closingJp` của kỳ liền trước. Trong cascade B2 (kể cả
   *   cross-cycle), giá trị này vừa được resettle kỳ trước cập nhật → opening(K)
   *   đúng dù `ledger(K).openingJp` cũ đã bị $setOnInsert đóng băng. Bật
   *   `cascadeOpeningUpdate=true` để FinalizeSettle ghi đè opening ledger.
   *
   * @param drawId - drawId của kỳ đang resettle (dùng tìm kỳ liền trước theo thời gian).
   * @param fallbackOpening - opening lưu trong ledger(K) — dùng khi không có kỳ trước.
   */
  private async resolveOpening(
    drawId: string,
    fallbackOpening: number,
  ): Promise<{ opening: number; cascadeOpeningUpdate: boolean }> {
    const prevClosingJp = await this.cycleEntryRepo.findClosingJpBeforeDraw(drawId);

    if (prevClosingJp === null) {
      return { opening: fallbackOpening, cascadeOpeningUpdate: false };
    }

    return {
      opening: prevClosingJp,
      cascadeOpeningUpdate: true,
    };
  }

  /**
   * Guard thứ tự cascade (TYPE_B2): đảm bảo mọi kỳ TRƯỚC `drawId` (theo thời gian,
   * XUYÊN CYCLE) đã hoàn tất resettle trước khi resettle kỳ này.
   *
   * Cascade phải chạy TUẦN TỰ theo thời gian (drawId tăng dần) vì opening(K) =
   * closing(kỳ liền trước). Cross-cycle: kỳ trước có thể nằm ở cycle KHÁC → query
   * trực tiếp trên `draws` theo `drawId` (`findPendingResettleBeforeDraw`) thay vì
   * khoá `(cycleNo, seq)`.
   *
   * ── Tối ưu: KHÔNG quét ledger ────────────────────────────────────────────────
   * Guard chỉ cần biết "có kỳ dở gần T nhất không" — query 1 phát trên `draws`
   * (`drawId < T` + status đang resettle + `$expr publishedAt > settledAt`),
   * `findOne` + limit(1). KHÔNG tải toàn bộ chain ledger trước T (tránh O(n) trên
   * game nhiều năm hàng chục nghìn kỳ).
   *
   * Một kỳ trước được coi là "đang dở" nếu nó đã republish result mới
   * (`result.publishedAt > settledAt`) nhưng chưa re-settle xong (status !=
   * Settled) → chặn `RESETTLE_CASCADE_ORDER`, bắt buộc hoàn tất kỳ trước (gồm DBA
   * chốt/tái cấu trúc cycle) rồi mới sang kỳ này.
   *
   * @param drawId - drawId đang muốn resettle.
   * @throws {@link AppException} `RESETTLE_CASCADE_ORDER` — còn kỳ trước chưa hoàn tất.
   */
  private async assertNoPendingPriorDraw(drawId: string): Promise<void> {
    const pending = await this.drawRepo.findPendingResettleBeforeDraw(drawId);
    if (!pending) return;

    throw new AppException(
      "RESETTLE_CASCADE_ORDER",
      `Không thể resettle kỳ ${drawId} — kỳ trước ${pending.drawId} chưa hoàn tất resettle. ` +
        `Cascade phải chạy TUẦN TỰ theo thứ tự kỳ: hoàn tất kỳ ${pending.drawId} (gồm Quản trị hệ thống chốt cycle) rồi mới sang kỳ này.`,
    );
  }
}
