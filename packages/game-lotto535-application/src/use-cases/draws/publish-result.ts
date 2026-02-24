/**
 * Use Case: Publish Result (Lotto 5/35)
 *
 * Nhập kết quả kỳ quay + chuyển trạng thái salesClosed → published.
 *
 * Validate:
 *   - 5 số chính unique, trong range [1,35]
 *   - 1 số đặc biệt trong range [1,12]
 *
 * Side effect:
 *   - Copy result vào tất cả active entries (entries chuyển sang "drawn")
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
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";

export class PublishResultUseCase extends NextApiUseCase<
  PublishResultInput,
  PublishResultOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(
    input: PublishResultInput,
  ): Promise<PublishResultOutput> {
    this.validateResult(input);
    const sortedMain = [...input.winningMain].sort((a, b) => a - b) as unknown as MainTuple;
    const special = input.winningSpecial as Special;

    const updated = await this.drawRepo.publishResult(
      input.drawId,
      {
        winningMain: sortedMain,
        winningSpecial: special,
        source: input.source,
        checksum: input.checksum,
      },
      input.vietlottRef,
    );

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(input.drawId);
      if (!draw) {
        throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
      }
      if (draw.status === DrawStatus.Published) {
        throw new AppException(
          "DRAW_ALREADY_PUBLISHED",
          `Kỳ quay ${input.drawId} đã được publish kết quả.`,
        );
      }
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể publish kết quả – draw ở trạng thái "${draw.status}", cần "salesClosed".`,
      );
    }

    const publishedAt = new Date();
    const entriesUpdated = await this.entryRepo.stampResultOnEntries(
      input.drawId,
      { winningMain: sortedMain, winningSpecial: special, publishedAt },
    );

    return {
      drawId: input.drawId,
      status: DrawStatus.Published,
      result: {
        winningMain: sortedMain as unknown as number[],
        winningSpecial: special,
        publishedAt: publishedAt.toISOString(),
      },
      entriesUpdated,
    };
  }

  /** Validate kết quả quay: 5 số chính unique [1-35] + 1 đặc biệt [1-12]. */
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
      throw new AppException(
        "DRAW_RESULT_INVALID",
        "Các số chính phải khác nhau.",
      );
    }

    for (const n of winningMain) {
      if (!Number.isInteger(n) || n < LOTTO535_MAIN_MIN || n > LOTTO535_MAIN_MAX) {
        throw new AppException(
          "DRAW_RESULT_INVALID",
          `Số chính phải là số nguyên trong range [${LOTTO535_MAIN_MIN}, ${LOTTO535_MAIN_MAX}].`,
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
        `Số đặc biệt phải là số nguyên trong range [${LOTTO535_SPECIAL_MIN}, ${LOTTO535_SPECIAL_MAX}].`,
      );
    }
  }
}
