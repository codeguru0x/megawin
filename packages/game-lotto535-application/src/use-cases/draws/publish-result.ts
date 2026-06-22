/**
 * Use Case: Publish Result (Lotto 5/35) — single entry point nhập/sửa kết quả.
 *
 * Đã settle: so `isSameLotto535Result` → republish mở resettle hoặc chỉ sửa vietlottRef.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { isSameLotto535Result } from "@megawin/game-lotto535/rules";
import type { DrawVietlottRef } from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";
import { nowVN } from "@megawin/shared/utils";

const PUBLISHABLE_STATUSES = new Set<string>([
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settled,
]);

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
        `Không thể publish kết quả – draw ở trạng thái "${draw.status}".`,
      );
    }

    const winningMain = [...input.winningMain];
    const winningSpecial = input.winningSpecial;
    const publishedAt = nowVN();

    const hasSettledBefore = Boolean(draw.settledAt);

    if (!hasSettledBefore) {
      return this.publishFirstTime(
        input.drawId,
        winningMain,
        winningSpecial,
        publishedAt,
        input.vietlottRef,
      );
    }

    const resultUnchanged = isSameLotto535Result(draw.result!, {
      winningMain,
      winningSpecial,
      publishedAt: draw.result!.publishedAt,
    });

    if (resultUnchanged) {
      if (input.vietlottRef) {
        const updated = await this.drawRepo.updateVietlottRef(input.drawId, input.vietlottRef);

        if (!updated) {
          throw AppException.internal(`Cập nhật Vietlott Ref kỳ ${input.drawId} thất bại.`);
        }
      }

      return {
        drawId: input.drawId,
        status: draw.status,
        result: {
          winningMain,
          winningSpecial,
          publishedAt: (draw.result!.publishedAt ?? publishedAt).toISOString(),
        },
      };
    }

    if (draw.status === DrawStatus.Settled) {
      const updated = await this.drawRepo.republishResultAfterSettled(
        input.drawId,
        { winningMain, winningSpecial, publishedAt },
        input.vietlottRef,
      );

      if (!updated) {
        throw AppException.internal(
          `Sửa kết quả kỳ ${input.drawId} thất bại — draw không còn ở "settled".`,
        );
      }

      return {
        drawId: input.drawId,
        status: DrawStatus.Published,
        result: {
          winningMain,
          winningSpecial,
          publishedAt: publishedAt.toISOString(),
        },
      };
    }

    const updated = await this.drawRepo.publishResult(
      input.drawId,
      { winningMain, winningSpecial, publishedAt },
      input.vietlottRef,
    );

    if (!updated) {
      throw AppException.internal(`Publish kết quả kỳ ${input.drawId} thất bại.`);
    }

    return {
      drawId: input.drawId,
      status: DrawStatus.Published,
      result: {
        winningMain,
        winningSpecial,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }

  private async publishFirstTime(
    drawId: string,
    winningMain: string[],
    winningSpecial: string,
    publishedAt: Date,
    vietlottRef?: DrawVietlottRef,
  ): Promise<PublishResultOutput> {
    const updated = await this.drawRepo.publishResult(
      drawId,
      { winningMain, winningSpecial, publishedAt },
      vietlottRef,
    );

    if (!updated) {
      throw AppException.internal(`Publish kết quả kỳ ${drawId} thất bại.`);
    }

    return {
      drawId,
      status: DrawStatus.Published,
      result: {
        winningMain,
        winningSpecial,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }
}
