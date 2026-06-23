/**
 * Use Case: Trigger Resettle (Max 3D) — bước 2 của workflow Resettle.
 *
 * Bắt đầu phiên kết sổ lại sau khi kết quả đã được republish (`/republish-result`).
 *
 * Flow:
 *   1. Validate draw tồn tại + có result.
 *   2. Phân biệt Resettle thực sự với Settle lần đầu:
 *      - `settledAt == null` → chưa từng settle → reject `DRAW_NEVER_SETTLED`
 *        (chống case staff bấm nhầm "Kết sổ lại" trên draw vừa publish lần đầu).
 *      - `result.publishedAt <= settledAt` → chưa republish kết quả mới → reject
 *        `DRAW_NO_NEW_RESULT`.
 *   3. Validate status: `Published` (chưa transition lần này) hoặc `Settling`
 *      (retry sau lần startExecution fail). Mọi status khác → reject.
 *   4. Sinh `resettleId` (UUIDv7) — propagate xuyên SFN (đi vào input).
 *   5. Acquire business lock `max3d:resettle:{drawId}` TTL 600s qua
 *      `BusinessLockCoordinator`.
 *   6. Transition `Published → Settling` qua `drawRepo.triggerSettle`.
 *      Bỏ qua step này nếu draw đã ở `Settling` (retry).
 *   7. StartExecution Resettle SFN với name **deterministic theo `settledAt`**
 *      (không phải `resettleId`) → AWS idempotent ở mức execution: retry cùng
 *      phiên (status `Settling`) khiến AWS ném `ExecutionAlreadyExists` → use
 *      case BẮT lỗi này, release lock vừa acquire, và coi như thành công.
 *      `settledAt` chỉ thay đổi khi FinalizeSettle
 *      ghi lại lúc kết thúc một phiên resettle → 2 phiên resettle khác nhau
 *      có 2 execution name khác nhau.
 *   8. Rollback lock nếu (6) hoặc (7) fail. KHÔNG cần rollback status: nếu đã
 *      transition `Settling`, bước retry sẽ rơi vào nhánh "đã ở Settling" và
 *      chỉ cần startExecution lại với cùng name → idempotent.
 *
 * IDEMPOTENT (cùng pattern với `TriggerSettleUseCase`):
 * - Status filter cho phép retry an toàn (`Published` lần đầu, `Settling` lần retry).
 * - SFN execution name deterministic theo `(drawId, settledAt)` → AWS idempotent.
 * - `BusinessLockCoordinator` chống 2 staff click cùng lúc → 1 thắng, 1 fail 409.
 *
 * TTL 600s cho Max 3D (cao hơn Bingo 18 = 300s) vì pipeline Max 3D có thêm
 * 4 reporting steps (SyncTicketSummaries, BuildSettleReport, PublishSettleDaily,
 * PublishPlayerDaily) sau FinalizeSettle, cần thêm thời gian chạy.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { buildResettleLockKey, toExecutionName } from "@megawin/game-core/utils";
import { startExecution, ExecutionAlreadyExists } from "@megawin/app-core/aws/sf";
import { generateId, logError } from "@megawin/shared/utils";
import { BusinessLockCoordinator } from "@megawin/worker-core";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { TriggerResettleInput, TriggerResettleOutput } from "./dto/draw.dto";

const RESETTLE_LOCK_TTL_SECONDS = 600; // 10 phút — Max3D pipeline có thêm reporting steps.

export class TriggerResettleUseCase extends NextApiUseCase<
  TriggerResettleInput,
  TriggerResettleOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly lockCoordinator = new BusinessLockCoordinator();

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
    // Edge case: draw vừa publish kết quả lần đầu cũng có status = Published
    // và có result.publishedAt — case đó staff phải bấm "Kết sổ" (trigger-settle),
    // KHÔNG phải "Kết sổ lại" (trigger-resettle).
    //
    // Phân biệt qua settledAt (high-water mark, KHÔNG bị unset khi republish):
    //   - settledAt == null → chưa từng settle → trigger-settle (lần đầu).
    //   - settledAt != null → đã settle ≥ 1 lần → resettle hợp lệ.
    //
    // Thêm điều kiện publishedAt > settledAt để đảm bảo có republish mới
    // (chống case staff bấm nhầm Resettle ngay sau khi settle xong mà chưa republish).
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
    // Cho phép `Published` (lần đầu trigger sau republish) HOẶC `Settling`
    // (retry sau khi lần trước startExecution fail nhưng status đã transition).
    // Mọi status khác → invalid.
    if (draw.status !== DrawStatus.Published && draw.status !== DrawStatus.Settling) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể resettle – draw đang ở "${draw.status}", yêu cầu phải cập nhật kết quả mới trước khi resettle.`,
      );
    }

    // ── Step 4: sinh resettleId (session key cho SFN input) ──────────────
    // Sinh ở đây để propagate xuyên SFN — PrepareResettle Lambda KHÔNG sinh
    // mới (nếu sinh ở Lambda, mỗi retry/replay sẽ ra resettleId khác → phá
    // idempotent snapshot). Pattern chuẩn: BO API sinh, SFN forward.
    //
    // LƯU Ý: resettleId chỉ có vai trò tracing/snapshot key BÊN TRONG SFN.
    // KHÔNG dùng để build execution name — tham khảo step 7 vì sao.
    const resettleId = generateId();

    // ── Step 5: acquire business lock TRƯỚC mọi side-effect ──────────────
    // Acquire ở BO API (KHÔNG ở Lambda) vì:
    //  - 2 staff click cùng lúc → 1 thắng lock, 1 fail HTTP rõ ràng.
    //  - Lock fail → KHÔNG transition status, KHÔNG StartExecution → state sạch.
    //  - Nếu acquire ở Lambda: đã transition Settling + StartExecution OK
    //    nhưng Lambda fail acquire → status kẹt Settling, SFN execution dở.
    const lockKey = buildResettleLockKey(GameProduct.Max3d, drawId);
    const lockOwnerToken = await this.lockCoordinator.acquire({
      lockKey,
      ttlSeconds: RESETTLE_LOCK_TTL_SECONDS,
      heldErrorCode: "RESETTLE_LOCK_HELD",
      heldErrorMessage: `Kỳ quay ${drawId} đang được resettle bởi phiên khác. Vui lòng đợi ~10 phút hoặc liên hệ admin.`,
    });

    // ── Step 6+7: transition status (skip nếu đã Settling) + start SFN ───
    try {
      // Skip transition nếu đã ở Settling (retry case): findOneAndUpdate filter
      // strict status = Published, đã Settling thì sẽ trả null → tránh false
      // positive "DRAW_INVALID_TRANSITION".
      if (draw.status !== DrawStatus.Settling) {
        const updated = await this.drawRepo.triggerSettle(drawId);

        if (!updated) {
          throw new AppException(
            "DRAW_INVALID_TRANSITION",
            `Không thể resettle – draw không còn ở "published".`,
          );
        }
      }

      // Execution name DETERMINISTIC theo `(drawId, settledAt)` để AWS idempotent
      // ở mức StartExecution: retry cùng phiên khiến AWS ném
      // `ExecutionAlreadyExists` (AWS giữ name unique trong 90 ngày) → catch
      // bên dưới coi như thành công.
      //
      // `settledAtToken` ở đây là `settledAt` của lần KẾT SỔ GẦN NHẤT ĐÃ HOÀN TẤT
      // — KHÔNG phải settledAt "của phiên này". Phiên này (đang resettle) chưa
      // có settledAt riêng; FinalizeSettle sẽ ghi lại lúc kết thúc phiên.
      //
      // Vì sao DETERMINISTIC trong 1 phiên dở dang?
      //   `settledAt` chỉ đổi ở cuối SFN (FinalizeSettle). Nếu BO API fail
      //   `startExecution` → SFN chưa start → FinalizeSettle chưa thể chạy →
      //   `settledAt` chưa đổi → token retry vẫn là T → cùng execution name.
      //
      // Vì sao KHÔNG dùng `resettleId`?
      //   resettleId sinh mới mỗi request → mỗi retry có name khác → có thể
      //   tạo nhiều execution cho cùng phiên (nếu lần fail trước thực ra đã
      //   start xong do network blip).
      //
      // resettleId vẫn forward vào SFN input để Lambda dùng làm snapshot key
      // và tracing — KHÔNG liên quan execution name.
      const settledAtToken = draw.settledAt.getTime();
      await startExecution({
        stateMachineArn: input.RESETTLE_SFN_ARN,
        name: `${toExecutionName(drawId)}-${settledAtToken}`,
        input: {
          drawId,
          resettleId,
          lockOwnerToken,
          lockKey,
        },
      });
    } catch (err) {
      // ExecutionAlreadyExists = phiên này đã được start trước đó (retry sau
      // network blip, hoặc lock cũ đã hết TTL nhưng execution vẫn RUNNING).
      // KHÔNG phải lỗi → coi như thành công idempotent.
      const isAlreadyRunning = err instanceof ExecutionAlreadyExists;

      // Luôn release lock token vừa acquire (cả success lẫn fail):
      //  - Idempotent-success: token này không gắn execution nào — execution
      //    đang chạy dùng token cũ, FinalizeSettle của nó tự release.
      //  - Fail thật: release ngay để owner sau retry liền (không đợi TTL).
      // KHÔNG rollback `triggerSettle` (transition Published → Settling): retry
      // tiếp theo sẽ rơi vào nhánh "đã Settling, skip transition" + dùng cùng
      // execution name deterministic → AWS idempotent.
      // `error` chỉ truyền khi fail thật → coordinator ghi `lastError`; còn
      // idempotent-success ghi `lastSuccessAt`.
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

      logError("TriggerResettle", err, { drawId, resettleId });
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
}
