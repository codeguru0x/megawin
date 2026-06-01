import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { computeDrawStats } from "@megawin/game-keno/helpers";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { nowVN } from "@megawin/shared/utils";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";

const PUBLISHABLE_STATUSES = new Set<string>([DrawStatus.SalesClosed, DrawStatus.Published]);

/**
 * Use Case: Publish Result (Keno) — publish kết quả lần đầu.
 *
 * Validate input (winningNumbers length + range + unique) thực hiện ở route
 * layer qua Zod schema `publishResultSchema` — use-case không validate lại
 * để tránh duplicate.
 */
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
        `Không thể publish kết quả – draw ở trạng thái "${draw.status}", cần "salesClosed" hoặc "published".`,
      );
    }

    const publishedAt = nowVN();
    const stats = computeDrawStats(input.winningNumbers);

    const resultData = {
      winningNumbers: input.winningNumbers,
      ...stats,
      publishedAt,
    };

    const updated = await this.drawRepo.publishResult(input.drawId, resultData, input.vietlottRef);

    if (!updated) {
      throw AppException.internal(`Publish kết quả kỳ ${input.drawId} thất bại. Vui lòng thử lại.`);
    }

    return {
      drawId: input.drawId,
      status: DrawStatus.Published,
      result: {
        winningNumbers: input.winningNumbers,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }
}
