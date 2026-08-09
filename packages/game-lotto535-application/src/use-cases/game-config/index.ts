export type { GlobalConfigEntity } from "@megawin/game-lotto535/entities";

export type {
  GetGameConfigOutput,
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
} from "./dto/game-config.dto";
export { GetGlobalConfigUseCase as GetGlobalConfigApiUseCase } from "./get-global-config";
export { GetGlobalConfigInternalUseCase as GetGlobalConfigUseCase } from "./get-global-config-internal";
export { UpdateGameConfigUseCase } from "./update-game-config";
