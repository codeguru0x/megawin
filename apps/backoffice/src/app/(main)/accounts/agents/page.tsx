import { Building2 } from "lucide-react";

import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

import { CreateAgentAccountDialog } from "./_components/create-agent-dialog";
import { AgentAccountsTable } from "./_components/agents-table";

export default function AgentAccountsPage() {
  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
          >
            <Building2 className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Tài khoản đại lý
            </h1>
            <p className="text-xs text-muted-foreground">
              Quản lý tài khoản đại lý (Agent) theo từng Tenant.
            </p>
          </div>
        </div>
        <CreateAgentAccountDialog />
      </div>
      <AgentAccountsTable />
    </div>
  );
}
