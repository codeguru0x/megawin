import type { AccountStatus, AgentRole, MfaStatus } from "@megawin/identity/entities";

export interface ListAgentAccountsOutput {
  accounts: AgentAccountItem[];
}

export interface AgentAccountItem {
  accountId: string;
  username: string;
  displayName: string;
  status: AccountStatus;
  mfaStatus: MfaStatus;
  tenantId: string;
  roles: AgentRole[];
  createdAt: string;
  updatedAt: string;
}
