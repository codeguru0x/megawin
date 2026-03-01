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
import type { MainTuple } from "@megawin/game-mega645/entities";
import {
  MEGA645_MAIN_COUNT,
  MEGA645_MAIN_MIN,
  MEGA645_MAIN_MAX,
} from "@megawin/game-mega645/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";
import { nowVN } from "@megawin/shared/utils/date";

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

    const sortedMain = [...input.winningMain].sort(
      (a, b) => a - b
    ) as unknown as MainTuple;
    const publishedAt = nowVN();

    if (draw.status === DrawStatus.SalesClosed) {
      const updated = await this.drawRepo.publishResult(
        input.drawId,
        { winningMain: sortedMain },
        input.vietlottRef
      );

      if (!updated) {
        throw AppException.internal(
          `Chuyển trạng thái kỳ ${input.drawId} thất bại. Vui lòng thử lại.`
        );
      }
    } else {
      const success = await this.drawRepo.updateResult(
        input.drawId,
        { winningMain: sortedMain, publishedAt },
        input.vietlottRef
      );

      if (!success) {
        throw AppException.internal(
          `Cập nhật kết quả kỳ ${input.drawId} thất bại.`
        );
      }
    }

    return {
      drawId: input.drawId,
      status: DrawStatus.Published,
      result: {
        winningMain: sortedMain as unknown as number[],
        publishedAt: publishedAt.toISOString(),
      },
    };
  }

  private validateResult(input: PublishResultInput): void {
    const { winningMain } = input;

    if (
      !Array.isArray(winningMain) ||
      winningMain.length !== MEGA645_MAIN_COUNT
    ) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Phải có đúng ${MEGA645_MAIN_COUNT} số chính.`
      );
    }

    const uniqueMain = new Set(winningMain);
    if (uniqueMain.size !== MEGA645_MAIN_COUNT) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        "Các số chính phải khác nhau."
      );
    }

    for (const n of winningMain) {
      if (
        !Number.isInteger(n) ||
        n < MEGA645_MAIN_MIN ||
        n > MEGA645_MAIN_MAX
      ) {
        throw new AppException(
          "DRAW_RESULT_INVALID",
          `Số chính phải là số nguyên trong range [${MEGA645_MAIN_MIN}, ${MEGA645_MAIN_MAX}].`
        );
      }
    }
  }
}
