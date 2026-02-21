import { NextApiUseCase } from "@megawin/next/server";
import { AccountRepository } from "../../infras/repos/account-repo";
import type {
  ListAgentAccountsOutput,
  AgentAccountItem,
} from "./dto/list-agent-accounts.dto";

export class ListAgentAccountsUseCase extends NextApiUseCase<
  void,
  ListAgentAccountsOutput
> {
  protected async execute(): Promise<ListAgentAccountsOutput> {
    const repo = new AccountRepository();
    const agents = await repo.listAgentAccounts();

    const accounts: AgentAccountItem[] = agents.map((agent) => ({
      accountId: agent.accountId,
      username: agent.username,
      displayName: agent.displayName,
      status: agent.status,
      tenantId: agent.tenantId,
      roles: agent.roles,
      createdAt: agent.createdAt.toISOString?.() ?? String(agent.createdAt),
      updatedAt: agent.updatedAt.toISOString?.() ?? String(agent.updatedAt),
    }));

    return { accounts };
  }
}
