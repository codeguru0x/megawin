/**
 * Use Case: Publish Result (Power 6/55)
 *
 * Nhập/sửa kết quả kỳ quay.
 *
 * Cho phép:
 *   - salesClosed → published (lần đầu publish)
 *   - published → published (sửa kết quả trước khi settle)
 *
 * Validate:
 *   - 6 số chính unique, trong range [1, 55]
 *   - 1 bonus number trong range [1, 55], KHÁC 6 số chính
 *
 * KHÔNG stamp kết quả vào entries ở bước này.
 * Settle worker sẽ đọc result từ draw và cập nhật vào entries khi tính thắng thua.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import type {
  DrawVietlottRef,
} from "@megawin/game-power655/entities";
import {
  POWER655_MAIN_COUNT,
  VALID_MAIN_NUMBER_SET,
} from "@megawin/game-power655/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";
import { nowVN } from "@megawin/shared/utils";

const PUBLISHABLE_STATUSES = new Set<string>([
  DrawStatus.SalesClosed,
  DrawStatus.Published,
]);

/**
 * Publish kết quả kỳ quay Power 6/55.
 * Validate 6 số chính (1-55) + 1 bonus number (1-55, khác 6 số chính).
 */
export class PublishResultUseCase extends NextApiUseCase<
  PublishResultInput,
  PublishResultOutput
> {
  private readonly drawRepo = new DrawRepository();

  /** @inheritdoc */
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

    const winningMain = input.winningMain;
    const bonusNumber = input.bonusNumber;
    const publishedAt = nowVN();

    const vietlottRef: DrawVietlottRef | undefined = input.vietlottRef
      ? {
          drawPeriod: input.vietlottRef.drawPeriod,
          drawDate: input.vietlottRef.drawDate,
        }
      : undefined;

    const updated = await this.drawRepo.publishResult(
      input.drawId,
      { winningMain, bonusNumber, publishedAt },
      vietlottRef
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
        winningMain,
        bonusNumber,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }

  /**
   * Validate kết quả kỳ quay Power 6/55.
   * - 6 số chính unique, range [1, 55]
   * - 1 bonus number range [1, 55], khác tất cả 6 số chính
   */
  private validateResult(input: PublishResultInput): void {
    const { winningMain, bonusNumber } = input;

    if (
      !Array.isArray(winningMain) ||
      winningMain.length !== POWER655_MAIN_COUNT
    ) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Phải có đúng ${POWER655_MAIN_COUNT} số chính.`
      );
    }

    const uniqueMain = new Set(winningMain);
    if (uniqueMain.size !== POWER655_MAIN_COUNT) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        "Các số chính phải khác nhau."
      );
    }

    for (const n of winningMain) {
      if (!VALID_MAIN_NUMBER_SET.has(n)) {
        throw new AppException(
          "DRAW_RESULT_INVALID",
          `Số chính "${n}" không hợp lệ (phải từ "01" đến "55").`
        );
      }
    }

    if (!VALID_MAIN_NUMBER_SET.has(bonusNumber)) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Bonus number "${bonusNumber}" không hợp lệ (phải từ "01" đến "55").`
      );
    }

    if (uniqueMain.has(bonusNumber)) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        "Bonus number không được trùng với bất kỳ số chính nào."
      );
    }
  }
}
