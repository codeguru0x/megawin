/**
 * Use Case: Get Dashboard Draws — facade RAW gộp draw timeline 7 game, dùng chung giữa dashboard
 * card và tool AI `getDrawsOverview`.
 *
 * ĐẶT Ở ĐÂY (không phải `app/api/dashboard/draws/_lib/`) — di chuyển từ đó (p1-03 §1 mục 3) vì tool
 * AI cần cùng RAW DTO để trả lời "các game đang ở kỳ nào" trong 1 call. Cùng lý do trung lập với
 * `server/use-cases/jackpot/get-current-jackpots.ts`: class này chỉ orchestrate qua `tryLoad` +
 * `Promise.all`, không quyết định shape hiển thị — route dashboard dùng RAW trực tiếp (đã đủ gọn),
 * còn nếu tool AI cần nhãn thêm thì viết mapper riêng ở `server/ai/draws/`.
 *
 * App-level use case — nằm trong backoffice vì orchestrate 7 game draw repos. Không thể đặt ở
 * game-core-application (vi phạm dependency direction).
 *
 * Gọi song song 7 game × 3 status groups qua `tryLoad` (không reject → `Promise.all`):
 *   - Active: đang mở bán / đóng bán / published / settling / voiding — `getUnfinishedDraws`,
 *     KHÔNG lookback theo ngày nên không bỏ sót kỳ kẹt cũ (root cause bug đã fix ở
 *     GetCurrentDraw/GetDrawSelector, áp dụng lại ở đây).
 *   - Settled: N kỳ settled/void gần nhất theo SỐ PHIÊN (`getRecentCompletedDraws`), không lookback
 *     theo ngày — tránh rỗng cho game tần suất thấp (quay 1-3 lần/tuần).
 *   - Scheduled: chưa mở bao giờ, sắp tới — `getUnfinishedDraws([Scheduled], sort asc + limit)`.
 *
 * Keno + Bingo18 → HighFreqGameSummary (aggregate count, không list từng kỳ).
 * 5 game còn lại → DrawTimelineEvent[] chi tiết.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { DrawRepository as Bingo18DrawRepo } from "@megawin/game-bingo18-application/repos";
import type { UnfinishedDrawStatus } from "@megawin/game-core/entities";
import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { DrawRepository as KenoDrawRepo } from "@megawin/game-keno-application/repos";
import { DrawRepository as Lotto535DrawRepo } from "@megawin/game-lotto535-application/repos";
import { DrawRepository as Max3dDrawRepo } from "@megawin/game-max3d-application/repos";
import { DrawRepository as Max3dproDrawRepo } from "@megawin/game-max3dpro-application/repos";
import { DrawRepository as Mega645DrawRepo } from "@megawin/game-mega645-application/repos";
import { DrawRepository as Power655DrawRepo } from "@megawin/game-power655-application/repos";
import { tryLoad } from "@megawin/shared/utils";

import type { DrawEventStatus, DrawTimelineEvent, GetDashboardDrawsOutput, HighFreqGameSummary } from "./types";

/**
 * Statuses mà dashboard coi là "active" — đang diễn ra, chưa settle/void xong.
 * Subset của `UnfinishedDrawStatus`, loại `Scheduled` (xử lý riêng ở nhóm scheduled).
 */
const ACTIVE_STATUSES: readonly UnfinishedDrawStatus[] = [
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Voiding,
];

/** Games tần suất cao — gộp summary thay vì list từng kỳ. */
const HIGH_FREQ_GAMES = new Set<string>([GameProduct.Keno, GameProduct.Bingo18]);

/** Số kỳ settled/void gần nhất hiển thị cho games tần suất thấp (lottery). */
const SETTLED_RECENT_LIMIT = 5;

/** Số kỳ settled/void gần nhất dùng để đếm cho games tần suất cao (chỉ dùng cho count). */
const HIGH_FREQ_SETTLED_LIMIT = 30;

/** Giới hạn scheduled draws cho mỗi game (tránh quá nhiều dữ liệu). */
const SCHEDULED_LIMIT = 5;

/** Label dùng cho log khi 1 game lỗi bất thường. */
const SCOPE = "GetDashboardDraws";

export class GetDashboardDrawsUseCase extends UseCase<void, GetDashboardDrawsOutput> {
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
    // Gọi song song tất cả game × 3 nhóm status.
    //
    // `tryLoad` không bao giờ reject nên dùng `Promise.all` thuần. Trước đây chỗ này dùng
    // `allSettled` + `if (rejected) continue` — NUỐT IM LẶNG: 1 game lỗi DB thì dashboard
    // vẫn trả 200 với timeline thiếu game đó và không ai biết. Nay lỗi bất thường được log
    // error kèm `source` = gameProduct, vẫn degrade từng phần như cũ.
    const results = await Promise.all(
      this.repos.map(({ game, repo }) =>
        tryLoad(() => this.fetchGameDraws(game, repo), { scope: SCOPE, source: game }),
      ),
    );

    const events: DrawTimelineEvent[] = [];
    const highFreqGames: HighFreqGameSummary[] = [];

    for (const data of results) {
      if (data === undefined) {
        continue;
      }

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
      if (od !== 0) {
        return od;
      }
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
      getUnfinishedDraws: (
        statuses: readonly UnfinishedDrawStatus[],
        opts?: { sort?: Record<string, 1 | -1>; limit?: number },
      ) => Promise<DrawLike[]>;
      getRecentCompletedDraws: (limit?: number) => Promise<DrawLike[]>;
    },
  ): Promise<GameDrawResult> {
    const isHighFreq = HIGH_FREQ_GAMES.has(game);

    // Chạy song song 3 queries cho mỗi game
    const [activeDraws, settledDraws, scheduledDraws] = await Promise.all([
      repo.getUnfinishedDraws(ACTIVE_STATUSES),
      repo.getRecentCompletedDraws(isHighFreq ? HIGH_FREQ_SETTLED_LIMIT : SETTLED_RECENT_LIMIT),
      repo.getUnfinishedDraws([DrawStatus.Scheduled], {
        sort: { drawId: 1 },
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
          nextDrawAt: nextScheduled?.drawTime ? new Date(nextScheduled.drawTime).toISOString() : null,
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
