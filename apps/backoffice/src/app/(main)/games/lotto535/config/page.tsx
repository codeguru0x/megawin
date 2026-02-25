"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { useGameConfig, useUpdateGameConfig } from "./_lib/use-game-config";
import { JackpotSection } from "./_lib/jackpot-section";
import { RatesSection } from "./_lib/rates-section";
import { PrizesSection } from "./_lib/prizes-section";
import { PlayRulesSection } from "./_lib/play-rules-section";

function ConfigSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-80 rounded-xl" />
      ))}
    </div>
  );
}

export default function Lotto535ConfigPage() {
  const { data: config, isLoading, isError, error } = useGameConfig();
  const mutation = useUpdateGameConfig();

  const handleSave = (data: Record<string, unknown>) => mutation.mutate(data);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Lotto 5/35 – Cấu hình game
          </h1>
          <p className="text-sm text-muted-foreground">
            Cấu hình toàn cục cho game Lotto 5/35. Chỉ admin MegaWin được chỉnh
            sửa.
          </p>
        </div>
        {config && (
          <Badge variant="outline" className="hidden sm:flex tabular-nums">
            v{config.version}
          </Badge>
        )}
      </div>

      {isLoading && <ConfigSkeleton />}

      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Không thể tải cấu hình:{" "}
            {error instanceof Error ? error.message : "Lỗi không xác định"}
          </p>
        </div>
      )}

      {config && (
        <div className="grid gap-4 lg:grid-cols-2">
          <JackpotSection
            config={config}
            onSave={handleSave}
            isPending={mutation.isPending}
          />
          <RatesSection
            config={config}
            onSave={handleSave}
            isPending={mutation.isPending}
          />
          <PrizesSection
            config={config}
            onSave={handleSave}
            isPending={mutation.isPending}
          />
          <PlayRulesSection
            config={config}
            onSave={handleSave}
            isPending={mutation.isPending}
          />
        </div>
      )}
    </div>
  );
}
