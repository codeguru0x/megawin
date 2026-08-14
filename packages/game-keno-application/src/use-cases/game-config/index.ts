export type { GlobalConfigEntity } from "@megawin/game-keno/entities";

export type {
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
} from "./dto/game-config.dto";
export { GetGlobalConfigUseCase } from "./get-global-config";
export { UpdateGameConfigUseCase } from "./update-game-config";
