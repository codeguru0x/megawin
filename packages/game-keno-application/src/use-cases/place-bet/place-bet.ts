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
import { generateKenoDrawIdSequence } from "@megawin/game-keno/helpers";
import { Long } from "mongodb";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";

export class PlaceBetUseCase extends ApiGatewayUseCase<
  PlaceBetInput,
  PlaceBetOutput
> {
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
    const configRepo = new GameConfigRepository();
    const globalConfig = await configRepo.getGlobalConfig();
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
        numbers: [...bi.numbers].sort((a, b) => a - b),
      });
    }

    const builtSideBets: SideBet[] = [];
    for (const si of sideBetInputs) {
      const pt = si.playType === KenoPlayType.BigSmall
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

    // ── 4. Generate draw IDs & validate first draw ──
    const drawsPerDay = Math.floor(
      ((parseInt(play.lastDrawTime.split(":")[0]!, 10) * 60 + parseInt(play.lastDrawTime.split(":")[1]!, 10))
      - (parseInt(play.firstDrawTime.split(":")[0]!, 10) * 60 + parseInt(play.firstDrawTime.split(":")[1]!, 10)))
      / play.drawIntervalMinutes
    ) + 1;

    const drawIds = generateKenoDrawIdSequence(
      startDrawId,
      drawCount,
      drawsPerDay,
    );

    const drawRepo = new DrawRepository();
    const firstDraw = await drawRepo.getDrawById(drawIds[0]!);
    if (!firstDraw) {
      throw AppException.badRequest(`Kỳ quay ${drawIds[0]} không tồn tại.`);
    }
    if (firstDraw.status !== DrawStatus.SalesOpen) {
      throw AppException.badRequest(
        `Kỳ quay ${drawIds[0]} chưa mở bán hoặc đã đóng bán.`,
      );
    }

    // ── 5. Calculate pricing ──
    const unitPrice = play.unitPrice;
    const betsPerDraw = builtBoards.length + builtSideBets.length;
    const amountPerDraw = unitPrice * betsPerDraw;
    const totalAmount = amountPerDraw * drawCount;

    // ── 6. Build ticket document ──
    const now = new Date();
    const ticketNo = `KENO-${Date.now()}`;

    const ticketDoc: Omit<TicketDoc, "_id"> = {
      tenantId,
      playerId,
      appId,
      accountId,
      product: GameProduct.Keno as typeof GameProduct.Keno,
      ticketNo,
      channel: channel,
      drawPlan: {
        startDrawId,
        drawCount,
        drawIds,
      },
      pricing: {
        unitPrice,
        betsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boards: builtBoards,
      sideBets: builtSideBets,
      audit: {
        version: 1,
        immutableAt: now,
      },
      progress: {
        totalDraws: drawCount,
        settledDraws: 0,
        remainingDraws: drawCount,
        nextDrawId: drawIds[0],
      },
      status: TicketStatus.Paid as any,
      createdAt: now,
      updatedAt: now,
    };

    // ── 7. Insert ticket ──
    const ticketRepo = new TicketRepository();
    const ticketId = await ticketRepo.insertOne(ticketDoc as any);

    // ── 8. Create entries for each draw ──
    const entryRepo = new EntryRepository();
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

    const entryDocs: Array<Omit<TicketEntryDoc, "_id">> = drawIds.map(
      (drawId) => ({
        tenantId,
        playerId,
        ticketId,
        drawId,
        drawTime: firstDraw.drawTime,
        drawDate: firstDraw.drawDate,
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
        version: Long.fromNumber(0),
      }),
    );

    await entryRepo.insertMany(entryDocs as any[]);

    return {
      ticketId,
      ticketNo,
      status: TicketStatus.Paid,
      drawPlan: {
        startDrawId,
        drawCount,
        drawIds,
      },
      pricing: {
        unitPrice,
        betsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      sideBetCount: builtSideBets.length,
      entryCount: drawIds.length,
    };
  }
}
