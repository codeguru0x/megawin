import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { GetDrawDetailInput, GetDrawDetailOutput } from "./dto/draw.dto";

/**
 * Chi tiết 1 kỳ quay -- bao gồm result, jackpot, financial, stats.
 * Dùng cho trang chi tiết kỳ quay trên backoffice.
 */
export class GetDrawDetailUseCase extends NextApiUseCase<
  GetDrawDetailInput,
  GetDrawDetailOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(
    input: GetDrawDetailInput,
  ): Promise<GetDrawDetailOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);

    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    return { draw };
  }
}
