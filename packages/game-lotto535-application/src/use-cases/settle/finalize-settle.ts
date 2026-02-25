/**
 * Use Case: Finalize Settle
 *
 * Bước cuối cùng trong settle flow:
 *   1. Chuyển draw: settling → settled (atomic, idempotent)
 *   2. Set jackpot.openingAmount cho kỳ tiếp theo
 *      (closingAmount đã được calculate-financials ghi rồi)
 *
 * CRASH-SAFE:
 *   - transitionStatus atomic: settling → settled
 *   - Nếu draw đã settled → skip (không throw)
 *   - setJackpotOpening idempotent: overwrite OK
 *
 * JACKPOT CHAIN:
 *   Mỗi draw lưu: jackpot.openingAmount (đầu kỳ) + jackpot.closingAmount (cuối kỳ)
 *   Kỳ tiếp theo: openingAmount = closingAmount kỳ trước
 *   Khi tạo draw mới (create-draws): lấy closingAmount từ kỳ settled gần nhất
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawNo } from "@megawin/game-lotto535/entities";
import { parseDrawId, generateDrawId } from "@megawin/game-lotto535/helpers";
import { DrawRepository } from "../../infras/repos/draw-repo";

export interface FinalizeSettleInput {
  drawId: string;
  closingJackpot: number;
  nextJackpotOpening: number;
}

export interface FinalizeSettleResult {
  drawId: string;
  status: string;
  closingJackpot: number;
  nextJackpotOpening: number;
  completedAt: string;
}

export class FinalizeSettleUseCase extends StepFunctionUseCase<
  FinalizeSettleInput,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();

  /** Chuyển draw settling → settled, propagate jackpot chain. */
  protected async execute(input: FinalizeSettleInput): Promise<FinalizeSettleResult> {
  const { drawId, closingJackpot, nextJackpotOpening } = input;
  const updated = await this.drawRepo.transitionStatus(
    drawId, DrawStatus.Settling, DrawStatus.Settled,
  );

  if (!updated) {
    const draw = await this.drawRepo.getDrawById(drawId);
    if (draw?.status === DrawStatus.Settled) {
      console.log(`Draw ${drawId} already settled, skipping transition.`);
    } else {
      throw new Error(`Cannot finalize draw ${drawId}. Current status: ${draw?.status}`);
    }
  }

  /**
   * Set jackpot opening cho kỳ tiếp theo.
   * Kỳ tiếp: drawNo+1 cùng ngày, hoặc drawNo=1 ngày hôm sau.
   * Nếu kỳ tiếp chưa tạo thì skip (create-draws sẽ lấy từ getLatestSettledDraw).
   */
  await propagateJackpotToNextDraw(this.drawRepo, drawId, nextJackpotOpening);

  return {
    drawId,
    status: DrawStatus.Settled,
    closingJackpot,
    nextJackpotOpening,
    completedAt: new Date().toISOString(),
  };
  }
}

async function propagateJackpotToNextDraw(
  drawRepo: DrawRepository,
  currentDrawId: string,
  nextJackpotOpening: number,
): Promise<void> {
  const parsed = parseDrawId(currentDrawId);
  if (!parsed) return;

  let nextDate = parsed.drawDate;
  let nextDrawNo = parsed.drawNo + 1;

  if (nextDrawNo > DrawNo.Evening) {
    nextDrawNo = DrawNo.Morning;
    const date = new Date(parsed.drawDate + "T00:00:00");
    date.setDate(date.getDate() + 1);
    nextDate = date.toISOString().split("T")[0]!;
  }

  const nextDrawId = generateDrawId(nextDate, nextDrawNo as DrawNo);
  const nextDraw = await drawRepo.getDrawById(nextDrawId);
  if (nextDraw) {
    await drawRepo.setJackpotOpening(nextDrawId, nextJackpotOpening);
  }
}
