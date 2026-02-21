import { CreateAgentAccountDialog } from "./_components/create-agent-dialog";
import { AgentAccountsTable } from "./_components/agents-table";

export default function AgentAccountsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Tài khoản đại lý
          </h1>
          <p className="text-muted-foreground text-sm">
            Quản lý tài khoản đại lý (Agent) theo từng Tenant.
          </p>
        </div>
        <CreateAgentAccountDialog />
      </div>
      <AgentAccountsTable />
    </div>
  );
}
