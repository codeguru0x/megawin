import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { GetDrawDetailInput, GetDrawDetailOutput } from "./dto/draw.dto";

/**
 * Chi tiết 1 kỳ quay Keno – bao gồm result, financial, stats, settleSummary.
 * Dùng cho trang vận hành Keno backoffice (draw-command-center + result section).
 *
 * Keno không có jackpot — financial chỉ bao gồm revenue, prizes, commission.
 */
export class GetDrawDetailUseCase extends NextApiUseCase<GetDrawDetailInput, GetDrawDetailOutput> {
  private readonly drawRepo = new DrawRepository();

  /** @inheritdoc */
  protected async execute(input: GetDrawDetailInput): Promise<GetDrawDetailOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);

    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    return { draw };
  }
}
