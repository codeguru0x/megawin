/**
 * Use Case: Get Global Config (Max 3D) – Internal
 *
 * Điểm truy cập duy nhất để lấy global config cho game Max 3D.
 * Tất cả use cases nên dùng use case này thay vì gọi repo trực tiếp.
 *
 * Cách dùng từ use case khác:
 *   private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
 *   const config = await this.getGlobalConfig.run();
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type { GlobalConfigEntity } from "../../infras/mappers/global-config-mapper";

export class GetGlobalConfigInternalUseCase extends InternalUseCase<
  void,
  GlobalConfigEntity
> {
  private readonly repo = new GameConfigRepository();

  protected async execute(): Promise<GlobalConfigEntity> {
    const config = await this.repo.getGlobalConfig();
    if (!config) {
      throw AppException.internal("Max 3D GameConfig chưa được khởi tạo.");
    }
    return config;
  }
}
