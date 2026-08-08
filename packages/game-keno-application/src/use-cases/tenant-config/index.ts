export type { TenantConfigEntity } from "@megawin/game-keno/entities";

export type {
  GetTenantConfigInput,
  GetTenantConfigOutput,
  ListTenantConfigsOutput,
  UpdateTenantConfigInput,
  UpdateTenantConfigOutput,
} from "./dto/tenant-config.dto";
export { GetTenantConfigUseCase } from "./get-tenant-config";
export type { GetTenantConfigInternalInput } from "./get-tenant-config-internal";
export { GetTenantConfigInternalUseCase } from "./get-tenant-config-internal";
export { ListTenantConfigsUseCase } from "./list-tenant-configs";
export { UpdateTenantConfigUseCase } from "./update-tenant-config";
