"use client";

import { displayVNDateTime } from "@megawin/shared/utils";
import { DollarSign, ExternalLink, Percent, Settings2, ShieldAlert } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { OpsSection } from "./_lib/ops-section";
import { PlayRulesSection } from "./_lib/play-rules-section";
import { PrizesSection } from "./_lib/prizes-section";
import { RatesSection } from "./_lib/rates-section";
import { useGameConfig, useUpdateGameConfig } from "./_lib/use-game-config";
import { VietlottAnchorSection } from "./_lib/vietlott-anchor-section";

function ConfigSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-80 rounded-lg" />
      <Skeleton className="h-105 rounded-xl" />
    </div>
  );
}

export default function Max3dConfigPage() {
  const { data: config, isLoading, isError, error } = useGameConfig();
  const mutation = useUpdateGameConfig();

  const handleSave = (data: Record<string, unknown>) => mutation.mutate(data);

  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringEnum(["prizes", "rates", "play", "ops", "vietlott"]).withDefault("prizes"),
  );

  return (
    <div className="@container/main flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-violet-500 to-violet-600 shadow-sm">
          <Settings2 className="size-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">Max 3D — Cấu hình</h1>
          {config && (
            <p className="text-xs tabular-nums text-muted-foreground">
              v{config.version} · Cập nhật {displayVNDateTime(config.updatedAt)}
            </p>
          )}
        </div>
      </div>

      {isLoading && <ConfigSkeleton />}

      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Không thể tải cấu hình: {error instanceof Error ? error.message : "Lỗi không xác định"}
          </p>
        </div>
      )}

      {config && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList variant="line" className="w-full justify-start gap-0 border-b px-0">
            <TabsTrigger value="prizes" className="gap-1.5">
              <DollarSign className="size-4 text-emerald-500" />
              Giải thưởng
            </TabsTrigger>
            <TabsTrigger value="rates" className="gap-1.5">
              <Percent className="size-4 text-blue-500" /> Tài chính
            </TabsTrigger>
            <TabsTrigger value="play" className="gap-1.5">
              <Settings2 className="size-4 text-violet-500" />
              Luật chơi
            </TabsTrigger>
            <TabsTrigger value="ops" className="gap-1.5">
              <ShieldAlert className="size-4 text-red-500" />
              Vận hành
            </TabsTrigger>
            <TabsTrigger value="vietlott" className="gap-1.5">
              <ExternalLink className="size-4 text-blue-500" />
              Vietlott
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prizes" className="mt-2">
            <PrizesSection config={config} onSave={handleSave} isPending={mutation.isPending} />
          </TabsContent>

          <TabsContent value="rates" className="mt-2">
            <RatesSection config={config} onSave={handleSave} isPending={mutation.isPending} />
          </TabsContent>

          <TabsContent value="play" className="mt-2">
            <PlayRulesSection config={config} onSave={handleSave} isPending={mutation.isPending} />
          </TabsContent>

          <TabsContent value="ops" className="mt-2">
            <OpsSection config={config} onSave={handleSave} isPending={mutation.isPending} />
          </TabsContent>

          <TabsContent value="vietlott" className="mt-2">
            <VietlottAnchorSection config={config} onSave={handleSave} isPending={mutation.isPending} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
