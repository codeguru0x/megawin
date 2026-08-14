export type { GlobalConfigEntity } from "@megawin/game-max3d/entities";

export type {
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
  UpdateOpsInput,
} from "./dto/game-config.dto";
export { GetGlobalConfigUseCase } from "./get-global-config";
export { UpdateGameConfigUseCase } from "./update-game-config";
