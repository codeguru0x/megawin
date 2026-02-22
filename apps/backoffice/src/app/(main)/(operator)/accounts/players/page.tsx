import { PlayersContent } from "./_components/players-content";

export default function PlayerAccountsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Tài khoản người chơi
        </h1>
        <p className="text-muted-foreground text-sm">
          Xem danh sách người chơi (Player) theo Tenant ID. Tài khoản người chơi
          được tạo thông qua API riêng.
        </p>
      </div>
      <PlayersContent />
    </div>
  );
}
