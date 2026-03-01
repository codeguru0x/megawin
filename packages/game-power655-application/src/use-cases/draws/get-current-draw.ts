/**
 * Use Case: Get Current Draw (Power 6/55)
 *
 * Lấy tất cả kỳ quay active (multi-draw support):
 *   - activeDraws[]: tất cả kỳ active sorted by drawDate
 *   - currentDraw: kỳ đầu tiên (backward compat)
 *   - lastSettledDraw: kỳ settle gần nhất
 *   - jackpot1CurrentAmount + jackpot2CurrentAmount: đọc từ active jackpot cycle
 */

import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { DrawEntity } from "@megawin/game-power655/entities";
import type {
  GetCurrentDrawInput,
  GetCurrentDrawOutput,
  CurrentDrawInfo,
} from "./dto/current-draw.dto";

const ACTIVE_STATUSES = [
  DrawStatus.Scheduled,
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
];

/**
 * Lấy kỳ quay hiện tại và danh sách kỳ active cho player/backoffice.
 * Bao gồm cả 2 giá trị Jackpot 1 + Jackpot 2 từ active cycle.
 */
export class GetCurrentDrawUseCase extends NextApiUseCase<
  GetCurrentDrawInput,
  GetCurrentDrawOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  /** @inheritdoc */
  protected async execute(
    input: GetCurrentDrawInput
  ): Promise<GetCurrentDrawOutput> {
    const allowStatuses = input.allowStatuses ?? ACTIVE_STATUSES;

    const [activeDraws, lastSettled, activeCycle, globalConfig] =
      await Promise.all([
        this.drawRepo.getActiveDraws(allowStatuses),
        this.drawRepo.getLatestSettledDraw(),
        this.cycleRepo.getActiveCycle(),
        this.getGlobalConfig.run(),
      ]);

    const jackpot1CurrentAmount =
      activeCycle?.jackpot1Current ?? globalConfig.jackpot.jackpot1.seedAmount;
    const jackpot2CurrentAmount =
      activeCycle?.jackpot2Current ?? globalConfig.jackpot.jackpot2.seedAmount;

    const totalJackpot = jackpot1CurrentAmount + jackpot2CurrentAmount;

    const mapped = activeDraws.map((d) =>
      mapDrawInfo(
        d,
        jackpot1CurrentAmount,
        jackpot2CurrentAmount,
        totalJackpot,
        globalConfig.jackpot.splitThreshold
      )
    );

    return {
      currentDraw: mapped[0] ?? null,
      activeDraws: mapped,
      jackpot1CurrentAmount,
      jackpot2CurrentAmount,
      lastSettledDraw: lastSettled
        ? {
            drawId: lastSettled.drawId,
            drawDate: lastSettled.drawDate,
            drawNo: lastSettled.drawNo,
            drawTime: lastSettled.drawTime.toISOString(),
            result: lastSettled.result
              ? {
                  winningMain: [...lastSettled.result.winningMain],
                  bonusNumber: lastSettled.result.bonusNumber,
                  publishedAt: lastSettled.result.publishedAt.toISOString(),
                }
              : undefined,
            jackpot: lastSettled.jackpot
              ? {
                  openingJackpot1: lastSettled.jackpot.openingJackpot1,
                  closingJackpot1: lastSettled.jackpot.closingJackpot1,
                  openingJackpot2: lastSettled.jackpot.openingJackpot2,
                  closingJackpot2: lastSettled.jackpot.closingJackpot2,
                  isSplitCycle: lastSettled.jackpot.isSplitCycle ?? false,
                }
              : undefined,
          }
        : null,
    };
  }
}

function mapDrawInfo(
  draw: DrawEntity,
  jackpot1CurrentAmount: number,
  jackpot2CurrentAmount: number,
  totalJackpot: number,
  splitThreshold: number
): CurrentDrawInfo {
  return {
    drawId: draw.drawId,
    drawDate: draw.drawDate,
    drawNo: draw.drawNo,
    drawTime: draw.drawTime.toISOString(),
    status: draw.status,
    sales: {
      openAt: draw.sales.openAt?.toISOString(),
      closeAt: draw.sales.closeAt.toISOString(),
    },
    jackpot1CurrentAmount,
    jackpot2CurrentAmount,
    splitCycleIntent: totalJackpot >= splitThreshold,
    stats: draw.stats
      ? {
          totalEntries: draw.stats.totalEntries,
          totalLines: draw.stats.totalLines,
        }
      : undefined,
  };
}
