import { Suspense } from "react";
import { UserCircle } from "lucide-react";

import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

import { PlayersContent } from "./_components/players-content";

export default function PlayerAccountsPage() {
  return (
    <div className="@container/main flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
          >
            <UserCircle className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Tài khoản người chơi
            </h1>
            <p className="text-xs text-muted-foreground">
              Xem danh sách người chơi (Player) theo đại lý.
            </p>
          </div>
        </div>
      </div>
      <Suspense>
        <PlayersContent />
      </Suspense>
    </div>
  );
}
