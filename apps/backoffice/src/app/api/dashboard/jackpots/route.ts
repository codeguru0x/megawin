import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetDashboardJackpotsUseCase } from "@/app/api/dashboard/jackpots/_lib/get-dashboard-jackpots";
import type { GetDashboardJackpotsOutput } from "@/app/api/dashboard/jackpots/_lib/types";
import { NextResponse } from "next/server";

const useCase = new GetDashboardJackpotsUseCase();

// ── MOCK DATA ─────────────────────────────────────────────────────────────────
// TODO: Xóa MOCK_ENABLED khi DB có dữ liệu jackpot thật.
const MOCK_ENABLED = true;

const MOCK_JACKPOTS: GetDashboardJackpotsOutput = {
  mega645: {
    cycleNo: 12,
    currentAmount: 18_500_000_000,
    seedAmount: 10_000_000_000,
    drawCount: 47,
    progressPercent: 62,
  },
  power655: {
    cycleNo: 8,
    jp1Current: 30_200_000_000,
    jp2Current: 3_000_000_000,
    jp1Seed: 15_000_000_000,
    jp2Seed: 500_000_000,
    drawCount: 31,
    jp1OverflowThreshold: 50_000_000_000,
  },
  lotto535: {
    cycleNo: 5,
    currentAmount: 2_000_000_000,
    seedAmount: 500_000_000,
    drawCount: 14,
    splitThreshold: 5_000_000_000,
    progressPercent: 40,
  },
};
// ── END MOCK ──────────────────────────────────────────────────────────────────

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    // TODO: Xóa block mock này khi DB có dữ liệu thật.
    if (MOCK_ENABLED) {
      return NextResponse.json({ success: true, data: MOCK_JACKPOTS });
    }

    return useCase.run();
  });
