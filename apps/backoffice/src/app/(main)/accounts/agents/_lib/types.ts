import type { AgentAccount } from "./schema";

export interface ListAgentAccountsResponse {
  accounts: AgentAccount[];
  paginationToken?: string;
}

export interface CreateAgentAccountResponse {
  userId: string;
  username: string;
  tenantId: string;
  roles: string[];
}
