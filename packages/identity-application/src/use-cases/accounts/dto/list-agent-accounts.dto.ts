import type { AccountStatus, AgentRole } from "@megawin/identity/entities/account";

export interface ListAgentAccountsOutput {
  accounts: AgentAccountItem[];
}

export interface AgentAccountItem {
  accountId: string;
  username: string;
  displayName: string;
  status: AccountStatus;
  tenantId: string;
  roles: AgentRole[];
  createdAt: string;
  updatedAt: string;
}
