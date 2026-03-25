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
 *   - 5 số chính unique, thuộc tập "01"-"35"
 *   - 1 số đặc biệt thuộc tập "01"-"12"
 *
 * Kết quả lưu ĐÚNG THỨ TỰ QUAY (draw order) — không sort.
 *
 * KHÔNG stamp kết quả vào entries ở bước này.
 * Settle worker sẽ đọc result từ draw và cập nhật vào entries khi tính thắng thua.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import {
  LOTTO535_MAIN_COUNT,
  VALID_MAIN_NUMBER_SET,
  VALID_SPECIAL_NUMBER_SET,
} from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";
import { nowVN } from "@megawin/shared/utils";

const PUBLISHABLE_STATUSES = new Set<string>([DrawStatus.SalesClosed, DrawStatus.Published]);

export class PublishResultUseCase extends NextApiUseCase<PublishResultInput, PublishResultOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: PublishResultInput): Promise<PublishResultOutput> {
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

    // Giữ nguyên thứ tự quay (draw order) — KHÔNG sort
    const resultData = {
      winningMain: [...input.winningMain],
      winningSpecial: input.winningSpecial,
      publishedAt: nowVN(),
    };

    const updated = await this.drawRepo.publishResult(
      input.drawId,
      resultData,
      input.vietlottRef,
    );

    if (!updated) {
      throw AppException.internal(
        `Publish kết quả kỳ ${input.drawId} thất bại. Vui lòng thử lại.`,
      );
    }

    return {
      drawId: input.drawId,
      status: DrawStatus.Published,
      result: {
        winningMain: input.winningMain,
        winningSpecial: input.winningSpecial,
        publishedAt: resultData.publishedAt.toISOString(),
      },
    };
  }

  private validateResult(input: PublishResultInput): void {
    const { winningMain, winningSpecial } = input;

    if (!Array.isArray(winningMain) || winningMain.length !== LOTTO535_MAIN_COUNT) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Phải có đúng ${LOTTO535_MAIN_COUNT} số chính.`,
      );
    }

    const uniqueMain = new Set(winningMain);
    if (uniqueMain.size !== LOTTO535_MAIN_COUNT) {
      throw new AppException("DRAW_RESULT_INVALID", "Các số chính phải khác nhau.");
    }

    for (const n of winningMain) {
      if (!VALID_MAIN_NUMBER_SET.has(n)) {
        throw new AppException(
          "DRAW_RESULT_INVALID",
          `Số chính "${n}" không hợp lệ (phải từ "01" đến "35").`,
        );
      }
    }

    if (!VALID_SPECIAL_NUMBER_SET.has(winningSpecial)) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Số đặc biệt "${winningSpecial}" không hợp lệ (phải từ "01" đến "12").`,
      );
    }
  }
}
