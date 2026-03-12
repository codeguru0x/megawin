"use client";

import { Trophy } from "lucide-react";

import { JackpotOverviewSection } from "./_lib/jackpot-overview-section";
import { JackpotHistorySection } from "./_lib/jackpot-history-section";
import { JackpotCyclesSection } from "./_lib/jackpot-cycles-section";

export default function Power655JackpotPage() {
  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-red-500 to-orange-500 shadow-sm">
          <Trophy className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Power 6/55 — Jackpot
          </h1>
          <p className="text-xs text-muted-foreground">
            Dual Jackpot: Jackpot 1 (6/6 số) · Jackpot 2 (5/6 + bonus) — Tích luỹ đến khi có winner.
          </p>
        </div>
      </div>

      <JackpotOverviewSection />
      <JackpotHistorySection />
      <JackpotCyclesSection />
    </div>
  );
}
