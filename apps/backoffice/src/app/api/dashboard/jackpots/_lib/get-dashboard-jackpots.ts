import { NextApiUseCase } from "@megawin/next/server";
import { GetJackpotCurrentUseCase as Mega645JpUseCase } from "@megawin/game-mega645-application/use-cases/jackpot";
import { GetJackpotCurrentUseCase as Power655JpUseCase } from "@megawin/game-power655-application/use-cases/jackpot";
import { GetJackpotCurrentUseCase as Lotto535JpUseCase } from "@megawin/game-lotto535-application/use-cases/jackpot";
import type { GetJackpotCurrentOutput as Mega645JpOutput } from "@megawin/game-mega645-application/use-cases/jackpot";
import type { GetJackpotCurrentOutput as Power655JpOutput } from "@megawin/game-power655-application/use-cases/jackpot";
import type { GetJackpotCurrentOutput as Lotto535JpOutput } from "@megawin/game-lotto535-application/use-cases/jackpot";
import type {
  DashboardJackpotInfo,
  DashboardPower655JackpotInfo,
  GetDashboardJackpotsOutput,
} from "@/app/api/dashboard/jackpots/_lib/types";

/**
 * Lấy jackpot pool hiện tại cho 3 game có jackpot (Mega645, Power655, Lotto535).
 *
 * App-level use case — nằm trong backoffice vì orchestrate 3 game packages.
 * Không thể đặt ở game-core-application (vi phạm dependency direction).
 *
 * Chạy song song 3 game qua Promise.allSettled:
 *   - 1 game throw (không có active cycle, v.v.) không làm hỏng 2 game còn lại.
 *   - Lotto535 throw AppException khi chưa có active cycle → trả null.
 */
export class GetDashboardJackpotsUseCase extends NextApiUseCase<
  void,
  GetDashboardJackpotsOutput
> {
  private readonly mega645Uc = new Mega645JpUseCase();
  private readonly power655Uc = new Power655JpUseCase();
  private readonly lotto535Uc = new Lotto535JpUseCase();

  protected async execute(): Promise<GetDashboardJackpotsOutput> {
    // Gọi useCase.run() → NextResponse, rồi parse JSON để lấy output.
    // Pattern cần thiết khi orchestrate nhiều game use case không thể đặt ở core layer.
    const [mega645Res, power655Res, lotto535Res] = await Promise.allSettled([
      this.mega645Uc.run().then((r) => r.json() as Promise<{ data: Mega645JpOutput }>),
      this.power655Uc.run().then((r) => r.json() as Promise<{ data: Power655JpOutput }>),
      this.lotto535Uc.run().then((r) => r.json() as Promise<{ data: Lotto535JpOutput }>),
    ]);

    return {
      mega645: this.mapMega645(mega645Res),
      power655: this.mapPower655(power655Res),
      lotto535: this.mapLotto535(lotto535Res),
    };
  }

  private mapMega645(
    result: PromiseSettledResult<{ data: Mega645JpOutput }>,
  ): DashboardJackpotInfo | null {
    if (result.status === "rejected") return null;
    const { cycle, progress } = result.value.data;
    return {
      cycleNo: cycle.cycleNo,
      currentAmount: cycle.currentAmount,
      seedAmount: cycle.seedAmount,
      drawCount: cycle.drawCount,
      progressPercent: progress.percentage,
    };
  }

  private mapPower655(
    result: PromiseSettledResult<{ data: Power655JpOutput }>,
  ): DashboardPower655JackpotInfo | null {
    if (result.status === "rejected") return null;
    const { cycle, config } = result.value.data;
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

  private mapLotto535(
    result: PromiseSettledResult<{ data: Lotto535JpOutput }>,
  ): DashboardJackpotInfo | null {
    if (result.status === "rejected") return null;
    const { cycle, config, progress } = result.value.data;
    return {
      cycleNo: cycle.cycleNo,
      currentAmount: cycle.currentAmount,
      seedAmount: cycle.seedAmount,
      drawCount: cycle.drawCount,
      splitThreshold: config.splitThreshold,
      progressPercent: progress.percentage,
    };
  }
}
