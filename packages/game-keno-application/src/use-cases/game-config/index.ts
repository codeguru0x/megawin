export { GetGlobalConfigUseCase as GetGlobalConfigApiUseCase } from "./get-global-config";
export { GetGlobalConfigInternalUseCase as GetGlobalConfigUseCase } from "./get-global-config-internal";
export { GetTenantConfigInternalUseCase } from "./get-tenant-config-internal";
export { UpdateGameConfigUseCase } from "./update-game-config";

export type {
  GetGameConfigOutput,
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
} from "./dto/game-config.dto";

export type { GlobalConfigEntity } from "../../infras/mappers/game-config-mapper";
export type { GetTenantConfigInternalInput } from "./get-tenant-config-internal";
