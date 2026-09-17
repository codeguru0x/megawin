"use client";

import { displayVNDateTime } from "@megawin/shared/utils";
import { DollarSign, ExternalLink, Percent, Settings2, ShieldAlert, Trophy } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { JackpotSection } from "./_lib/jackpot-section";
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

export default function Power655ConfigPage() {
  const { data: config, isLoading, isError, error } = useGameConfig();
  const mutation = useUpdateGameConfig();
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringEnum(["jackpot", "prizes", "rates", "play", "ops", "vietlott"]).withDefault("jackpot"),
  );

  const handleSave = (data: Record<string, unknown>) => mutation.mutate(data);

  return (
    <div className="@container/main flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <div className="from-loss to-warning flex size-8 items-center justify-center rounded-lg bg-linear-to-br shadow-sm">
          <Settings2 className="size-4 text-white" />
        </div>
        <div>
          <h1 className="text-foreground text-base font-semibold tracking-tight">Power 6/55 — Cấu hình</h1>
          {config && (
            <p className="text-muted-foreground text-xs tabular-nums">
              v{config.version} · Cập nhật {displayVNDateTime(config.updatedAt)}
            </p>
          )}
        </div>
      </div>

      {isLoading && <ConfigSkeleton />}

      {isError && (
        <div className="border-destructive/50 bg-destructive/10 rounded-lg border p-4">
          <p className="text-destructive text-sm">
            Không thể tải cấu hình: {error instanceof Error ? error.message : "Lỗi không xác định"}
          </p>
        </div>
      )}

      {config && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList variant="line" className="w-full justify-start gap-0 border-b px-0">
            <TabsTrigger value="jackpot" className="gap-1.5">
              <Trophy className="text-loss size-4" />
              Jackpot kép
            </TabsTrigger>
            <TabsTrigger value="prizes" className="gap-1.5">
              <DollarSign className="text-profit size-4" />
              Giải thưởng
            </TabsTrigger>
            <TabsTrigger value="rates" className="gap-1.5">
              <Percent className="text-info size-4" />
              Tài chính
            </TabsTrigger>
            <TabsTrigger value="play" className="gap-1.5">
              <Settings2 className="text-game-max3d size-4" />
              Luật chơi
            </TabsTrigger>
            <TabsTrigger value="ops" className="gap-1.5">
              <ShieldAlert className="text-warning size-4" />
              Vận hành
            </TabsTrigger>
            <TabsTrigger value="vietlott" className="gap-1.5">
              <ExternalLink className="text-info size-4" />
              Vietlott
            </TabsTrigger>
          </TabsList>

          <TabsContent value="jackpot" className="mt-2">
            <JackpotSection config={config} onSave={handleSave} isPending={mutation.isPending} />
          </TabsContent>
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
