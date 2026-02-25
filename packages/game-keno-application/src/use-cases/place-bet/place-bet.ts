/**
 * Use Case: Place Bet (Keno)
 *
 * Đặt cược Keno với lazy enrollment cho multi-draw:
 *   - Chỉ tạo entry cho kỳ đầu tiên (startDrawId)
 *   - Worker auto-enroll sẽ tạo entries cho các kỳ tiếp theo
 *
 * Validation:
 *   - Số dạng string "01"-"80" (zero-padded 2 ký tự)
 *   - boards: mỗi board validate theo play type (pick1-pick10)
 *   - sideBets: validate playType + bet value
 *   - drawCount: 1 → maxDrawCount
 *   - startDrawId phải đang mở bán
 *
 * Commission: snapshot commissionRate vào ticket + entry.
 */

import { AppException } from "@megawin/shared/errors";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import {
  DrawStatus,
  EntryStatus,
  GameProduct,
  TicketStatus,
} from "@megawin/game-core/entities";
import type {
  BasicBoard,
  SideBet,
  TicketDoc,
  TicketEntryDoc,
  EntryBoardSnapshot,
  EntrySideBetSnapshot,
} from "@megawin/game-keno/entities";
import { KenoPlayType, KENO_SIDE_BET_PLAY_TYPES } from "@megawin/game-keno/entities";
import {
  validateBasicSelection,
  getPlayTypeFromPickCount,
} from "@megawin/game-keno/rules/play-types";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import {
  GameConfigRepository,
  TenantConfigRepository,
} from "../../infras/repos/game-config-repo";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";

export class PlaceBetUseCase extends ApiGatewayUseCase<
  PlaceBetInput,
  PlaceBetOutput
> {
  private readonly configRepo = new GameConfigRepository();
  private readonly drawRepo = new DrawRepository();
  private readonly tenantConfigRepo = new TenantConfigRepository();
  private readonly ticketRepo = new TicketRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const {
      tenantId,
      playerId,
      appId,
      accountId,
      channel,
      startDrawId,
      drawCount,
      boards: boardInputs,
      sideBets: sideBetInputs,
    } = input;

    // ── 1. Load game config ──
    const globalConfig = await this.configRepo.getGlobalConfig();
    if (!globalConfig) {
      throw AppException.internal("GameConfig chưa được khởi tạo.");
    }

    const { play } = globalConfig;

    // ── 2. Validate draw count ──
    if (drawCount < 1 || drawCount > play.maxDrawCount) {
      throw AppException.badRequest(
        `drawCount phải từ 1 đến ${play.maxDrawCount}.`,
      );
    }

    // ── 3. Validate boards + sideBets ──
    if (boardInputs.length === 0 && sideBetInputs.length === 0) {
      throw AppException.badRequest(
        "Phải có ít nhất 1 board cơ bản hoặc 1 side bet.",
      );
    }

    if (boardInputs.length > play.maxBasicBoardsPerTicket) {
      throw AppException.badRequest(
        `Số board cơ bản tối đa là ${play.maxBasicBoardsPerTicket}.`,
      );
    }

    const builtBoards: BasicBoard[] = [];
    for (const bi of boardInputs) {
      const playType = getPlayTypeFromPickCount(bi.numbers.length);
      if (!playType) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: số lượng số ${bi.numbers.length} không hợp lệ (1-10).`,
        );
      }
      const valResult = validateBasicSelection(playType, bi.numbers);
      if (!valResult.valid) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: ${valResult.errors.join("; ")}`,
        );
      }

      builtBoards.push({
        boardNo: bi.boardNo,
        playType,
        numbers: [...bi.numbers].sort(),
      });
    }

    const builtSideBets: SideBet[] = [];
    for (const si of sideBetInputs) {
      const pt =
        si.playType === KenoPlayType.BigSmall
          ? KenoPlayType.BigSmall
          : KenoPlayType.EvenOdd;

      if (!KENO_SIDE_BET_PLAY_TYPES.includes(pt)) {
        throw AppException.badRequest(
          `Side bet playType "${si.playType}" không hợp lệ.`,
        );
      }

      builtSideBets.push({
        playType: pt as any,
        bet: si.bet,
      });
    }

    // ── 4. Validate first draw ──
    const firstDraw = await this.drawRepo.getDrawById(startDrawId);
    if (!firstDraw) {
      throw AppException.badRequest(`Kỳ quay ${startDrawId} không tồn tại.`);
    }
    if (firstDraw.status !== DrawStatus.SalesOpen) {
      throw AppException.badRequest(
        `Kỳ quay ${startDrawId} chưa mở bán hoặc đã đóng bán.`,
      );
    }

    // ── 5. Load commission rate ──
    const tenantConfig = await this.tenantConfigRepo.getTenantConfig(tenantId);
    const commissionRate =
      tenantConfig?.commissionRate ?? globalConfig.rates.defaultCommissionRate;

    // ── 6. Calculate pricing ──
    const unitPrice = play.unitPrice;
    const betsPerDraw = builtBoards.length + builtSideBets.length;
    const amountPerDraw = unitPrice * betsPerDraw;
    const totalAmount = amountPerDraw * drawCount;

    // ── 7. Build ticket document (lazy enrollment) ──
    const now = new Date();
    const ticketNo = `KENO-${Date.now()}`;
    const isMultiDraw = drawCount > 1;

    const ticketDoc: Omit<TicketDoc, "_id"> = {
      tenantId,
      playerId,
      appId,
      accountId,
      product: GameProduct.Keno as typeof GameProduct.Keno,
      ticketNo,
      channel,
      drawPlan: {
        startDrawId,
        drawCount,
        enrolledDrawIds: [startDrawId],
        enrolledDraws: 1,
        remainingDraws: drawCount - 1,
        fullyEnrolled: !isMultiDraw,
      },
      pricing: {
        unitPrice,
        betsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      tenantSnapshot: { commissionRate },
      boards: builtBoards,
      sideBets: builtSideBets,
      audit: {
        version: 1,
        immutableAt: now,
      },
      progress: {
        totalDraws: drawCount,
        settledDraws: 0,
        pendingDraws: drawCount,
        nextDrawId: startDrawId,
      },
      status: TicketStatus.Paid as any,
      createdAt: now,
      updatedAt: now,
    };

    // ── 8. Insert ticket ──
    const ticketId = await this.ticketRepo.insertOne(ticketDoc as any);

    // ── 9. Create entry for first draw only ──
    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      numbers: b.numbers,
    }));

    const sideBetSnapshots: EntrySideBetSnapshot[] = builtSideBets.map(
      (s) => ({
        playType: s.playType,
        bet: s.bet,
      }),
    );

    const entryDoc: Omit<TicketEntryDoc, "_id" | "version"> = {
      tenantId,
      playerId,
      ticketId,
      drawId: startDrawId,
      drawTime: firstDraw.drawTime,
      drawDate: firstDraw.drawDate,
      financialDate: firstDraw.financialDate,
      tenantSnapshot: { commissionRate },
      status: EntryStatus.Scheduled as any,
      betCount: betsPerDraw,
      amount: amountPerDraw,
      unitPrice,
      entrySummary: {
        ticketNo,
        ticketVersion: 1,
        boards: boardSnapshots,
        sideBets: sideBetSnapshots,
      },
      createdAt: now,
      updatedAt: now,
    };

    await this.entryRepo.insertEntry(entryDoc as any);

    return {
      ticketId,
      ticketNo,
      status: TicketStatus.Paid,
      drawPlan: {
        startDrawId,
        drawCount,
        enrolledDrawIds: [startDrawId],
      },
      pricing: {
        unitPrice,
        betsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      sideBetCount: builtSideBets.length,
      entryCount: 1,
    };
  }
}
