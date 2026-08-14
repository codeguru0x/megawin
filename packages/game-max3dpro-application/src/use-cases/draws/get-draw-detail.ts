import { UseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { serializeDates } from "@megawin/shared/utils";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type { GetDrawDetailInput, GetDrawDetailOutput } from "./dto/draw.dto";

/**
 * Lấy chi tiết 1 kỳ quay Max 3D Pro — bao gồm result, financial, stats.
 *
 * Dùng cho trang operations (draw command center) và trang chi tiết kỳ quay.
 * Max 3D Pro không có Jackpot nên không cần fetch jackpot snapshot.
 */
export class GetDrawDetailUseCase extends UseCase<GetDrawDetailInput, GetDrawDetailOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: GetDrawDetailInput): Promise<GetDrawDetailOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);

    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    // GetDrawDetailOutput.draw khai type WireType<DrawEntity> (Date → string).
    // serializeDates convert THẬT tại runtime — không cast "as unknown as" (chỉ
    // đổi type, không đổi giá trị, dễ tạo type lie nếu entity thêm field Date mới).
    return { draw: serializeDates(draw) };
  }
}
