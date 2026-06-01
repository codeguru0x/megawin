/**
 * Use Case: Publish Result (Max 3D)
 *
 * Nhập/sửa kết quả kỳ quay.
 *
 * Cho phép:
 *   - salesClosed → published (lần đầu publish)
 *   - published → published (sửa kết quả trước khi settle)
 *
 * Validate input (20 bộ ba số đúng phân bố 2/4/6/8 + format triplet `/^\d{3}$/`)
 * thực hiện ở route layer qua Zod schema `publishResultSchema` — use-case
 * không validate lại để tránh duplicate.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";
import { nowVN } from "@megawin/shared/utils";

const PUBLISHABLE_STATUSES = new Set<string>([DrawStatus.SalesClosed, DrawStatus.Published]);

export class PublishResultUseCase extends NextApiUseCase<PublishResultInput, PublishResultOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: PublishResultInput): Promise<PublishResultOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
  
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!PUBLISHABLE_STATUSES.has(draw.status)) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể publish kết quả – draw ở trạng thái "${draw.status}".`,
      );
    }

    const publishedAt = nowVN();

    const updated = await this.drawRepo.publishResult(
      input.drawId,
      { ...input.result, publishedAt },
      input.vietlottRef,
    );

    if (!updated) {
      throw AppException.internal(`Publish kết quả kỳ ${input.drawId} thất bại. Vui lòng thử lại.`);
    }

    return {
      drawId: input.drawId,
      status: DrawStatus.Published,
      result: {
        ...input.result,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }
}
