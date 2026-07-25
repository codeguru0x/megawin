import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { serializeDates } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { GetDrawDetailInput, GetDrawDetailOutput } from "./dto/draw.dto";

export class GetDrawDetailUseCase extends NextApiUseCase<GetDrawDetailInput, GetDrawDetailOutput> {
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
