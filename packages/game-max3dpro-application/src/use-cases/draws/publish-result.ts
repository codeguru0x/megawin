/**
 * Use Case: Publish Result (Max 3D Pro)
 *
 * Nhập/sửa kết quả kỳ quay.
 *
 * Cho phép:
 *   - salesClosed → published (lần đầu publish)
 *   - published → published (sửa kết quả trước khi settle)
 *
 * Validate:
 *   - 20 bộ ba số: 2 ĐB + 4 Nhất + 6 Nhì + 8 Ba
 *   - Mỗi bộ ba phải là string "000"-"999" (regex /^\d{3}$/)
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import {
  MAX3D_PRO_DRAW_COUNT_SPECIAL,
  MAX3D_PRO_DRAW_COUNT_FIRST,
  MAX3D_PRO_DRAW_COUNT_SECOND,
  MAX3D_PRO_DRAW_COUNT_THIRD,
  MAX3D_PRO_DRAW_TOTAL,
} from "@megawin/game-max3dpro/entities";
import type { Max3dproDrawResult, Triplet } from "@megawin/game-max3dpro/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";
import { nowVN } from "@megawin/shared/utils";

const PUBLISHABLE_STATUSES = new Set<string>([
  DrawStatus.SalesClosed,
  DrawStatus.Published,
]);

const TRIPLET_REGEX = /^\d{3}$/;

export class PublishResultUseCase extends NextApiUseCase<
  PublishResultInput,
  PublishResultOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(
    input: PublishResultInput
  ): Promise<PublishResultOutput> {
    this.validateResult(input.result);

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

    const publishedAt = nowVN();

    const updated = await this.drawRepo.publishResult(
      input.drawId,
      { ...input.result, publishedAt },
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
        ...input.result,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }

  private validateResult(result: Max3dproDrawResult): void {
    this.validateTripletArray(
      result.special,
      "special",
      MAX3D_PRO_DRAW_COUNT_SPECIAL
    );
    this.validateTripletArray(
      result.first,
      "first",
      MAX3D_PRO_DRAW_COUNT_FIRST
    );
    this.validateTripletArray(
      result.second,
      "second",
      MAX3D_PRO_DRAW_COUNT_SECOND
    );
    this.validateTripletArray(
      result.third,
      "third",
      MAX3D_PRO_DRAW_COUNT_THIRD
    );

    const total =
      result.special.length +
      result.first.length +
      result.second.length +
      result.third.length;

    if (total !== MAX3D_PRO_DRAW_TOTAL) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Tổng bộ ba số phải là ${MAX3D_PRO_DRAW_TOTAL}, nhận được ${total}.`
      );
    }
  }

  private validateTripletArray(
    triplets: Triplet[],
    tierName: string,
    expectedCount: number
  ): void {
    if (!Array.isArray(triplets) || triplets.length !== expectedCount) {
      throw new AppException(
        "DRAW_RESULT_INVALID",
        `Giải ${tierName} phải có đúng ${expectedCount} bộ ba số, nhận được ${triplets?.length ?? 0}.`
      );
    }

    for (const t of triplets) {
      if (!TRIPLET_REGEX.test(t)) {
        throw new AppException(
          "DRAW_RESULT_INVALID",
          `Bộ ba số "${t}" ở giải ${tierName} không hợp lệ (cần 3 chữ số 000-999).`
        );
      }
    }
  }
}
