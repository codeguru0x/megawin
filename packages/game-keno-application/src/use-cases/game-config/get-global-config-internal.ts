/**
 * Use Case: Get Global Config (Keno) – Internal
 *
 * Điểm truy cập duy nhất để lấy global config cho game Keno.
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
import type { GlobalConfigEntity } from "@megawin/game-keno/entities";;

export class GetGlobalConfigInternalUseCase extends InternalUseCase<
  void,
  GlobalConfigEntity
> {
  private readonly repo = new GameConfigRepository();

  protected async execute(): Promise<GlobalConfigEntity> {
    const config = await this.repo.getGlobalConfig();
    if (!config) {
      throw AppException.internal("Keno GameConfig chưa được khởi tạo.");
    }
    return config;
  }
}
