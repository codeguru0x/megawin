"use client";

import { Trophy, Percent, Settings2, Shield, Dices } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { useKenoGameConfig, useUpdateKenoGameConfig } from "./_lib/use-game-config";
import { RatesSection } from "./_lib/rates-section";
import { PrizesSection } from "./_lib/prizes-section";
import { SideBetsSection } from "./_lib/side-bets-section";
import { PayoutCapsSection } from "./_lib/payout-caps-section";
import { PlayRulesSection } from "./_lib/play-rules-section";

function ConfigSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-80 rounded-lg" />
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  );
}

export default function KenoConfigPage() {
  const { data: config, isLoading, isError, error } = useKenoGameConfig();
  const mutation = useUpdateKenoGameConfig();

  const handleSave = (data: Record<string, unknown>) => mutation.mutate(data);

  return (
    <div className="@container/main flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-orange-500 to-orange-600 shadow-sm">
            <Settings2 className="size-4 text-white" />
          </div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Keno — Cấu hình
          </h1>
          {config && (
            <Badge
              variant="secondary"
              className="border-blue-200 bg-blue-100 font-mono text-[11px] text-blue-700 tabular-nums dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-400"
            >
              v{config.version}
            </Badge>
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
        <Tabs defaultValue="prizes">
          <TabsList variant="line" className="w-full justify-start gap-0 border-b px-0">
            <TabsTrigger value="prizes" className="gap-1.5">
              <Trophy className="size-4 text-amber-500" />
              Giải thưởng
            </TabsTrigger>
            <TabsTrigger value="sidebets" className="gap-1.5">
              <Dices className="size-4 text-purple-500" />
              Cược bổ sung
            </TabsTrigger>
            <TabsTrigger value="caps" className="gap-1.5">
              <Shield className="size-4 text-red-500" />
              Giới hạn
            </TabsTrigger>
            <TabsTrigger value="rates" className="gap-1.5">
              <Percent className="size-4 text-blue-500" />
              Tài chính
            </TabsTrigger>
            <TabsTrigger value="play" className="gap-1.5">
              <Settings2 className="size-4 text-violet-500" />
              Luật chơi
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prizes" className="mt-2">
            <PrizesSection config={config} onSave={handleSave} isPending={mutation.isPending} />
          </TabsContent>

          <TabsContent value="sidebets" className="mt-2">
            <SideBetsSection config={config} onSave={handleSave} isPending={mutation.isPending} />
          </TabsContent>

          <TabsContent value="caps" className="mt-2">
            <PayoutCapsSection config={config} onSave={handleSave} isPending={mutation.isPending} />
          </TabsContent>

          <TabsContent value="rates" className="mt-2">
            <RatesSection config={config} onSave={handleSave} isPending={mutation.isPending} />
          </TabsContent>

          <TabsContent value="play" className="mt-2">
            <PlayRulesSection config={config} onSave={handleSave} isPending={mutation.isPending} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
