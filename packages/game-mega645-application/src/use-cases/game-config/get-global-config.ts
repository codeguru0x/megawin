/**
 * API Use Case: Get Global Config (Mega 6/45)
 *
 * Thin adapter cho API route – delegate sang GetGlobalConfigInternalUseCase (InternalUseCase).
 * Không trực tiếp gọi repo. Config doc LUÔN tồn tại (đã seed) → không fallback khi thiếu doc.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { GetGlobalConfigInternalUseCase } from "./get-global-config-internal";
import type { GetGameConfigOutput } from "./dto/game-config.dto";

/**
 * API endpoint trả về global config Mega 6/45 cho backoffice.
 * Delegate sang internal GetGlobalConfigInternalUseCase.
 */
export class GetGlobalConfigUseCase extends NextApiUseCase<void, GetGameConfigOutput> {
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(): Promise<GetGameConfigOutput> {
    const config = await this.getGlobalConfig.run();
    return { config };
  }
}
