import { UseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { serializeDates } from "@megawin/shared/utils";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type { GetDrawDetailInput, GetDrawDetailOutput } from "./dto/draw.dto";

/**
 * Chi tiết 1 kỳ quay Power 6/55 – bao gồm result, jackpot (JP1+JP2), financial, stats.
 * Dùng cho trang chi tiết kỳ quay trên backoffice.
 */
export class GetDrawDetailUseCase extends UseCase<GetDrawDetailInput, GetDrawDetailOutput> {
  private readonly drawRepo = new DrawRepository();

  /** @inheritdoc */
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
