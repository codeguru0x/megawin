import { AppException } from "@megawin/shared/errors";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import {
  DrawStatus,
  EntryStatus,
  GameProduct,
  TicketStatus,
} from "@megawin/game-core/entities";
import type {
  Board,
  TicketDoc,
  TicketEntryDoc,
  EntryBoardSnapshot,
} from "@megawin/game-lotto535/entities";
import { PlayType, ExpansionMode } from "@megawin/game-lotto535/entities";
import {
  calculateLineCount,
  validateSelection,
} from "@megawin/game-lotto535/rules/play-types";
import {
  computeSelectionHash,
} from "@megawin/game-lotto535/helpers";
import { generateDrawIdSequence } from "@megawin/game-lotto535/helpers";
import { Long } from "mongodb";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";

const EXPANSION_THRESHOLD = 100;

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

    // ── 3. Validate boards ──
    if (boardInputs.length === 0 || boardInputs.length > play.maxBoardsPerTicket) {
      throw AppException.badRequest(
        `Số board phải từ 1 đến ${play.maxBoardsPerTicket}.`,
      );
    }

    const builtBoards: Board[] = [];
    let totalLinesPerDraw = 0;

    for (const bi of boardInputs) {
      const playType = bi.playType as PlayType;
      const valResult = validateSelection(playType, bi.selection);
      if (!valResult.valid) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: ${valResult.errors.join("; ")}`,
        );
      }

      const lineCount = calculateLineCount(playType, bi.selection);
      totalLinesPerDraw += lineCount;

      builtBoards.push({
        boardNo: bi.boardNo,
        playType,
        selection: bi.selection,
        derived: {
          expandedLines: lineCount,
          mainCoverSize:
            playType === PlayType.MainCover || playType === PlayType.MainCover4
              ? bi.selection.mainNumbers.length
              : undefined,
          specialCoverSize:
            playType === PlayType.SpecialCover
              ? bi.selection.specialNumbers.length
              : undefined,
        },
      });
    }

    // ── 4. Generate draw IDs & validate first draw is open ──
    const drawIds = generateDrawIdSequence(
      startDrawId,
      drawCount,
      play.drawsPerDay,
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
    const amountPerDraw = unitPrice * totalLinesPerDraw;
    const totalAmount = amountPerDraw * drawCount;

    // ── 6. Build ticket document ──
    const now = new Date();
    const selectionHash = computeSelectionHash(builtBoards);
    const expansionMode =
      totalLinesPerDraw > EXPANSION_THRESHOLD
        ? ExpansionMode.OnSettle
        : ExpansionMode.None;

    const ticketNo = `L535-${Date.now()}`;

    const ticketDoc: Omit<TicketDoc, "_id"> = {
      tenantId,
      playerId,
      appId,
      accountId,
      product: GameProduct.Lotto535 as typeof GameProduct.Lotto535,
      ticketNo,
      channel: channel,
      drawPlan: {
        startDrawId,
        drawCount,
        drawIds,
      },
      pricing: {
        unitPrice,
        linesPerDraw: totalLinesPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boards: builtBoards,
      expansion: {
        mode: expansionMode,
        linesStored: false,
        lineCount: totalLinesPerDraw,
        selectionHash,
      },
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
      mainNumbers: b.selection.mainNumbers,
      specialNumbers: b.selection.specialNumbers,
      expandedLines: b.derived.expandedLines,
    }));

    const entryDocs: Array<Omit<TicketEntryDoc, "_id">> = drawIds.map(
      (drawId) => {
        const drawEntry = firstDraw;
        return {
          tenantId,
          playerId,
          ticketId,
          drawId,
          drawTime: drawEntry.drawTime,
          drawDate: drawEntry.drawDate,
          status: EntryStatus.Scheduled as any,
          lineCount: totalLinesPerDraw,
          amount: amountPerDraw,
          unitPrice,
          entrySummary: {
            ticketNo,
            selectionHash,
            ticketVersion: 1,
            boards: boardSnapshots,
          },
          createdAt: now,
          updatedAt: now,
          version: Long.fromNumber(0),
        };
      },
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
        linesPerDraw: totalLinesPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      entryCount: drawIds.length,
    };
  }
}
