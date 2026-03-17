import { MODULES } from "./modules";

const MODULE = MODULES.accounts;

export const accountsKeys = {
  all: [MODULE] as const,
  company: [MODULE, "company"] as const,
  agents: [MODULE, "agents"] as const,
  /** Players theo tenantId — dùng cho useInfiniteQuery (page-based). */
  players: (tenantId: string) => [MODULE, "players", { tenantId }] as const,
};
