import { Building2 } from "lucide-react";

import { CreateTenantDialog } from "./_components/create-tenant-dialog";
import { TenantsList } from "./_components/tenants-list";

export default function TenantsPage() {
  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-blue-600 shadow-sm">
            <Building2 className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Ứng dụng (Tenants)
            </h1>
            <p className="text-xs text-muted-foreground">
              Quản lý thông tin ứng dụng, API key và trạng thái hoạt động
            </p>
          </div>
        </div>
        <CreateTenantDialog />
      </div>

      <TenantsList />
    </div>
  );
}
