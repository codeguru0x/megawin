"use client";

import {
  Trophy,
  DollarSign,
  Percent,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { useGameConfig, useUpdateGameConfig } from "./_lib/use-game-config";
import { JackpotSection } from "./_lib/jackpot-section";
import { RatesSection } from "./_lib/rates-section";
import { PrizesSection } from "./_lib/prizes-section";
import { PlayRulesSection } from "./_lib/play-rules-section";

function ConfigSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-80 rounded-lg" />
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  );
}

export default function Mega645ConfigPage() {
  const { data: config, isLoading, isError, error } = useGameConfig();
  const mutation = useUpdateGameConfig();

  const handleSave = (data: Record<string, unknown>) => mutation.mutate(data);

  return (
    <div className="@container/main flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-orange-500 to-amber-600 shadow-sm">
            <ShieldCheck className="size-4 text-white" />
          </div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Mega 6/45 — Cấu hình
          </h1>
          {config && (
            <Badge
              variant="secondary"
              className="border-orange-200 bg-orange-100 font-mono text-[11px] text-orange-700 tabular-nums dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-400"
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
            Không thể tải cấu hình:{" "}
            {error instanceof Error ? error.message : "Lỗi không xác định"}
          </p>
        </div>
      )}

      {config && (
        <Tabs defaultValue="jackpot">
          <TabsList
            variant="line"
            className="w-full justify-start gap-0 border-b px-0"
          >
            <TabsTrigger value="jackpot" className="gap-1.5">
              <Trophy className="size-4 text-orange-500" />
              Jackpot
            </TabsTrigger>
            <TabsTrigger value="prizes" className="gap-1.5">
              <DollarSign className="size-4 text-emerald-500" />
              Giải thưởng
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

          <TabsContent value="jackpot" className="mt-2">
            <JackpotSection
              config={config}
              onSave={handleSave}
              isPending={mutation.isPending}
            />
          </TabsContent>

          <TabsContent value="prizes" className="mt-2">
            <PrizesSection
              config={config}
              onSave={handleSave}
              isPending={mutation.isPending}
            />
          </TabsContent>

          <TabsContent value="rates" className="mt-2">
            <RatesSection
              config={config}
              onSave={handleSave}
              isPending={mutation.isPending}
            />
          </TabsContent>

          <TabsContent value="play" className="mt-2">
            <PlayRulesSection
              config={config}
              onSave={handleSave}
              isPending={mutation.isPending}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
