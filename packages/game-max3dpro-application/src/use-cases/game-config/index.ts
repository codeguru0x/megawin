export type { GlobalConfigEntity } from "@megawin/game-max3dpro/entities";

export type {
  GetGameConfigOutput,
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
  UpdateOpsInput,
} from "./dto/game-config.dto";
export { GetGlobalConfigUseCase as GetGlobalConfigApiUseCase } from "./get-global-config";
export { GetGlobalConfigInternalUseCase as GetGlobalConfigUseCase } from "./get-global-config-internal";
export { UpdateGameConfigUseCase } from "./update-game-config";
