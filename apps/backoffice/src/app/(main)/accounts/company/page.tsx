import { CreateCompanyAccountDialog } from "./_components/create-account-dialog";
import { CompanyAccountsTable } from "./_components/accounts-table";

export default function CompanyAccountsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Tài khoản công ty
          </h1>
          <p className="text-muted-foreground text-sm">
            Quản lý tài khoản Admin và Staff của công ty.
          </p>
        </div>
        <CreateCompanyAccountDialog />
      </div>
      <CompanyAccountsTable />
    </div>
  );
}
