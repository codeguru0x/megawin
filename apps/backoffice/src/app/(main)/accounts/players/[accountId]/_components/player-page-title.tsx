"use client";

import { CircleUser } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";
import { usePlayerProfile } from "../_shared/queries";

interface PlayerPageTitleProps {
  accountId: string;
}

/**
 * Title động cho trang Player Detail — Client Component.
 *
 * Fetch username qua usePlayerProfile (API route).
 * Loading: skeleton; Error / chưa có: fallback về accountId.
 * Title format: "Tài khoản người chơi" + "@username" sub.
 */
export function PlayerPageTitle({ accountId }: PlayerPageTitleProps) {
  const { data: profile, isLoading } = usePlayerProfile(accountId);

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
      >
        <CircleUser className="size-4.5 text-white" />
      </div>
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Tài khoản người chơi
        </h1>
        {isLoading ? (
          <Skeleton className="mt-0.5 h-3.5 w-28" />
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            {profile?.username ?? accountId}
          </p>
        )}
      </div>
    </div>
  );
}
