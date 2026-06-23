import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { toExecutionName } from "@megawin/game-core/utils";
import { startExecution, ExecutionAlreadyExists } from "@megawin/app-core/aws/sf";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

const VOIDABLE_STATUSES = new Set<string>([
  DrawStatus.Scheduled,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
]);

export interface VoidDrawInput extends DrawIdInput {
  /** ARN của Step Function huỷ kỳ quay Lotto 5/35. */
  LOTTO535_VOID_SFN_ARN: string;
  reason: string;
  voidedBy?: string;
}

export interface VoidDrawOutput extends DrawTransitionOutput {
  hasEntriesToVoid: boolean;
}

/**
 * Huỷ kỳ quay Lotto 5/35.
 *
 * Flow:
 *   1. Validate draw status (scheduled/salesClosed/published)
 *   2. CẤM void nếu draw đã từng kết sổ (`settledAt != null`) — kỳ đã kết sổ
 *      là trạng thái cuối, không được huỷ (Lotto 5/35 không có resettle).
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
export class VoidDrawUseCase extends NextApiUseCase<VoidDrawInput, VoidDrawOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: VoidDrawInput): Promise<VoidDrawOutput> {
    if (!input.LOTTO535_VOID_SFN_ARN) {
      throw AppException.badRequest("Worker huỷ kỳ quay Lotto 5/35 không được cấu hình.");
    }

    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    const alreadyVoiding = draw.status === DrawStatus.Voiding || draw.status === DrawStatus.Void;

    if (!alreadyVoiding) {
      // Kỳ đã từng kết sổ (settledAt là high-water mark) → CẤM void. Lotto 5/35
      // không có resettle nên kỳ đã settle là trạng thái cuối, chỉ được giữ
      // nguyên — không huỷ. Defense-in-depth: status Settled vốn không nằm
      // trong VOIDABLE_STATUSES, guard này cho thông báo rõ ràng hơn.
      if (draw.settledAt) {
        throw new AppException(
          "DRAW_INVALID_TRANSITION",
          `Không thể huỷ kỳ quay đã kết sổ (${input.drawId}).`,
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
        voidedBy: input.voidedBy,
        voidedAt: new Date(),
      });

      if (!updated) {
        throw AppException.internal("Huỷ kỳ quay thất bại – race condition.");
      }
    }

    try {
      await startExecution({
        stateMachineArn: input.LOTTO535_VOID_SFN_ARN,
        name: toExecutionName(input.drawId),
        input: { drawId: input.drawId },
      });
    } catch (err) {
      // ExecutionAlreadyExists = phiên huỷ này đã được start trước đó
      // (retry/replay). KHÔNG phải lỗi — coi như thành công idempotent.
      if (!(err instanceof ExecutionAlreadyExists)) {
        throw new AppException(
          "SFN_START_FAILED",
          `Không thể khởi chạy void worker: ${(err as Error).message}`,
        );
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
