import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetDashboardKpisUseCase } from "@megawin/game-core-application/use-cases/reports";
import type { DashboardGameDailyData } from "@megawin/game-core-application/repos";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  fd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compare: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const useCase = new GetDashboardKpisUseCase();

// ── MOCK DATA ─────────────────────────────────────────────────────────────────
// TODO: Xóa MOCK_ENABLED khi DB có dữ liệu thật.
const MOCK_ENABLED = true;

function buildMockKpis(fd: string, compare?: string): DashboardGameDailyData[] {
  const games = [
    {
      product: "lotto535",
      stake: 980_000_000,
      payout: 608_500_000,
      commission: 49_000_000,
      draws: 7,
      entries: 68,
      players: 42,
      win: 372_500_000,
    },
    {
      product: "power655",
      stake: 1_240_000_000,
      payout: 780_000_000,
      commission: 62_000_000,
      draws: 3,
      entries: 45,
      players: 31,
      win: 460_000_000,
    },
    {
      product: "mega645",
      stake: 870_000_000,
      payout: 520_000_000,
      commission: 43_500_000,
      draws: 3,
      entries: 38,
      players: 27,
      win: 350_000_000,
    },
    {
      product: "keno",
      stake: 3_400_000_000,
      payout: 2_890_000_000,
      commission: 170_000_000,
      draws: 96,
      entries: 1840,
      players: 854,
      win: 550_000_000,
    },
    {
      product: "bingo18",
      stake: 580_000_000,
      payout: 440_000_000,
      commission: 29_000_000,
      draws: 48,
      entries: 320,
      players: 178,
      win: 140_000_000,
    },
    {
      product: "max3d",
      stake: 290_000_000,
      payout: 195_000_000,
      commission: 14_500_000,
      draws: 3,
      entries: 92,
      players: 65,
      win: 95_000_000,
    },
    {
      product: "max3dpro",
      stake: 210_000_000,
      payout: 148_000_000,
      commission: 10_500_000,
      draws: 3,
      entries: 67,
      players: 48,
      win: 62_000_000,
    },
  ];

  const rows: DashboardGameDailyData[] = [];

  // Thêm data cho ngày fd
  for (const g of games) {
    const ggr = g.stake - g.payout;
    rows.push({
      gameProduct: g.product,
      financialDate: fd,
      drawCount: g.draws,
      entryCount: g.entries,
      playerCount: g.players,
      totalStake: g.stake,
      totalWin: g.win,
      totalPayout: g.payout,
      ggr,
      totalCommission: g.commission,
      netProfit: ggr - g.commission,
    });
  }

  // Nếu có compare date, thêm data cũ hơn ~15% để có trend
  if (compare) {
    for (const g of games) {
      const factor = 0.85 + Math.random() * 0.1; // ~85-95% so với hôm nay
      const stake = Math.round(g.stake * factor);
      const payout = Math.round(g.payout * factor);
      const commission = Math.round(g.commission * factor);
      const win = Math.round(g.win * factor);
      const ggr = stake - payout;
      rows.push({
        gameProduct: g.product,
        financialDate: compare,
        drawCount: g.draws,
        entryCount: Math.round(g.entries * factor),
        playerCount: Math.round(g.players * factor),
        totalStake: stake,
        totalWin: win,
        totalPayout: payout,
        ggr,
        totalCommission: commission,
        netProfit: ggr - commission,
      });
    }
  }

  return rows;
}
// ── END MOCK ──────────────────────────────────────────────────────────────────

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => {
    // TODO: Xóa block mock này khi DB có dữ liệu thật.
    if (MOCK_ENABLED) {
      const data = buildMockKpis(query.fd, query.compare);
      // apiSuccess({ data }) → body: { success: true, data: { data: rows } }
      // parseResponse unwrap json.data → { data: rows } → .then(r => r.data) = rows
      return NextResponse.json({ success: true, data: { data } });
    }

    return useCase.run(query);
  });
