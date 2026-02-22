import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { Lotto535DrawStatus } from "@megawin/game-lotto535/entities";
import type { Lotto535MainTuple, Lotto535Special } from "@megawin/game-lotto535/entities";
import {
  LOTTO535_MAIN_COUNT,
  LOTTO535_MAIN_MIN,
  LOTTO535_MAIN_MAX,
  LOTTO535_SPECIAL_MIN,
  LOTTO535_SPECIAL_MAX,
} from "@megawin/game-lotto535/entities/lotto535.types";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";

/**
 * Nhập kết quả kỳ quay + chuyển trạng thái sang "published".
 *
 * Flow: drawing -> published
 *
 * Validate:
 * - 5 số chính unique, trong range [1,35]
 * - 1 số đặc biệt trong range [1,12]
 *
 * Side effect:
 * - Copy result vào tất cả active entries (entries chuyển sang "drawn")
 */
export class PublishResultUseCase extends NextApiUseCase<
  PublishResultInput,
  PublishResultOutput
> {
  protected async execute(
    input: PublishResultInput,
  ): Promise<PublishResultOutput> {
    this.validateResult(input);

    const drawRepo = new DrawRepository();
    const entryRepo = new EntryRepository();

    const sortedMain = [...input.winningMain].sort((a, b) => a - b) as unknown as Lotto535MainTuple;
    const special = input.winningSpecial as Lotto535Special;

    const draw = await drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (draw.status === Lotto535DrawStatus.SalesClosed) {
      await drawRepo.transitionStatus(
        input.drawId,
        Lotto535DrawStatus.SalesClosed,
        Lotto535DrawStatus.Drawing,
      );
    }

    const updated = await drawRepo.publishResult(
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
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể publish kết quả – draw không ở trạng thái "drawing".`,
      );
    }

    const publishedAt = new Date();
    const entriesUpdated = await entryRepo.stampResultOnEntries(
      input.drawId,
      { winningMain: sortedMain, winningSpecial: special, publishedAt },
    );

    return {
      drawId: input.drawId,
      status: Lotto535DrawStatus.Published,
      result: {
        winningMain: sortedMain as unknown as number[],
        winningSpecial: special,
        publishedAt: publishedAt.toISOString(),
      },
      entriesUpdated,
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
