/**
 * Use Case: Prepare Max 3D Pro Resettle (Step 1 của Resettle SFN).
 *
 * Trách nhiệm:
 *   1. Validate draw đang ở `Settling` (BO API đã transition `Published → Settling`).
 *   2. Validate `resettleId` đã được caller (BO API) sinh và propagate qua SFN
 *      input — KHÔNG sinh ở đây để đảm bảo retry/replay cùng phiên dùng cùng
 *      `resettleId` (nếu sinh ở đây, mỗi lần Lambda crash + retry sẽ ra
 *      `resettleId` khác → corrupt snapshot).
 *   3. Clear reversal phiên cũ (idempotent, `$unset reversal`).
 *   4. Cursor-loop list candidates → sinh MỚI `reversalTx` per entry → bulk set.
 *   5. Reset entries `Settled → Scheduled` (full `$unset` payout/outcome/result —
 *      Max 3D Pro KHÔNG có `hasCappablePrize`) để Settle SFN replay với kết quả mới.
 *
 * NOTE: `reversalBatchKey` KHÔNG build ở đây — `EnqueueReversalsUseCase` tự
 * derive từ `drawId + resettleId` (theo cùng convention naming với
 * `payoutBatchKey` ở settle path) để giảm field thừa trong SFN ctx.
 *
 * IDEMPOTENT đa tầng:
 *   - status filter: chỉ `Settling` mới qua check.
 *   - clearReversalSnapshot: `$unset reversal` cũ — phiên mới ghi lại.
 *   - bulkSetReversal: filter `status: Settled` → entries đã reset bị skip.
 *   - resetEntriesForResettle: filter `status: Settled` → idempotent.
 *
 * NOTE về `reversalTx`: KHÔNG idempotent absolute với SFN replay nếu Lambda
 * crash giữa `bulkSetReversal` (một số entries đã ghi `reversalTx_v1`, một số
 * chưa). Replay sẽ:
 *   - Skip entries đã ghi (filter `status: Settled` → entries đã ghi reversal
 *     vẫn ở `Settled`, sẽ bị OVERWRITE với `reversalTx_v2` mới).
 *   - Để tránh: Step 3 `clearReversalSnapshot` chạy trước Step 4 → mọi entries
 *     bị clear → re-snapshot toàn bộ với batch UUID mới. Outbox unique index
 *     `tx` đảm bảo nếu `reversalTx_v1` đã enqueue rồi thì v2 KHÔNG enqueue
 *     trùng nhờ idempotency `tx`. Đây là edge case rất hiếm.
 *
 * CRASH-SAFE: SFN retry chạy lại toàn bộ, không corrupt data.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateId } from "@megawin/shared/utils";
import { EntryReversal } from "@megawin/game-max3dpro/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryResettleRepository } from "../../infras/repos/entry-resettle-repo";

const BATCH_SIZE = 500;

export interface PrepareResettleInput {
  drawId: string;
  /**
   * ID phiên resettle (UUIDv7) — sinh tại `TriggerResettle` BO API, BẮT BUỘC
   * propagate qua SFN input. KHÔNG được optional vì retry/replay phải dùng
   * cùng giá trị; sinh mới ở đây sẽ phá idempotency snapshot.
   */
  resettleId: string;

  /** Owner token `WorkerLock` — propagate để `FinalizeSettle` release. */
  lockOwnerToken: string;

  /** Lock key (`{game}:resettle:{drawId}`) — propagate để `FinalizeSettle` release. */
  lockKey: string;
}

/**
 * Output của `PrepareResettleUseCase` — propagate xuôi SFN làm `$resettleCtx`.
 *
 * Chỉ chứa fields mà step kế tiếp (`EnqueueReversals` Lambda + JSONata
 * `StartSettleExecution`) thực sự đọc:
 * - `drawId`, `resettleId`, `lockOwnerToken`, `lockKey` — cả 2 step kế tiếp đều đọc.
 *
 * `reversalBatchKey` KHÔNG còn trả về — `EnqueueReversalsUseCase` tự build từ
 * `drawId + resettleId` để giữ ctx gọn.
 *
 * Metric như `reversalCount` / `resetCount` được log qua CloudWatch, KHÔNG
 * đưa vào output để tránh pollute SFN state.
 */
export interface PrepareResettleOutput {
  drawId: string;
  /** UUIDv7 phiên resettle hiện tại (echo từ input để propagate xuôi SFN). */
  resettleId: string;
  /** Propagate cho `EnqueueReversals` và `FinalizeSettle`. */
  lockOwnerToken: string;
  /** Propagate cho `FinalizeSettle` qua `EnqueueReversals` → SFN context. */
  lockKey: string;
}

export class PrepareResettleUseCase extends InternalUseCase<PrepareResettleInput, PrepareResettleOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryResettleRepo = new EntryResettleRepository();

  protected async execute(input: PrepareResettleInput): Promise<PrepareResettleOutput> {
    const { drawId, resettleId, lockOwnerToken, lockKey } = input;

    // ── Step 1: validate input ────────────────────────────────────────────
    if (!resettleId) {
      throw AppException.badRequest(
        `PrepareResettle yêu cầu resettleId từ caller — không sinh ở đây để đảm bảo idempotent qua replay.`,
      );
    }

    // ── Step 2: validate draw đang Settling ──────────────────────────────
    // BO API (TriggerResettleUseCase) đã transition Published → Settling.
    // SFN chỉ tin tưởng draw đã ở Settling — không transition lại ở đây.
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Settling) {
      throw AppException.badRequest(`Kỳ quay ${drawId} status = "${draw.status}", expected "settling".`);
    }

    // ── Step 3: Clear reversal phiên cũ TRƯỚC khi snapshot phiên mới ─────
    // Phiên resettle thứ N+1 phải xoá reversal của phiên N để snapshot lại
    // với resettleId mới. Cũng đảm bảo idempotent với chính phiên hiện tại
    // khi Lambda replay giữa chừng — entries đã ghi reversalTx_v1 sẽ bị clear,
    // sau đó re-snapshot với reversalTx_v2; outbox `tx` unique index đảm bảo
    // không enqueue trùng nếu v1 đã được dispatch trước đó.
    // Idempotent — modifiedCount = 0 nếu chưa có reversal.
    await this.entryResettleRepo.clearReversalSnapshot(drawId);

    // ── Step 4: Cursor-loop snapshot reversal cho entries có payout ──────
    // PHẢI chạy TRƯỚC reset để đọc payout.payoutAmount.
    let reversalCount = 0;
    let cursorId: string | undefined;

    while (true) {
      const candidates = await this.entryResettleRepo.listCandidatesForReversal({
        drawId,
        afterId: cursorId,
        limit: BATCH_SIZE,
      });

      if (candidates.length === 0) {
        break;
      }

      // Use case sinh UUIDv7 mới làm `reversalTx` per entry — đây là
      // idempotency key cho dispatch transaction MỚI, độc lập với
      // `payout.payoutTx` cũ (transaction cũ đã dispatch xong).
      const items = candidates.map((c) => ({
        entryId: c.id,
        reversal: {
          reversalTx: generateId(),
          reversalAmount: c.payoutAmount,
          resettleId,
        } satisfies EntryReversal,
      }));

      const modifiedCount = await this.entryResettleRepo.bulkSetReversal(items);
      reversalCount += modifiedCount;
      cursorId = candidates[candidates.length - 1]!.id;

      if (candidates.length < BATCH_SIZE) {
        break;
      }
    }

    // ── Step 5: Reset entries Settled → Scheduled (full $unset) ──────────
    // Sau bước này entries quay về trạng thái như chưa từng settle.
    // Settle SFN sẽ replay match logic với kết quả mới.
    // Max 3D Pro KHÔNG có `hasCappablePrize` → repo method tự giới hạn
    // $unset đúng fields applicable cho game này.
    const resetCount = await this.entryResettleRepo.resetEntriesForResettle(drawId);

    console.info("[PrepareResettle] done", { drawId, resettleId, reversalCount, resetCount });

    return {
      drawId,
      resettleId,
      lockOwnerToken,
      lockKey,
    };
  }
}
