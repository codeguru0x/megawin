export { ListTenantConfigsUseCase } from "./list-tenant-configs";
export { GetTenantConfigUseCase } from "./get-tenant-config";
export { GetTenantConfigInternalUseCase } from "./get-tenant-config-internal";
export { UpdateTenantConfigUseCase } from "./update-tenant-config";

export type {
  ListTenantConfigsOutput,
  GetTenantConfigInput,
  GetTenantConfigOutput,
  UpdateTenantConfigInput,
  UpdateTenantConfigOutput,
} from "./dto/tenant-config.dto";

export type { GetTenantConfigInternalInput } from "./get-tenant-config-internal";
export type { TenantConfigEntity } from "@megawin/game-keno/entities";
