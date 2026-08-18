import { UseCase } from "@megawin/app-core/use-cases";

import type {
  DashboardJackpotInfo,
  DashboardPower655JackpotInfo,
  GetDashboardJackpotsOutput,
} from "@/app/api/dashboard/jackpots/_lib/types";
import { GetCurrentJackpotsUseCase } from "@/server/use-cases/jackpot/get-current-jackpots";
import type {
  Lotto535JackpotOutput as Lotto535JpOutput,
  Mega645JackpotOutput as Mega645JpOutput,
  Power655JackpotOutput as Power655JpOutput,
} from "@/server/use-cases/jackpot/types";

/**
 * Lấy jackpot pool hiện tại cho 3 game có jackpot (Mega645, Power655, Lotto535), map sang
 * shape hiển thị card dashboard.
 *
 * Orchestration (gọi 3 use-case package qua `tryLoad`, phân loại NOT_FOUND vs lỗi bất thường)
 * đã gộp về `GetCurrentJackpotsUseCase` (`@/server/use-cases/jackpot/`) — class này CHỈ map RAW DTO
 * sang `DashboardJackpotInfo`/`DashboardPower655JackpotInfo`. Tool AI `getGameJackpot` dùng
 * CÙNG facade RAW nhưng map sang contract `ConfigItem` khác — xem giải thích tách 2 mapper ở
 * `get-current-jackpots.ts`.
 */
export class GetDashboardJackpotsUseCase extends UseCase<void, GetDashboardJackpotsOutput> {
  private readonly jackpots = new GetCurrentJackpotsUseCase();

  protected async execute(): Promise<GetDashboardJackpotsOutput> {
    const { mega645, power655, lotto535 } = await this.jackpots.run({});

    // Output contract dùng `null` cho game thiếu dữ liệu; facade trả `undefined`.
    return {
      mega645: mega645 ? mapMega645(mega645) : null,
      power655: power655 ? mapPower655(power655) : null,
      lotto535: lotto535 ? mapLotto535(lotto535) : null,
    };
  }
}

function mapMega645(data: Mega645JpOutput): DashboardJackpotInfo {
  const { cycle, progress } = data;
  return {
    cycleNo: cycle.cycleNo,
    currentAmount: cycle.currentAmount,
    seedAmount: cycle.seedAmount,
    drawCount: cycle.drawCount,
    progressPercent: progress.percentage,
  };
}

function mapPower655(data: Power655JpOutput): DashboardPower655JackpotInfo {
  const { cycle, config } = data;
  return {
    cycleNo: cycle.cycleNo,
    jp1Current: cycle.jackpot1CurrentAmount,
    jp2Current: cycle.jackpot2CurrentAmount,
    jp1Seed: cycle.jackpot1SeedAmount,
    jp2Seed: cycle.jackpot2SeedAmount,
    drawCount: cycle.drawCount,
    jp1OverflowThreshold: config.jp1OverflowThreshold,
  };
}

function mapLotto535(data: Lotto535JpOutput): DashboardJackpotInfo {
  const { cycle, config, progress } = data;
  return {
    cycleNo: cycle.cycleNo,
    currentAmount: cycle.currentAmount,
    seedAmount: cycle.seedAmount,
    drawCount: cycle.drawCount,
    splitThreshold: config.splitThreshold,
    progressPercent: progress.percentage,
  };
}
