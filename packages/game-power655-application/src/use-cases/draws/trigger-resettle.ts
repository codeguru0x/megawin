/**
 * Use Case: Trigger Resettle (Power 6/55) — bước 2 của workflow Resettle.
 *
 * Bắt đầu phiên kết sổ lại sau khi kết quả đã được republish qua
 * `republishResultAfterSettled` (handler `/republish-result`).
 *
 * Flow:
 *   1. Validate draw tồn tại + có result.
 *   2. Phân biệt Resettle vs Settle lần đầu:
 *      - `settledAt == null` → chưa từng settle → reject `DRAW_NEVER_SETTLED`.
 *      - `result.publishedAt <= settledAt` → chưa có kết quả mới → reject `DRAW_NO_NEW_RESULT`.
 *   3. Validate status: `Published` (lần đầu) hoặc `Settling` (retry).
 *   4. Build `resettleContext` từ Cycle Ledger:
 *      - Query `JackpotCycleEntryRepository.findByDraw(drawId)`.
 *      - Nếu ledger null → reject `LEDGER_MISSING` (bất thường data integrity,
 *        không xảy ra trong production bình thường → báo kỹ thuật).
 *      - Re-detect scenario với result mới (draw.result sau republish).
 *      - TYPE_B1 / TYPE_B2 → BẮT BUỘC `dbaConfirmed=true`, nếu không → reject
 *        `RESETTLE_REQUIRES_DBA`. Cả hai dùng `skipCycleUpdate=true` (worker auto
 *        payout, DBA chốt cycle thủ công). Khác biệt: B1 chain rỗng (1 kỳ),
 *        B2 cascade nhiều kỳ — staff resettle tuần tự, DBA checkpoint giữa các bước.
 *      - Resolve opening JP1/2 qua `resolveOpening`: đọc kỳ settle liền trước theo
 *        `drawId` (thời gian, XUYÊN CYCLE). Per-jackpot: JP1 winner ở kỳ trước →
 *        opening JP1 = seed cycle mới; JP2 winner → opening JP2 = seed; ngược lại
 *        roll-over = closing kỳ trước. Cascade B2: closing kỳ trước vừa đổi do
 *        resettle → opening đúng dù ledger(K).opening cũ bị $setOnInsert đóng băng.
 *        Bật `cascadeOpeningUpdate` khi lấy giá trị roll-over từ kỳ trước.
 *      - Build `ResettleContext` với openingJp1/2, seq, scenario, skipCycleUpdate,
 *        cascadeOpeningUpdate.
 *   5. Sinh `resettleId` (UUIDv7) — propagate xuyên SFN.
 *   6. Acquire business lock `power655:resettle:{drawId}` TTL 600s.
 *   7. Transition `Published → Settling` (skip nếu đã `Settling`).
 *   8. StartExecution Resettle SFN với name deterministic theo `settledAt`.
 *
 * IDEMPOTENT: cùng pattern Max3D. Execution name deterministic không cho phép
 * 2 phiên cùng chạy trong 1 lần settle cycle.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { buildResettleLockKey, toExecutionName } from "@megawin/game-core/utils";
import { startExecution, ExecutionAlreadyExists } from "@megawin/app-core/aws/sf";
import { generateId, logError } from "@megawin/shared/utils";
import { BusinessLockCoordinator } from "@megawin/worker-core";
import { ResettleScenario } from "@megawin/game-power655/rules";
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
    if (draw.status !== DrawStatus.Published && draw.status !== DrawStatus.Settling) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể resettle – draw đang ở "${draw.status}". Cần cập nhật kết quả mới trước.`,
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
        `Kỳ ${drawId} không có ledger entry dù đã settled — bất thường về data integrity (entry bị mất/xoá). Dừng resettle, liên hệ đội kỹ thuật kiểm tra collection power655_jackpot_cycle_entries.`,
      );
    }

    // Re-detect scenario với result mới (draw.result đã được republish).
    const detection = await this.detectBoundaries.run({
      drawId,
      proposedWinningMain: draw.result.winningMain,
      proposedBonusNumber: draw.result.bonusNumber,
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
    // Cascade yêu cầu resettle TUẦN TỰ theo thời gian (drawId tăng dần) vì opening
    // kỳ sau = closing kỳ trước. Nếu còn kỳ TRƯỚC drawId (theo thời gian, XUYÊN
    // CYCLE) đang dở (status != Settled do đã republish nhưng chưa re-settle xong)
    // → chặn, bắt buộc hoàn tất kỳ trước (gồm DBA chốt/tái cấu trúc cycle) rồi mới
    // sang kỳ này. Cross-cycle: kỳ trước có thể nằm ở cycle khác → guard theo drawId.
    if (detection.scenario === ResettleScenario.TYPE_B2) {
      await this.assertNoPendingPriorDraw(drawId);
    }

    // ── Resolve opening JP1/2 cho kỳ này ─────────────────────────────────
    // Bất biến ledger theo THỜI GIAN: opening(K) = closing(kỳ settle liền trước K),
    // có điều chỉnh theo winner/reset boundary (xem JSDoc resolveOpening). Cascade
    // B2 (kể cả XUYÊN CYCLE): closing kỳ trước vừa đổi do resettle kỳ trước → đọc
    // lại từ kỳ liền trước (theo drawId), bật cascadeOpeningUpdate để ghi đè ledger.
    const { openingJp1, openingJp2, cascadeOpeningUpdate } = await this.resolveOpening(
      drawId,
      ledgerEntry.openingJp1,
      ledgerEntry.openingJp2,
    );

    // ── Step 5: sinh resettleId ───────────────────────────────────────────
    const resettleId = generateId();

    // Build resettleContext — Settle SFN đọc để override openingJp1/2
    // và quyết định skipCycleUpdate tại FinalizeSettle.
    const resettleContext: ResettleContext = {
      resettleId,
      scenario: detection.scenario,
      openingJp1,
      openingJp2,
      cycleDrawCountBefore: ledgerEntry.seq - 1,
      // cycleNo của cycle CHỨA kỳ T — PrepareSettle đọc cycle theo số này
      // (getCycleByNo) thay vì getActiveCycle, để xử lý đúng cả khi cycle đã
      // closed (kỳ T trúng JP1, chưa có kỳ sau → chưa có active cycle).
      cycleNo: ledgerEntry.cycleNo,
      // TYPE_B1 + TYPE_B2: FinalizeSettle bỏ qua updateCycle, DBA chốt cycle
      // thủ công sau (B1: 1 lần; B2: sau mỗi kỳ cascade). Chỉ TYPE_A worker tự ghi.
      skipCycleUpdate: requiresDbaCycle,
      cascadeOpeningUpdate,
    };

    // ── Step 6: acquire business lock ────────────────────────────────────
    const lockKey = buildResettleLockKey(GameProduct.Power655, drawId);
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
      }

      // Execution name deterministic theo `(drawId, settledAt.getTime())`.
      // `settledAt` chỉ đổi khi FinalizeSettle hoàn tất → đảm bảo mỗi phiên
      // resettle có execution name khác nhau. KHÔNG dùng resettleId (thay đổi mỗi retry).
      const settledAtToken = draw.settledAt.getTime();
      await startExecution({
        stateMachineArn: input.RESETTLE_SFN_ARN,
        name: `${toExecutionName(drawId)}-resettle-${settledAtToken}`,
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

      logError("TriggerResettle Power655", err, { drawId, resettleId });
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
   * Resolve opening JP1/2 cho kỳ đang resettle dựa trên bất biến ledger theo
   * THỜI GIAN: opening(K) = trạng thái jackpot SAU kỳ settle liền trước K, có
   * điều chỉnh theo winner/reset boundary của kỳ đó.
   *
   * Dùng `findClosingStateBeforeDraw(drawId)` — kỳ settle liền trước theo `drawId`
   * (thời gian), XUYÊN CYCLE. Đây là điểm mấu chốt cho cross-cycle cascade.
   *
   * Quy tắc per-jackpot (JP1 và JP2 ĐỘC LẬP vì JP1 đóng cycle, JP2 reset-only):
   *
   *   openingJp1(K) = prev.hasJp1Winner ? fallbackJp1 : prev.closingJp1
   *   openingJp2(K) = prev.hasJp2Winner ? fallbackJp2 : prev.closingJp2
   *
   * - prev.hasJp1Winner → prev đóng cycle, K mở cycle MỚI → openingJp1(K) = seed
   *   cycle mới. Seed JP1 = config (bất biến với pool) → `fallbackJp1` (ledger(K)
   *   .openingJp1 đã đóng băng = seed) vẫn ĐÚNG dù resettle prev đổi pool. Không
   *   cần cascade-update JP1 (giá trị seed không đổi).
   * - prev.hasJp2Winner → JP2 reset về seed sau prev → openingJp2(K) = seed JP2 =
   *   `fallbackJp2` (đã đóng băng = seed config). Không cascade-update JP2.
   * - Ngược lại (roll-over): openingJp1/2(K) = closingJp1/2(prev). Trong cascade
   *   B2, closing(prev) vừa đổi do resettle kỳ trước → đây là giá trị ĐÚNG, còn
   *   ledger(K).opening cũ ($setOnInsert đóng băng) đã lỗi thời. Bật
   *   `cascadeOpeningUpdate=true` để FinalizeSettle ghi đè opening ledger(K).
   *
   * LƯU Ý cross-cycle với JP2 carry-over: nếu prev chỉ có JP1 winner (đóng cycle),
   * JP2 KHÔNG reset → carry sang cycle mới = closingJp2(prev). Công thức trên cho
   * openingJp2(K) = prev.closingJp2 (vì prev.hasJp2Winner=false) → ĐÚNG, JP2 vẫn
   * cascade-update theo closing(prev) mới sau resettle.
   *
   * @param drawId - drawId của kỳ đang resettle (tìm kỳ liền trước theo thời gian).
   * @param fallbackJp1 - opening JP1 lưu trong ledger(K) — seed khi prev đóng cycle / không có prev.
   * @param fallbackJp2 - opening JP2 lưu trong ledger(K) — seed khi prev reset JP2 / không có prev.
   */
  private async resolveOpening(
    drawId: string,
    fallbackJp1: number,
    fallbackJp2: number,
  ): Promise<{ openingJp1: number; openingJp2: number; cascadeOpeningUpdate: boolean }> {
    const prev = await this.cycleEntryRepo.findClosingStateBeforeDraw(drawId);

    if (!prev) {
      // Kỳ settle đầu tiên trong ledger — không có kỳ trước, opening là seed/carry
      // lưu sẵn. cascadeOpeningUpdate=false (giữ $setOnInsert).
      return { openingJp1: fallbackJp1, openingJp2: fallbackJp2, cascadeOpeningUpdate: false };
    }

    // JP1: winner ở prev → K mở cycle mới → opening = seed (fallback, bất biến config).
    //      roll-over → opening = closingJp1(prev) (cascade-update theo giá trị mới).
    const jp1RollOver = !prev.hasJp1Winner;
    const openingJp1 = jp1RollOver ? prev.closingJp1 : fallbackJp1;

    // JP2: winner ở prev → JP2 reset → opening = seed (fallback config).
    //      không winner → opening = closingJp2(prev) (carry-over, cascade-update).
    const jp2RollOver = !prev.hasJp2Winner;
    const openingJp2 = jp2RollOver ? prev.closingJp2 : fallbackJp2;

    // cascadeOpeningUpdate=true khi BẤT KỲ jackpot nào lấy từ closing(prev): giá trị
    // closing(prev) đã đổi do resettle kỳ trước → phải ghi đè opening ledger(K) để
    // chuỗi opening→closing liên tục. Khi cả hai lấy seed (fallback) thì không cần.
    return {
      openingJp1,
      openingJp2,
      cascadeOpeningUpdate: jp1RollOver || jp2RollOver,
    };
  }

  /**
   * Guard thứ tự cascade (TYPE_B2): đảm bảo mọi kỳ TRƯỚC `drawId` (theo thời gian,
   * XUYÊN CYCLE) đã hoàn tất resettle trước khi resettle kỳ này.
   *
   * Cascade phải chạy TUẦN TỰ theo thời gian (drawId tăng dần) vì opening(K) phụ
   * thuộc closing/seed của kỳ liền trước. Cross-cycle: kỳ trước có thể nằm ở cycle
   * KHÁC → query trực tiếp trên `draws` theo `drawId` (`findPendingResettleBeforeDraw`)
   * thay vì khoá `(cycleNo, seq)`.
   *
   * ── Tối ưu: KHÔNG quét ledger ────────────────────────────────────────────────
   * Guard chỉ cần biết "có kỳ dở gần T nhất không" — query 1 phát trên `draws`
   * (`drawId < T` + status đang resettle + `$expr publishedAt > settledAt`),
   * `findOne` + limit(1). KHÔNG tải toàn bộ chain ledger trước T (tránh O(n) trên
   * game nhiều năm hàng chục nghìn kỳ).
   *
   * Một kỳ trước được coi là "đang dở" nếu đã republish result mới
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
