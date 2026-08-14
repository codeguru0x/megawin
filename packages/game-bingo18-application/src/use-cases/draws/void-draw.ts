import { ExecutionAlreadyExists, startExecution } from "@megawin/app-core/aws/sf";
import { UseCase } from "@megawin/app-core/use-cases";
import type { AuditActor } from "@megawin/audit/logger";
import { DrawStatus } from "@megawin/game-core/entities";
import { toExecutionName } from "@megawin/game-core/utils";
import { AppException } from "@megawin/shared/errors";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { auditDrawVoid } from "../../services/audit-log";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

const VOID_SFN_ARN = process.env.BINGO18_VOID_SFN_ARN!;

const VOIDABLE_STATUSES = new Set<string>([DrawStatus.Scheduled, DrawStatus.SalesClosed, DrawStatus.Published]);

export interface VoidDrawInput extends DrawIdInput {
  reason: string;
  /** Chủ thể thực hiện — thay cho `voidedBy`, dùng cho audit + ghi draw. */
  actor: AuditActor;
}

export interface VoidDrawOutput extends DrawTransitionOutput {
  hasEntriesToVoid: boolean;
}

/**
 * Huỷ kỳ quay Bingo18.
 *
 * Flow:
 *   1. Validate draw status (scheduled/salesClosed/published)
 *   2. CẤM void nếu draw đã từng kết sổ (`settledAt != null`) — kỳ đã kết sổ
 *      chỉ được kết sổ lại (resettle), không được huỷ.
 *   3. Guard thứ tự: chặn nếu còn kỳ trước (drawId nhỏ hơn) chưa hoàn thành
 *      (chưa settled và chưa void) — bắt buộc đóng kỳ cũ nhất trước.
 *   4. Transition draw → void (atomic)
 *      - Nếu draw đã ở void (retry) → skip transition
 *   5. Start Void Step Function (deterministic name → idempotent)
 *
 * Idempotent: staff nhấn lại bao nhiêu lần cũng an toàn.
 * Nếu SF đã đang chạy (cùng deterministic name), AWS ném `ExecutionAlreadyExists`
 * → use case bắt lỗi đó và coi như thành công.
 */
export class VoidDrawUseCase extends UseCase<VoidDrawInput, VoidDrawOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: VoidDrawInput): Promise<VoidDrawOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    const alreadyVoiding = draw.status === DrawStatus.Voiding || draw.status === DrawStatus.Void;

    if (!alreadyVoiding) {
      // Kỳ đã từng kết sổ (settledAt là high-water mark, không bị $unset khi
      // republish) → CẤM void. Sau khi sửa kết quả của kỳ đã settle, status về
      // Published nhưng đây là luồng chờ resettle, không phải kỳ mới — chỉ được
      // kết sổ lại, không được huỷ.
      if (draw.settledAt) {
        throw new AppException(
          "DRAW_INVALID_TRANSITION",
          `Không thể huỷ kỳ quay đã kết sổ (${input.drawId}). ` +
            `Kỳ đã kết sổ chỉ có thể kết sổ lại sau khi sửa kết quả.`,
        );
      }

      // Guard thứ tự đóng kỳ: phải xử lý TUẦN TỰ theo thời gian. Nếu còn kỳ
      // trước đó (drawId < kỳ này) CHƯA HOÀN THÀNH (chưa settled và chưa void)
      // → chặn, bắt buộc đóng kỳ cũ nhất trước. Void là một cách "đóng kỳ" như
      // settle, nên cũng phải theo thứ tự — không được huỷ kỳ chiều khi kỳ sáng
      // còn dở. Không deadlock: operator luôn xử lý kỳ cũ nhất trước, kỳ trước
      // nó chắc chắn đã hoàn thành.
      const unfinishedPrior = await this.drawRepo.findUnfinishedDrawBefore(input.drawId);
      if (unfinishedPrior) {
        throw new AppException(
          "DRAW_VOID_ORDER",
          `Không thể huỷ – kỳ quay ${unfinishedPrior.drawId} trước đó chưa hoàn thành. Phải kết sổ hoặc huỷ các kỳ trước theo thứ tự.`,
        );
      }

      if (!VOIDABLE_STATUSES.has(draw.status)) {
        throw new AppException(
          "DRAW_INVALID_TRANSITION",
          `Không thể huỷ kỳ quay ở trạng thái "${draw.status}". ` +
            `Chỉ huỷ được khi ở scheduled/salesClosed/published.`,
        );
      }

      const updated = await this.drawRepo.voidDraw(input.drawId, draw.status, {
        reason: input.reason,
        voidedBy: input.actor.name,
        voidedAt: new Date(),
      });

      if (!updated) {
        throw AppException.internal("Huỷ kỳ quay thất bại – race condition.");
      }

      // Audit sau khi transition void thành công. Chỉ ghi ở nhánh này (không ở
      // retry idempotent `alreadyVoiding`) để 1 hành động void = 1 record.
      // Fire-and-forget: không chặn nghiệp vụ.
      auditDrawVoid({
        actor: input.actor,
        drawId: input.drawId,
        prevStatus: draw.status,
        reason: input.reason,
      });
    }

    try {
      await startExecution({
        stateMachineArn: VOID_SFN_ARN,
        name: toExecutionName(input.drawId),
        input: { drawId: input.drawId },
      });
    } catch (err) {
      // ExecutionAlreadyExists = phiên huỷ này đã được start trước đó
      // (retry/replay). KHÔNG phải lỗi — coi như thành công idempotent.
      if (!(err instanceof ExecutionAlreadyExists)) {
        throw new AppException("SFN_START_FAILED", `Không thể khởi chạy void worker: ${(err as Error).message}`);
      }
    }

    return {
      drawId: input.drawId,
      previousStatus: alreadyVoiding ? draw.status : draw.status,
      currentStatus: DrawStatus.Voiding,
      hasEntriesToVoid: true,
    };
  }
}
