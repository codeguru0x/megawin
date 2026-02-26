import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type { GetGameConfigOutput } from "./dto/game-config.dto";

/**
 * Lấy cấu hình game toàn cục hiện tại.
 * Nếu chưa tồn tại → throw NOT_FOUND (staff cần seed config trước).
 */
export class GetGameConfigUseCase extends NextApiUseCase<
  void,
  GetGameConfigOutput
> {
  private readonly repo = new GameConfigRepository();

  protected async execute(): Promise<GetGameConfigOutput> {
    const config = await this.repo.getGlobalConfig();

    if (!config) {
      throw new AppException(
        "GAME_CONFIG_NOT_FOUND",
        "GameConfig chưa được khởi tạo. Vui lòng chạy seed hoặc tạo config mới."
      );
    }

    return { config };
  }
}
