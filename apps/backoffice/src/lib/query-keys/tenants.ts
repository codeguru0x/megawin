import { MODULES } from "./modules";

const MODULE = MODULES.tenants;

export const tenantsKeys = {
  all: [MODULE] as const,
  list: [MODULE, "list"] as const,
  options: [MODULE, "options"] as const,
};
