import { InternalUseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type { GlobalConfigEntity } from "../../infras/mappers/global-config-mapper";

export class GetGlobalConfigUseCase extends InternalUseCase<
  void,
  GlobalConfigEntity
> {
  private readonly repo = new GameConfigRepository();

  protected async execute(): Promise<GlobalConfigEntity> {
    const config = await this.repo.getGlobalConfig();
    if (!config) {
      throw AppException.internal("Mega 6/45 GameConfig chưa được khởi tạo.");
    }
    return config;
  }
}
