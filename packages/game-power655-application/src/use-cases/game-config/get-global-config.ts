/**
 * Use Case: Get Global Config (Power 6/55) – Internal
 *
 * Điểm truy cập duy nhất để lấy global config cho game Power 6/55.
 * Tất cả use cases nên dùng use case này thay vì gọi repo trực tiếp.
 *
 * Sau này có thể thêm in-memory cache / TTL tại đây
 * mà không cần sửa bất kỳ use case nào.
 *
 * Cách dùng từ use case khác:
 *   private readonly getGlobalConfig = new GetGlobalConfigUseCase();
 *   const config = await this.getGlobalConfig.run();
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type { GlobalConfigEntity } from "@megawin/game-power655/entities";

/**
 * Lấy global config Power 6/55 (internal use case).
 * Điểm truy cập trung tâm cho tất cả use cases cần config.
 */
export class GetGlobalConfigUseCase extends InternalUseCase<
  void,
  GlobalConfigEntity
> {
  private readonly repo = new GameConfigRepository();

  /** @inheritdoc */
  protected async execute(): Promise<GlobalConfigEntity> {
    const config = await this.repo.getGlobalConfig();
    if (!config) {
      throw AppException.internal("Power 6/55 GameConfig chưa được khởi tạo.");
    }
    return config;
  }
}
