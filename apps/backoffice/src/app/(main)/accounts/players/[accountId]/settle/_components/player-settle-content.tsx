"use client";

import type { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { todayVN } from "@megawin/shared/utils";
import { BarChart3, ChevronRight } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";

import { FinancialDateRangePicker } from "@/components/date-picker";

import { usePlayerOverview, usePlayerProfile } from "../../_shared/queries";
import { DailyByGameView } from "./daily-by-game-view";
import { DrawBreakdownView } from "./draw-breakdown-view";
import { EntryListView } from "./entry-list-view";
import { GameOverviewView } from "./game-overview-view";
import { SettleKpiStrip } from "./settle-kpi-strip";

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

interface PlayerSettleContentProps {
  accountId: string;
}

/**
 * Trang "Tài chính" (settle) mới — 4-level drill-down.
 *
 * URL state (nuqs + history: "push"):
 * - from/to: date range filter (luôn hiển thị)
 * - game: game product đang drill (View 2+)
 * - fd: financialDate đang drill (View 3+)
 * - draw: drawId đang drill (View 4)
 *
 * KPI strip luôn hiện cross-game totals (Phương án A).
 */
export function PlayerSettleContent({ accountId }: PlayerSettleContentProps) {
  const today = todayVN();
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(defaultFrom()));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));

  // Drill state — mỗi level push history
  const [game, setGame] = useQueryState("game", parseAsString);
  const [fd, setFd] = useQueryState("fd", parseAsString);
  const [draw, setDraw] = useQueryState("draw", parseAsString);

  // KPI data — always cross-game (View 1)
  const { data: overviewData, isLoading: overviewLoading } = usePlayerOverview(accountId, from, to);

  // Profile — lấy username cho View 4 entry list
  const { data: profile } = usePlayerProfile(accountId);

  // Determine current drill level
  const currentLevel = draw ? 4 : fd ? 3 : game ? 2 : 1;

  // ── Navigation handlers ──────────────────────────────────────────────
  const navigateToGame = (gameProduct: string) => {
    void setGame(gameProduct, { history: "push" });
  };

  const navigateToDate = (financialDate: string) => {
    void setFd(financialDate, { history: "push" });
  };

  const navigateToDraw = (drawId: string) => {
    void setDraw(drawId, { history: "push" });
  };

  const navigateBackToGames = () => {
    void setGame(null);
    void setFd(null);
    void setDraw(null);
  };

  const navigateBackToDaily = () => {
    void setFd(null);
    void setDraw(null);
  };

  const navigateBackToDraws = () => {
    void setDraw(null);
  };

  // ── Breadcrumb ─────────────────────────────────────────────────────────
  const gameLabel = game ? (GAME_LABELS[game as GameProduct] ?? game) : "";

  return (
    <div className="flex flex-col gap-5">
      {/* Header: breadcrumb + date filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 shrink-0 text-muted-foreground" />
          <SettleBreadcrumb
            level={currentLevel}
            gameLabel={gameLabel}
            fd={fd}
            draw={draw}
            onClickRoot={navigateBackToGames}
            onClickGame={navigateBackToDaily}
            onClickDate={navigateBackToDraws}
          />
        </div>
        {currentLevel === 1 && (
          <FinancialDateRangePicker
            from={from}
            to={to}
            onChange={(f, t) => {
              void setFrom(f);
              void setTo(t);
            }}
          />
        )}
      </div>

      {/* KPI strip — chỉ hiện ở View 1 */}
      {currentLevel === 1 && <SettleKpiStrip data={overviewData} isLoading={overviewLoading} />}

      {/* Views */}
      {currentLevel === 1 && (
        <GameOverviewView data={overviewData} isLoading={overviewLoading} onRowClick={navigateToGame} />
      )}

      {currentLevel === 2 && game && (
        <DailyByGameView accountId={accountId} from={from} to={to} game={game} onRowClick={navigateToDate} />
      )}

      {currentLevel === 3 && game && fd && (
        <DrawBreakdownView accountId={accountId} financialDate={fd} game={game} onRowClick={navigateToDraw} />
      )}

      {currentLevel === 4 && game && fd && draw && (
        <EntryListView
          accountId={accountId}
          financialDate={fd}
          game={game}
          drawId={draw}
          playerDisplayName={profile?.username}
        />
      )}
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

interface SettleBreadcrumbProps {
  level: number;
  gameLabel: string;
  fd: string | null;
  draw: string | null;
  onClickRoot: () => void;
  onClickGame: () => void;
  onClickDate: () => void;
}

function SettleBreadcrumb({
  level,
  gameLabel,
  fd,
  draw,
  onClickRoot,
  onClickGame,
  onClickDate,
}: SettleBreadcrumbProps) {
  if (level === 1) {
    return <span className="text-sm font-medium text-foreground">Báo cáo tài chính</span>;
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <button className="font-medium text-muted-foreground hover:text-foreground" onClick={onClickRoot}>
        Tài chính
      </button>

      {level >= 2 && (
        <>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          {level === 2 ? (
            <span className="font-semibold text-foreground">{gameLabel}</span>
          ) : (
            <button className="font-medium text-muted-foreground hover:text-foreground" onClick={onClickGame}>
              {gameLabel}
            </button>
          )}
        </>
      )}

      {level >= 3 && fd && (
        <>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          {level === 3 ? (
            <span className="font-semibold text-foreground">{fd}</span>
          ) : (
            <button className="font-medium text-muted-foreground hover:text-foreground" onClick={onClickDate}>
              {fd}
            </button>
          )}
        </>
      )}

      {level >= 4 && draw && (
        <>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <span className="font-semibold text-foreground">{draw}</span>
        </>
      )}
    </div>
  );
}
