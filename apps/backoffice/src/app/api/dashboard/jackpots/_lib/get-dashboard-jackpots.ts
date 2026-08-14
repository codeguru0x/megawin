import { UseCase } from "@megawin/app-core/use-cases";
import type { GetJackpotCurrentOutput as Lotto535JpOutput } from "@megawin/game-lotto535-application/use-cases/jackpot";
import { GetJackpotCurrentUseCase as Lotto535JpUseCase } from "@megawin/game-lotto535-application/use-cases/jackpot";
import type { GetJackpotCurrentOutput as Mega645JpOutput } from "@megawin/game-mega645-application/use-cases/jackpot";
import { GetJackpotCurrentUseCase as Mega645JpUseCase } from "@megawin/game-mega645-application/use-cases/jackpot";
import type { GetJackpotCurrentOutput as Power655JpOutput } from "@megawin/game-power655-application/use-cases/jackpot";
import { GetJackpotCurrentUseCase as Power655JpUseCase } from "@megawin/game-power655-application/use-cases/jackpot";
import { tryLoad } from "@megawin/shared/utils";

import type {
  DashboardJackpotInfo,
  DashboardPower655JackpotInfo,
  GetDashboardJackpotsOutput,
} from "@/app/api/dashboard/jackpots/_lib/types";

/** Label dùng cho log khi 1 game lỗi bất thường. */
const SCOPE = "GetDashboardJackpots";

/**
 * Lấy jackpot pool hiện tại cho 3 game có jackpot (Mega645, Power655, Lotto535).
 *
 * App-level use case — nằm trong backoffice vì orchestrate 3 game packages.
 * Không thể đặt ở game-core-application (vi phạm dependency direction).
 *
 * Gọi `GetJackpotCurrentUseCase` của từng game — cùng class mà route riêng của game dùng. Nó trả
 * raw DTO và throw `AppException`, nên dùng trực tiếp được từ đây không qua vòng serialize/parse
 * JSON nào.
 *
 * Chạy song song 3 game qua `tryLoad` (không reject → dùng `Promise.all`):
 *   - Game chưa có active cycle → `NOT_FOUND` → trả `null`, KHÔNG log (đúng nghiệp vụ).
 *   - Lỗi bất thường (DB down, bug) → log error kèm `source`, vẫn trả `null` để 2 game
 *     còn lại hiển thị được.
 */
export class GetDashboardJackpotsUseCase extends UseCase<void, GetDashboardJackpotsOutput> {
  private readonly mega645Uc = new Mega645JpUseCase();
  private readonly power655Uc = new Power655JpUseCase();
  private readonly lotto535Uc = new Lotto535JpUseCase();

  protected async execute(): Promise<GetDashboardJackpotsOutput> {
    const [mega645, power655, lotto535] = await Promise.all([
      tryLoad(() => this.mega645Uc.run().then(mapMega645), { scope: SCOPE, source: "mega645" }),
      tryLoad(() => this.power655Uc.run().then(mapPower655), { scope: SCOPE, source: "power655" }),
      tryLoad(() => this.lotto535Uc.run().then(mapLotto535), { scope: SCOPE, source: "lotto535" }),
    ]);

    // Output contract dùng `null` cho game thiếu dữ liệu; `tryLoad` trả `undefined`.
    return {
      mega645: mega645 ?? null,
      power655: power655 ?? null,
      lotto535: lotto535 ?? null,
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
