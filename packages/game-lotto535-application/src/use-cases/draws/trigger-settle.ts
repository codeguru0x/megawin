import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { toExecutionName } from "@megawin/game-core/utils";
import { startExecution } from "@megawin/app-core/aws/sf";
import { isSplitCycleDraw } from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { TriggerSettleInput, TriggerSettleOutput } from "./dto/draw.dto";

/**
 * Kết sổ kỳ quay Lotto 5/35.
 *
 * Flow:
 *   1. Validate draw (tồn tại, có result)
 *   2. Xác định split cycle (Jackpot >= threshold + drawNo === 2)
 *   3. Transition status: published → settling (atomic, kèm splitInfo)
 *      - Nếu draw đã ở settling (retry) → skip transition
 *   4. Start Settle Step Function (deterministic name → idempotent)
 */
export class TriggerSettleUseCase extends NextApiUseCase<TriggerSettleInput, TriggerSettleOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: TriggerSettleInput): Promise<TriggerSettleOutput> {
    if (!input.LOTTO535_SETTLE_SFN_ARN) {
      throw AppException.badRequest("Worker kết sổ Lotto 5/35 không được cấu hình.");
    }

    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!draw.result) {
      throw AppException.badRequest("Chưa có kết quả quay – phải publish result trước khi kết sổ.");
    }

    let splitCycle = false;

    if (draw.status !== DrawStatus.Settling) {
      const [globalConfig, activeCycle] = await Promise.all([
        this.getGlobalConfig.run(),
        this.cycleRepo.getActiveCycle(),
      ]);

      const jackpotCurrentAmount = activeCycle?.currentAmount ?? globalConfig.jackpot.seedAmount;

      splitCycle = isSplitCycleDraw(
        jackpotCurrentAmount,
        globalConfig.jackpot.splitThreshold,
        false,
        draw.drawNo,
      );

      // isSplitCycle được ghi trước lên draw để UI hiển thị ngay khi trigger settle.
      // Chi tiết split (tierAllocations, splitAmount...) sẽ được lưu vào JackpotCycle
      // bởi FinalizeSettle sau khi tính toán xong — không lưu trên draw document.
      const isSplitCycle = splitCycle ? true : undefined;

      const updated = await this.drawRepo.triggerSettle(input.drawId, isSplitCycle);

      if (!updated) {
        throw new AppException(
          "DRAW_INVALID_TRANSITION",
          `Không thể kết sổ – draw hiện tại không ở trạng thái "published".`,
        );
      }
    }

    try {
      await startExecution({
        stateMachineArn: input.LOTTO535_SETTLE_SFN_ARN,
        name: toExecutionName(input.drawId),
        input: { drawId: input.drawId },
      });
    } catch (err) {
      console.error(err);
      throw new AppException("SFN_START_FAILED", `Không thể khởi chạy settle worker`);
    }

    return {
      drawId: input.drawId,
      status: DrawStatus.Settling,
      isSplitCycle: splitCycle,
    };
  }
}
