/**
 * Use Case: Prepare Lotto 5/35 Resettle (Step 1 Resettle SFN).
 *
 * Clear reversal → snapshot → reset entries.
 *
 * KHÔNG wipe lines: `LineRepository.upsertLines` dùng hybrid `$set` (business
 * fields) + `$setOnInsert` (createdAt) → SettleEntries re-build lines theo kết
 * quả MỚI sẽ overwrite matchResult cũ. Wipe-then-insert (cách cũ) tạo cửa sổ
 * lines biến mất giữa delete và insert + reset createdAt → bỏ.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateId } from "@megawin/shared/utils";
import type { EntryReversal } from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryResettleRepository } from "../../infras/repos/entry-resettle-repo";

const BATCH_SIZE = 500;

export interface PrepareResettleInput {
  drawId: string;
  resettleId: string;
  lockOwnerToken: string;
  lockKey: string;
}

export interface PrepareResettleOutput {
  drawId: string;
  resettleId: string;
  lockOwnerToken: string;
  lockKey: string;
}

export class PrepareResettleUseCase extends InternalUseCase<
  PrepareResettleInput,
  PrepareResettleOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryResettleRepo = new EntryResettleRepository();

  protected async execute(input: PrepareResettleInput): Promise<PrepareResettleOutput> {
    const { drawId, resettleId, lockOwnerToken, lockKey } = input;

    if (!resettleId) {
      throw AppException.badRequest("PrepareResettle yêu cầu resettleId từ caller.");
    }

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Settling) {
      throw AppException.badRequest(
        `Kỳ quay ${drawId} status = "${draw.status}", expected "settling".`,
      );
    }

    await this.entryResettleRepo.clearReversalSnapshot(drawId);

    let reversalCount = 0;
    let cursorId: string | undefined;

    while (true) {
      const candidates = await this.entryResettleRepo.listCandidatesForReversal({
        drawId,
        afterId: cursorId,
        limit: BATCH_SIZE,
      });

      if (candidates.length === 0) {
        break;
      }

      const items = candidates.map((c) => ({
        entryId: c.id,
        reversal: {
          reversalTx: generateId(),
          reversalAmount: c.payoutAmount,
          resettleId,
        } satisfies EntryReversal,
      }));

      reversalCount += await this.entryResettleRepo.bulkSetReversal(items);
      cursorId = candidates[candidates.length - 1]!.id;

      if (candidates.length < BATCH_SIZE) {
        break;
      }
    }

    const resetCount = await this.entryResettleRepo.resetEntriesForResettle(drawId);

    console.info("[PrepareResettle Lotto535] done", {
      drawId,
      resettleId,
      reversalCount,
      resetCount,
    });

    return {
      drawId,
      resettleId,
      lockOwnerToken,
      lockKey,
    };
  }
}
