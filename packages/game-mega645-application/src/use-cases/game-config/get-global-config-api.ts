import { NextApiUseCase } from "@megawin/next/server";
import { GetGlobalConfigUseCase } from "./get-global-config";
import type { GetGameConfigOutput } from "./dto/game-config.dto";

export class GetGlobalConfigApiUseCase extends NextApiUseCase<
  void,
  GetGameConfigOutput
> {
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(): Promise<GetGameConfigOutput> {
    const config = await this.getGlobalConfig.run();
    return { config };
  }
}
