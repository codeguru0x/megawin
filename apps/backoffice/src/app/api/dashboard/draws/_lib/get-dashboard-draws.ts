import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { DrawRepository as Mega645DrawRepo } from "@megawin/game-mega645-application/repos";
import { DrawRepository as Power655DrawRepo } from "@megawin/game-power655-application/repos";
import { DrawRepository as Lotto535DrawRepo } from "@megawin/game-lotto535-application/repos";
import { DrawRepository as KenoDrawRepo } from "@megawin/game-keno-application/repos";
import { DrawRepository as Bingo18DrawRepo } from "@megawin/game-bingo18-application/repos";
import { DrawRepository as Max3dDrawRepo } from "@megawin/game-max3d-application/repos";
import { DrawRepository as Max3dproDrawRepo } from "@megawin/game-max3dpro-application/repos";
import type {
  DrawTimelineEvent,
  DrawEventStatus,
  HighFreqGameSummary,
  GetDashboardDrawsOutput,
} from "./types";

/** Statuses mà dashboard coi là "active" — đang diễn ra, chưa settle/void xong. */
const ACTIVE_STATUSES = [
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Voiding,
];

/** Statuses đã hoàn thành — settle hoặc void. */
const COMPLETED_STATUSES = [DrawStatus.Settled, DrawStatus.Void];

/** Games tần suất cao — gộp summary thay vì list từng kỳ. */
const HIGH_FREQ_GAMES = new Set<string>([GameProduct.Keno, GameProduct.Bingo18]);

/** Lookback 2 ngày cho settled draws. */
const SETTLED_LOOKBACK_DAYS = 2;

/** Giới hạn scheduled draws cho mỗi game (tránh quá nhiều dữ liệu). */
const SCHEDULED_LIMIT = 5;

/** Giới hạn settled draws cho high-freq games (chỉ dùng cho count). */
const HIGH_FREQ_SETTLED_LIMIT = 30;

/**
 * Lấy draw timeline cross-game cho dashboard.
 *
 * App-level use case — nằm trong backoffice vì orchestrate 7 game draw repos.
 * Không thể đặt ở game-core-application (vi phạm dependency direction).
 *
 * Gọi song song 7 game × 3 status groups qua Promise.allSettled:
 *   - Active: đang mở bán / đóng bán / published / settling / voiding
 *   - Settled: settled hoặc void trong 48h gần nhất
 *   - Scheduled: chưa mở bao giờ, sắp tới
 *
 * Keno + Bingo18 → HighFreqGameSummary (aggregate count, không list từng kỳ).
 * 5 game còn lại → DrawTimelineEvent[] chi tiết.
 */
export class GetDashboardDrawsUseCase extends NextApiUseCase<void, GetDashboardDrawsOutput> {
  private readonly repos = [
    { game: GameProduct.Mega645, repo: new Mega645DrawRepo() },
    { game: GameProduct.Power655, repo: new Power655DrawRepo() },
    { game: GameProduct.Lotto535, repo: new Lotto535DrawRepo() },
    { game: GameProduct.Keno, repo: new KenoDrawRepo() },
    { game: GameProduct.Bingo18, repo: new Bingo18DrawRepo() },
    { game: GameProduct.Max3d, repo: new Max3dDrawRepo() },
    { game: GameProduct.Max3dpro, repo: new Max3dproDrawRepo() },
  ];

  protected async execute(): Promise<GetDashboardDrawsOutput> {
    // Gọi song song tất cả game × 3 nhóm status
    const results = await Promise.allSettled(
      this.repos.map(({ game, repo }) => this.fetchGameDraws(game, repo)),
    );

    const events: DrawTimelineEvent[] = [];
    const highFreqGames: HighFreqGameSummary[] = [];

    for (const result of results) {
      if (result.status === "rejected") continue;
      const data = result.value;

      if (data.type === "highFreq") {
        highFreqGames.push(data.summary);
      } else {
        events.push(...data.events);
      }
    }

    // Sort events: active (drawAt asc) → settled (drawAt desc) → scheduled (drawAt asc)
    const statusOrder: Record<DrawEventStatus, number> = { active: 0, settled: 1, scheduled: 2 };
    events.sort((a, b) => {
      const od = statusOrder[a.status] - statusOrder[b.status];
      if (od !== 0) return od;
      // Settled: gần nhất trước (desc), còn lại: sớm nhất trước (asc)
      if (a.status === "settled") {
        return new Date(b.drawAt).getTime() - new Date(a.drawAt).getTime();
      }
      return new Date(a.drawAt).getTime() - new Date(b.drawAt).getTime();
    });

    return { events, highFreqGames, snapshotAt: new Date().toISOString() };
  }

  /**
   * Fetch draws cho 1 game, chia 3 nhóm. High-freq games trả summary, low-freq trả events.
   */
  private async fetchGameDraws(
    game: string,
    repo: {
      getActiveDraws: (
        statuses: string[],
        lookback?: number,
        opts?: { limit?: number },
      ) => Promise<DrawLike[]>;
    },
  ): Promise<GameDrawResult> {
    const isHighFreq = HIGH_FREQ_GAMES.has(game);

    // Chạy song song 3 queries cho mỗi game
    const [activeDraws, settledDraws, scheduledDraws] = await Promise.all([
      repo.getActiveDraws(ACTIVE_STATUSES),
      repo.getActiveDraws(
        COMPLETED_STATUSES,
        SETTLED_LOOKBACK_DAYS,
        isHighFreq ? { limit: HIGH_FREQ_SETTLED_LIMIT } : undefined,
      ),
      repo.getActiveDraws([DrawStatus.Scheduled], undefined, {
        limit: isHighFreq ? 10 : SCHEDULED_LIMIT,
      }),
    ]);

    if (isHighFreq) {
      // Aggregate summary cho Keno / Bingo18
      let totalPendingEntries = 0;
      let totalPendingStake = 0;
      for (const d of activeDraws) {
        totalPendingEntries += d.stats?.ticketEntryCount ?? 0;
        totalPendingStake += d.stats?.totalSalesAmount ?? 0;
      }

      // Kỳ scheduled sớm nhất
      const nextScheduled = scheduledDraws.length > 0 ? scheduledDraws[0] : null;

      return {
        type: "highFreq",
        summary: {
          gameProduct: game,
          activeCount: activeDraws.length,
          settledCount: settledDraws.length,
          scheduledCount: scheduledDraws.length,
          nextDrawAt: nextScheduled?.drawTime
            ? new Date(nextScheduled.drawTime).toISOString()
            : null,
          totalPendingEntries,
          totalPendingStake,
        },
      };
    }

    // Map sang DrawTimelineEvent cho low-freq games
    const mapEvent = (d: DrawLike, status: DrawEventStatus): DrawTimelineEvent => ({
      gameProduct: game,
      drawId: d.drawId,
      drawNo: d.drawNo,
      drawDate: d.drawDate,
      status,
      drawAt: new Date(d.drawTime).toISOString(),
      ...(status === "active" && d.stats
        ? {
            pendingEntries: d.stats.ticketEntryCount,
            pendingStake: d.stats.totalSalesAmount,
          }
        : {}),
    });

    const gameEvents: DrawTimelineEvent[] = [
      ...activeDraws.map((d) => mapEvent(d, "active")),
      ...settledDraws.map((d) => mapEvent(d, "settled")),
      ...scheduledDraws.map((d) => mapEvent(d, "scheduled")),
    ];

    return { type: "lowFreq", events: gameEvents };
  }
}

// ── Internal types ────────────────────────────────────────────────────────────

/** Minimal draw shape — chỉ cần các fields dùng cho timeline. */
interface DrawLike {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: Date;
  status: string;
  stats?: {
    ticketEntryCount: number;
    totalSalesAmount: number;
  };
}

type GameDrawResult =
  | { type: "highFreq"; summary: HighFreqGameSummary }
  | { type: "lowFreq"; events: DrawTimelineEvent[] };
