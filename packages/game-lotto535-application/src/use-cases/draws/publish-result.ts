/**
 * Use Case: Publish Result (Lotto 5/35)
 *
 * Nhập/sửa kết quả kỳ quay.
 *
 * Cho phép:
 *   - salesClosed → published (lần đầu publish)
 *   - published → published (sửa kết quả trước khi settle)
 *
 * Validate:
 *   - 5 số chính unique, trong range [1,35]
 *   - 1 số đặc biệt trong range [1,12]
 *
 * KHÔNG stamp kết quả vào entries ở bước này.
 * Settle worker sẽ đọc result từ draw và cập nhật vào entries khi tính thắng thua.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import type { MainTuple, Special } from "@megawin/game-lotto535/entities";
import {
  LOTTO535_MAIN_COUNT,
  LOTTO535_MAIN_MIN,
  LOTTO535_MAIN_MAX,
  LOTTO535_SPECIAL_MIN,
  LOTTO535_SPECIAL_MAX,
} from "@megawin/game-lotto535/entities";
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
    const special = input.winningSpecial as Special;
    const publishedAt = nowVN();

    if (draw.status === DrawStatus.SalesClosed) {
      const updated = await this.drawRepo.publishResult(
        input.drawId,
        { winningMain: sortedMain, winningSpecial: special },
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
        { winningMain: sortedMain, winningSpecial: special, publishedAt },
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
        winningSpecial: special,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }

  private validateResult(input: PublishResultInput): void {
    const { winningMain, winningSpecial } = input;

    if (
      !Array.isArray(winningMain) ||
      winningMain.length !== LOTTO535_MAIN_COUNT
    ) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Phải có đúng ${LOTTO535_MAIN_COUNT} số chính.`
      );
    }

    const uniqueMain = new Set(winningMain);
    if (uniqueMain.size !== LOTTO535_MAIN_COUNT) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        "Các số chính phải khác nhau."
      );
    }

    for (const n of winningMain) {
      if (
        !Number.isInteger(n) ||
        n < LOTTO535_MAIN_MIN ||
        n > LOTTO535_MAIN_MAX
      ) {
        throw new AppException(
          "DRAW_RESULT_INVALID",
          `Số chính phải là số nguyên trong range [${LOTTO535_MAIN_MIN}, ${LOTTO535_MAIN_MAX}].`
        );
      }
    }

    if (
      !Number.isInteger(winningSpecial) ||
      winningSpecial < LOTTO535_SPECIAL_MIN ||
      winningSpecial > LOTTO535_SPECIAL_MAX
    ) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Số đặc biệt phải là số nguyên trong range [${LOTTO535_SPECIAL_MIN}, ${LOTTO535_SPECIAL_MAX}].`
      );
    }
  }
}
