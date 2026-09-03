"use client";

import { useState } from "react";

import type { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { PeriodDetailContent } from "../../_components/period-detail-content";
import { RESULTFEED_GAME_LABELS } from "../../_lib/labels";
import { usePeriodLookupFilters } from "../_lib/use-filters";

/** Trang "Tra cứu kỳ" — nhập game + mã kỳ, hiển thị chi tiết view-only (không action ghi). */
export function PeriodLookupContent() {
  const { gameKey, drawPeriod, lookup } = usePeriodLookupFilters();

  const [gameInput, setGameInput] = useState<ResultFeedGameKey | "">(gameKey ?? "");
  const [periodInput, setPeriodInput] = useState(drawPeriod ?? "");

  function handleSubmit() {
    if (!gameInput || !periodInput.trim()) {
      return;
    }
    lookup(gameInput, periodInput.trim());
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-muted-foreground text-xs">Game</span>
            <Select value={gameInput} onValueChange={(v) => setGameInput(v as ResultFeedGameKey)}>
              <SelectTrigger size="sm" className="h-9 w-44 text-sm">
                <SelectValue placeholder="Chọn game" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RESULTFEED_GAME_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-muted-foreground text-xs">Mã kỳ (drawPeriod)</span>
            <Input
              value={periodInput}
              onChange={(e) => setPeriodInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="VD: 0293945"
              className="h-9 w-44 font-mono text-sm"
            />
          </div>

          <Button className="h-9 gap-1.5" disabled={!gameInput || !periodInput.trim()} onClick={handleSubmit}>
            <Search className="size-3.5" />
            Tra cứu
          </Button>
        </CardContent>
      </Card>

      {gameKey && drawPeriod && (
        <Card className="gap-0 overflow-hidden py-0">
          <CardContent className="px-0 pt-0 pb-0">
            <PeriodDetailContent gameKey={gameKey} drawPeriod={drawPeriod} readOnly />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
