import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { nowVN } from "@megawin/shared/utils";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";

const PUBLISHABLE_STATUSES = new Set<string>([DrawStatus.SalesClosed, DrawStatus.Published]);

/**
 * Use Case: Publish Result (Bingo 18) — publish kết quả lần đầu.
 *
 * Validate input (numbers length + range) thực hiện ở route layer qua Zod
 * schema `publishResultSchema` — use-case không validate lại để tránh duplicate.
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

    const numbers = [...input.numbers];
    const sum = numbers[0]! + numbers[1]! + numbers[2]!;
    const publishedAt = nowVN();

    const resultData = {
      numbers,
      sum,
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
        numbers,
        sum,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }
}
