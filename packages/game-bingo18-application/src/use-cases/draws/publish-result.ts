import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import {
  BINGO18_DRAW_COUNT,
  BINGO18_DICE_MIN,
  BINGO18_DICE_MAX,
} from "@megawin/game-bingo18/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { nowVN } from "@megawin/shared/utils";
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

    const numbers = [...input.numbers];
    const sum = numbers[0]! + numbers[1]! + numbers[2]!;
    const publishedAt = nowVN();

    const resultData = {
      numbers,
      sum,
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
        numbers,
        sum,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }

  private validateResult(input: PublishResultInput): void {
    const { numbers } = input;

    if (!Array.isArray(numbers) || numbers.length !== BINGO18_DRAW_COUNT) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Phải có đúng ${BINGO18_DRAW_COUNT} số.`,
      );
    }

    for (const n of numbers) {
      if (!Number.isInteger(n) || n < BINGO18_DICE_MIN || n > BINGO18_DICE_MAX) {
        throw new AppException(
          "DRAW_RESULT_INVALID",
          `Số phải là số nguyên trong range [${BINGO18_DICE_MIN}, ${BINGO18_DICE_MAX}].`,
        );
      }
    }
  }
}
