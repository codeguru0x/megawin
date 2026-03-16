import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetSystemOutstandingUseCase } from "@megawin/game-core-application/use-cases/reports";
import { NextResponse } from "next/server";

const useCase = new GetSystemOutstandingUseCase();

// ── MOCK DATA ─────────────────────────────────────────────────────────────────
// TODO: Xóa MOCK_ENABLED khi DB có dữ liệu thật.
const MOCK_ENABLED = true;

/** Trạng thái kỳ quay trên draw timeline */
export type DrawEventStatus = "active" | "settled" | "scheduled";

export interface DrawTimelineEvent {
  /** Game product ID */
  gameProduct: string;
  /** Draw ID (dùng cho URL link → /games/:game/operations?draw=:drawId) */
  drawId: string;
  /** Số kỳ hiển thị */
  drawNo: string;
  /**
   * active = chưa voided/settled — đang diễn ra, đang chơi.
   * settled = mới settle hoặc void trong 48h.
   * scheduled = chưa bao giờ mở, chờ đến giờ.
   */
  status: DrawEventStatus;
  /** Thời điểm quay / dự kiến quay (ISO string) */
  drawAt: string;
  /** Số entries đang pending (chỉ có khi status = active) */
  pendingEntries?: number;
  /** Tổng stake pending VND (chỉ có khi status = active) */
  pendingStake?: number;
}

/**
 * Summary cho games tần suất cao (keno, bingo18).
 *
 * Trên dashboard không liệt kê từng kỳ mà gộp thành 1 dòng summary
 * vì mỗi game có hàng chục kỳ outstanding cùng lúc.
 */
export interface HighFreqGameSummary {
  gameProduct: string;
  /** Số kỳ đang diễn ra (active) */
  activeCount: number;
  /** Số kỳ đã hoàn thành gần đây (settled/voided 48h) */
  settledCount: number;
  /** Số kỳ chờ mở (scheduled) */
  scheduledCount: number;
  /** Kỳ tiếp theo (nearest scheduled) — ISO string */
  nextDrawAt: string | null;
  /** Tổng entries đang pending across all active draws */
  totalPendingEntries: number;
  /** Tổng stake pending VND */
  totalPendingStake: number;
}

export interface GetDashboardDrawsOutput {
  /** Events chi tiết cho games tần suất thấp (lottery) */
  events: DrawTimelineEvent[];
  /** Summary cho games tần suất cao (keno, bingo18) */
  highFreqGames: HighFreqGameSummary[];
  /** Thời điểm snapshot (ISO string) */
  snapshotAt: string;
}

function buildMockDraws(): GetDashboardDrawsOutput {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString();
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  const in_ = (min: number) => new Date(now.getTime() + min * 60_000);

  // ── Games tần suất cao → summary ──────────────────────────────────────────
  const highFreqGames: HighFreqGameSummary[] = [
    {
      gameProduct: "keno",
      activeCount: 5,
      settledCount: 18,
      scheduledCount: 24,
      nextDrawAt: fmt(in_(6)),
      totalPendingEntries: 1_842,
      totalPendingStake: 197_200_000,
    },
    {
      gameProduct: "bingo18",
      activeCount: 3,
      settledCount: 12,
      scheduledCount: 15,
      nextDrawAt: fmt(in_(11)),
      totalPendingEntries: 584,
      totalPendingStake: 76_800_000,
    },
  ];

  // ── Games tần suất thấp → events chi tiết (nhiều data để test scroll) ──
  const events: DrawTimelineEvent[] = [
    // Active — các kỳ đang diễn ra
    {
      gameProduct: "lotto535",
      drawId: "LT535-00284",
      drawNo: "00284",
      status: "active",
      drawAt: fmt(ago(8)),
      pendingEntries: 156,
      pendingStake: 24_500_000,
    },
    {
      gameProduct: "mega645",
      drawId: "MG645-00919",
      drawNo: "00919",
      status: "active",
      drawAt: fmt(ago(3)),
      pendingEntries: 423,
      pendingStake: 68_200_000,
    },
    {
      gameProduct: "power655",
      drawId: "PW655-00612",
      drawNo: "00612",
      status: "active",
      drawAt: fmt(ago(12)),
      pendingEntries: 312,
      pendingStake: 51_800_000,
    },
    {
      gameProduct: "max3d",
      drawId: "MAX3D-00742",
      drawNo: "00742",
      status: "active",
      drawAt: fmt(ago(5)),
      pendingEntries: 87,
      pendingStake: 12_300_000,
    },

    // Settled — các kỳ vừa settle/void trong 48h
    {
      gameProduct: "mega645",
      drawId: "MG645-00918",
      drawNo: "00918",
      status: "settled",
      drawAt: fmt(ago(45)),
    },
    {
      gameProduct: "power655",
      drawId: "PW655-00611",
      drawNo: "00611",
      status: "settled",
      drawAt: fmt(ago(90)),
    },
    {
      gameProduct: "lotto535",
      drawId: "LT535-00283",
      drawNo: "00283",
      status: "settled",
      drawAt: fmt(ago(180)),
    },
    {
      gameProduct: "max3d",
      drawId: "MAX3D-00741",
      drawNo: "00741",
      status: "settled",
      drawAt: fmt(ago(240)),
    },
    {
      gameProduct: "max3dpro",
      drawId: "MAX3DPRO-00511",
      drawNo: "00511",
      status: "settled",
      drawAt: fmt(ago(360)),
    },
    {
      gameProduct: "mega645",
      drawId: "MG645-00917",
      drawNo: "00917",
      status: "settled",
      drawAt: fmt(ago(720)),
    },
    {
      gameProduct: "power655",
      drawId: "PW655-00610",
      drawNo: "00610",
      status: "settled",
      drawAt: fmt(ago(1080)),
    },
    {
      gameProduct: "lotto535",
      drawId: "LT535-00282",
      drawNo: "00282",
      status: "settled",
      drawAt: fmt(ago(1440)),
    },

    // Scheduled — các kỳ chưa mở
    {
      gameProduct: "lotto535",
      drawId: "LT535-00285",
      drawNo: "00285",
      status: "scheduled",
      drawAt: fmt(in_(35)),
    },
    {
      gameProduct: "power655",
      drawId: "PW655-00613",
      drawNo: "00613",
      status: "scheduled",
      drawAt: fmt(in_(50)),
    },
    {
      gameProduct: "max3d",
      drawId: "MAX3D-00743",
      drawNo: "00743",
      status: "scheduled",
      drawAt: fmt(in_(65)),
    },
    {
      gameProduct: "max3dpro",
      drawId: "MAX3DPRO-00512",
      drawNo: "00512",
      status: "scheduled",
      drawAt: fmt(in_(80)),
    },
    {
      gameProduct: "mega645",
      drawId: "MG645-00920",
      drawNo: "00920",
      status: "scheduled",
      drawAt: fmt(in_(110)),
    },
    {
      gameProduct: "lotto535",
      drawId: "LT535-00286",
      drawNo: "00286",
      status: "scheduled",
      drawAt: fmt(in_(155)),
    },
    {
      gameProduct: "power655",
      drawId: "PW655-00614",
      drawNo: "00614",
      status: "scheduled",
      drawAt: fmt(in_(200)),
    },
    {
      gameProduct: "max3d",
      drawId: "MAX3D-00744",
      drawNo: "00744",
      status: "scheduled",
      drawAt: fmt(in_(260)),
    },
    {
      gameProduct: "max3dpro",
      drawId: "MAX3DPRO-00513",
      drawNo: "00513",
      status: "scheduled",
      drawAt: fmt(in_(320)),
    },
    {
      gameProduct: "mega645",
      drawId: "MG645-00921",
      drawNo: "00921",
      status: "scheduled",
      drawAt: fmt(in_(400)),
    },
  ];

  // Sort: active → settled (gần nhất trước) → scheduled (sớm nhất trước)
  const order: Record<DrawEventStatus, number> = { active: 0, settled: 1, scheduled: 2 };
  events.sort((a, b) => {
    const od = order[a.status] - order[b.status];
    if (od !== 0) return od;
    if (a.status === "settled") {
      // Settled: gần nhất trước (desc)
      return new Date(b.drawAt).getTime() - new Date(a.drawAt).getTime();
    }
    return new Date(a.drawAt).getTime() - new Date(b.drawAt).getTime();
  });

  return { events, highFreqGames, snapshotAt: now.toISOString() };
}
// ── END MOCK ──────────────────────────────────────────────────────────────────

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    // TODO: Xóa block mock này khi có real outstanding + schedule API.
    if (MOCK_ENABLED) {
      const data = buildMockDraws();
      return NextResponse.json({ success: true, data });
    }

    return useCase.run();
  });
