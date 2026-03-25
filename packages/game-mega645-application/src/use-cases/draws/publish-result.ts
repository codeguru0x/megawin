/**
 * Use Case: Publish Result (Mega 6/45)
 *
 * Validate: 6 số chính unique, trong range [1,45]. Không có số đặc biệt.
 *
 * Transition:
 *   - salesClosed → published (lần đầu publish)
 *   - published → published (sửa kết quả trước khi settle)
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import {
  MEGA645_NUMBER_COUNT,
  VALID_NUMBER_SET,
} from "@megawin/game-mega645/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";
import { nowVN } from "@megawin/shared/utils";

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
    input: PublishResultInput
  ): Promise<PublishResultOutput> {
    this.validateResult(input);

    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!PUBLISHABLE_STATUSES.has(draw.status)) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể publish kết quả – draw ở trạng thái "${draw.status}", cần "salesClosed" hoặc "published".`
      );
    }

    const winningNumbers = [...input.winningNumbers];
    const publishedAt = nowVN();

    const updated = await this.drawRepo.publishResult(
      input.drawId,
      { winningNumbers, publishedAt },
      input.vietlottRef
    );

    if (!updated) {
      throw AppException.internal(
        `Publish kết quả kỳ ${input.drawId} thất bại. Vui lòng thử lại.`
      );
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

  private validateResult(input: PublishResultInput): void {
    const { winningNumbers } = input;

    if (
      !Array.isArray(winningNumbers) ||
      winningNumbers.length !== MEGA645_NUMBER_COUNT
    ) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Phải có đúng ${MEGA645_NUMBER_COUNT} số chính.`
      );
    }

    const uniqueMain = new Set(winningNumbers);
    if (uniqueMain.size !== MEGA645_NUMBER_COUNT) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        "Các số chính phải khác nhau."
      );
    }

    for (const n of winningNumbers) {
      if (!VALID_NUMBER_SET.has(n)) {
        throw new AppException(
          "DRAW_RESULT_INVALID",
          `Số chính "${n}" không hợp lệ (phải từ "01" đến "45").`
        );
      }
    }
  }
}
