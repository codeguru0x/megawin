"use client";

import { Trophy } from "lucide-react";

import { JackpotOverviewSection } from "./_lib/jackpot-overview-section";
import { JackpotHistorySection } from "./_lib/jackpot-history-section";
import { JackpotCyclesSection } from "./_lib/jackpot-cycles-section";

export default function AdminJackpotPage() {
  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-amber-400 to-orange-500 shadow-sm">
          <Trophy className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Lotto 5/35 — Jackpot
          </h1>
          <p className="text-xs text-muted-foreground">
            Theo dõi tích luỹ Jackpot, tiến trình chia giải và lịch sử cycle.
          </p>
        </div>
      </div>

      <JackpotOverviewSection />
      <JackpotHistorySection />
      <JackpotCyclesSection />
    </div>
  );
}
