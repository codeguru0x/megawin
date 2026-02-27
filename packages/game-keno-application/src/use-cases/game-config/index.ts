export { GetGameConfigUseCase } from "./get-game-config";
export { UpdateGameConfigUseCase } from "./update-game-config";

export type {
  GetGameConfigOutput,
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
} from "./dto/game-config.dto";

export type { GlobalConfigEntity } from "../../infras/mappers/game-config-mapper";
