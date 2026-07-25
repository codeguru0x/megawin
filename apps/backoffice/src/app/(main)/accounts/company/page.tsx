import { Users } from "lucide-react";

import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

import { CompanyAccountsTable } from "./_components/accounts-table";
import { CreateCompanyAccountDialog } from "./_components/create-account-dialog";

export default function CompanyAccountsPage() {
  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
          >
            <Users className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Tài khoản công ty</h1>
            <p className="text-xs text-muted-foreground">Quản lý tài khoản Admin và Staff của công ty.</p>
          </div>
        </div>
        <CreateCompanyAccountDialog />
      </div>
      <CompanyAccountsTable />
    </div>
  );
}
