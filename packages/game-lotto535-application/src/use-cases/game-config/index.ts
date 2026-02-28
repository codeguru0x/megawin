export { GetGlobalConfigApiUseCase } from "./get-global-config-api";
export { GetGlobalConfigUseCase } from "./get-global-config";
export { UpdateGameConfigUseCase } from "./update-game-config";

export type {
  GetGameConfigOutput,
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
} from "./dto/game-config.dto";

export type { GlobalConfigEntity } from "../../infras/mappers/global-config-mapper";
