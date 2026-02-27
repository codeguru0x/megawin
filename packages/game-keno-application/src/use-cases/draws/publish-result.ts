import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import {
  KENO_DRAW_COUNT,
  KENO_NUMBER_MIN,
  KENO_NUMBER_MAX,
  KENO_BIG_SMALL_BOUNDARY,
} from "@megawin/game-keno/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { nowVN } from "@megawin/shared/utils/date";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";

const PUBLISHABLE_STATUSES = new Set<string>([
  DrawStatus.SalesClosed,
  DrawStatus.Published,
]);

export class PublishResultUseCase extends NextApiUseCase<
  PublishResultInput,
  PublishResultOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(
    input: PublishResultInput,
  ): Promise<PublishResultOutput> {
    this.validateResult(input);

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

    const sorted = [...input.winningNumbers].sort((a, b) => a - b);
    const publishedAt = nowVN();

    const bigCount = sorted.filter((n) => n > KENO_BIG_SMALL_BOUNDARY).length;
    const smallCount = KENO_DRAW_COUNT - bigCount;
    const evenCount = sorted.filter((n) => n % 2 === 0).length;
    const oddCount = KENO_DRAW_COUNT - evenCount;

    const resultData = {
      winningNumbers: sorted,
      bigCount,
      smallCount,
      evenCount,
      oddCount,
    };

    if (draw.status === DrawStatus.SalesClosed) {
      const updated = await this.drawRepo.publishResult(
        input.drawId,
        resultData,
        input.vietlottRef,
      );

      if (!updated) {
        throw AppException.internal(
          `Chuyển trạng thái kỳ ${input.drawId} thất bại. Vui lòng thử lại.`,
        );
      }
    } else {
      const success = await this.drawRepo.updateResult(
        input.drawId,
        { ...resultData, publishedAt },
        input.vietlottRef,
      );

      if (!success) {
        throw AppException.internal(
          `Cập nhật kết quả kỳ ${input.drawId} thất bại.`,
        );
      }
    }

    return {
      drawId: input.drawId,
      status: DrawStatus.Published,
      result: {
        winningNumbers: sorted,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }

  private validateResult(input: PublishResultInput): void {
    const { winningNumbers } = input;

    if (!Array.isArray(winningNumbers) || winningNumbers.length !== KENO_DRAW_COUNT) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Phải có đúng ${KENO_DRAW_COUNT} số.`,
      );
    }

    const unique = new Set(winningNumbers);
    if (unique.size !== KENO_DRAW_COUNT) {
      throw new AppException("DRAW_RESULT_INVALID", "Các số phải khác nhau.");
    }

    for (const n of winningNumbers) {
      if (!Number.isInteger(n) || n < KENO_NUMBER_MIN || n > KENO_NUMBER_MAX) {
        throw new AppException(
          "DRAW_RESULT_INVALID",
          `Số phải là số nguyên trong range [${KENO_NUMBER_MIN}, ${KENO_NUMBER_MAX}].`,
        );
      }
    }
  }
}
