/**
 * API Use Case: Get Global Config (Max 3D Pro)
 *
 * Thin adapter cho API route – delegate sang GetGlobalConfigInternalUseCase (InternalUseCase).
 */

import { NextApiUseCase } from "@megawin/next/server";

import type { GetGameConfigOutput } from "./dto/game-config.dto";
import { GetGlobalConfigInternalUseCase } from "./get-global-config-internal";

export class GetGlobalConfigUseCase extends NextApiUseCase<void, GetGameConfigOutput> {
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(): Promise<GetGameConfigOutput> {
    const config = await this.getGlobalConfig.run();
    return { config };
  }
}
