import { MODULES } from "./modules";

const MODULE = MODULES.accounts;

export const accountsKeys = {
  all: [MODULE] as const,
  company: [MODULE, "company"] as const,
  agents: [MODULE, "agents"] as const,
  /** Players theo tenantId — cursor-based (dùng useQuery, không infinite). */
  players: (tenantId: string, cursor?: { after?: string; before?: string }) =>
    [MODULE, "players", { tenantId, ...cursor }] as const,
  /** Search cross-tenant theo accountId (ULID) hoặc username exact/prefix. */
  search: (keyword: string) => [MODULE, "search", { keyword }] as const,
};
