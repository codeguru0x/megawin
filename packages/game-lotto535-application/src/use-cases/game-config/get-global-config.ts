/**
 * API Use Case: Get Global Config (Lotto 5/35)
 *
 * Thin adapter cho API route – delegate sang GetGlobalConfigInternalUseCase (InternalUseCase).
 * Không trực tiếp gọi repo.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { GetGlobalConfigInternalUseCase } from "./get-global-config-internal";
import type { GetGameConfigOutput } from "./dto/game-config.dto";

export class GetGlobalConfigUseCase extends NextApiUseCase<
  void,
  GetGameConfigOutput
> {
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(): Promise<GetGameConfigOutput> {
    const config = await this.getGlobalConfig.run();
    return { config };
  }
}
