/**
 * Use Case: Cập nhật `vietlottRef` cho 1 draw đã publish trở đi.
 *
 * `vietlottRef` là metadata tham chiếu sang Vietlott (drawPeriod, drawDate),
 * KHÔNG tham gia matching numbers / payout calculation → sửa field này
 * KHÔNG yêu cầu resettle.
 *
 * Cho phép ở status `Published`, `Settling`, `Settled`. Trước đó (chưa có
 * result) → staff dùng `publish-result` để nhập cả `numbers` lẫn
 * `vietlottRef` cùng lúc.
 *
 * Atomic. Idempotent — gọi nhiều lần với cùng giá trị OK.
 *
 * INPUT FORMAT đã được zod validate ở route handler qua `vietlottRefSchema`.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { UpdateVietlottRefInput, UpdateVietlottRefOutput } from "./dto/draw.dto";

const UPDATABLE_STATUSES = new Set<string>([
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
]);

export class UpdateVietlottRefUseCase extends NextApiUseCase<
  UpdateVietlottRefInput,
  UpdateVietlottRefOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: UpdateVietlottRefInput): Promise<UpdateVietlottRefOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);

    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!UPDATABLE_STATUSES.has(draw.status)) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể sửa tham chiếu Vietlott — kỳ quay đang ở "${draw.status}". ` +
          `Chỉ sửa được sau khi đã công bố kết quả.`,
      );
    }

    const updated = await this.drawRepo.updateVietlottRef(input.drawId, input.vietlottRef);

    if (!updated) {
      throw AppException.internal(
        `Cập nhật Vietlott Ref kỳ ${input.drawId} thất bại — draw status đã thay đổi.`,
      );
    }

    return {
      drawId: input.drawId,
      vietlottRef: input.vietlottRef,
    };
  }
}
