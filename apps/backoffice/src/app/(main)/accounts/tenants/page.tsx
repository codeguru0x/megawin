import { CreateTenantDialog } from "./_components/create-tenant-dialog";
import { TenantsTable } from "./_components/tenants-table";

export default function TenantsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Ứng dụng (Tenants)
          </h1>
          <p className="text-muted-foreground text-sm">
            Quản lý thông tin ứng dụng, API key và trạng thái hoạt động.
          </p>
        </div>
        <CreateTenantDialog />
      </div>
      <TenantsTable />
    </div>
  );
}
