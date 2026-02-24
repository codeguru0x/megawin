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
  LOTTO535_MAIN_MIN,
  LOTTO535_MAIN_MAX,
  LOTTO535_MAIN_COUNT,
  LOTTO535_SPECIAL_MIN,
  LOTTO535_SPECIAL_MAX,
} from "@megawin/game-lotto535/entities";
import {
  calculateLineCount,
  validateSelection,
} from "@megawin/game-lotto535/rules/play-types";
import { computeSelectionHash } from "@megawin/game-lotto535/helpers";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import {
  GameConfigRepository,
  TenantConfigRepository,
} from "../../infras/repos/game-config-repo";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";

const EXPANSION_THRESHOLD = 100;
const VALID_BOARD_NOS = ["A", "B", "C", "D", "E"];

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
      drawId,
      drawCount,
      boards: boardInputs,
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

    // ── 3. Validate boards ──
    if (
      boardInputs.length === 0 ||
      boardInputs.length > play.maxBoardsPerTicket
    ) {
      throw AppException.badRequest(
        `Số board phải từ 1 đến ${play.maxBoardsPerTicket}.`,
      );
    }

    const seenBoardNos = new Set<string>();
    const builtBoards: Board[] = [];
    let totalLinesPerDraw = 0;

    for (const bi of boardInputs) {
      // Validate boardNo hợp lệ & không trùng
      if (!VALID_BOARD_NOS.includes(bi.boardNo)) {
        throw AppException.badRequest(
          `Board "${bi.boardNo}" không hợp lệ. Chỉ chấp nhận: ${VALID_BOARD_NOS.join(", ")}.`,
        );
      }
      if (seenBoardNos.has(bi.boardNo)) {
        throw AppException.badRequest(
          `Board "${bi.boardNo}" bị trùng lặp.`,
        );
      }
      seenBoardNos.add(bi.boardNo);

      const playType = bi.playType as PlayType;

      // QuickPick: hệ thống sinh random
      if (playType === PlayType.QuickPick) {
        bi.selection = generateQuickPick();
      }

      // Validate selection theo business rules của game
      const valResult = validateSelection(playType, bi.selection);
      if (!valResult.valid) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: ${valResult.errors.join("; ")}`,
        );
      }

      // Validate số phải sorted & trong range (deep check)
      validateNumberRanges(bi.boardNo, bi.selection.mainNumbers, bi.selection.specialNumbers);

      const lineCount = calculateLineCount(playType, bi.selection);
      totalLinesPerDraw += lineCount;

      builtBoards.push({
        boardNo: bi.boardNo,
        playType,
        selection: {
          mainNumbers: [...bi.selection.mainNumbers].sort((a, b) => a - b),
          specialNumbers: [...bi.selection.specialNumbers].sort((a, b) => a - b),
        },
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

    // ── 4. Validate draw hiện tại phải đang mở bán ──
    const currentDraw = await this.drawRepo.getDrawById(drawId);
    if (!currentDraw) {
      throw AppException.badRequest(`Kỳ quay ${drawId} không tồn tại.`);
    }
    if (currentDraw.status !== DrawStatus.SalesOpen) {
      throw AppException.badRequest(
        `Kỳ quay ${drawId} không đang mở bán (status: ${currentDraw.status}).`,
      );
    }

    const now = new Date();
    if (now >= currentDraw.sales.closeAt) {
      throw AppException.badRequest(
        `Kỳ quay ${drawId} đã hết thời gian nhận cược.`,
      );
    }

    // ── 5. Calculate pricing ──
    const unitPrice = play.unitPrice;
    const amountPerDraw = unitPrice * totalLinesPerDraw;
    const totalAmount = amountPerDraw * drawCount;

    // ── 6. Load tenant commission rate (snapshot vào entry) ──
    const tenantConfig = await this.tenantConfigRepo.getTenantConfig(tenantId);
    const commissionRate =
      tenantConfig?.commissionRate ?? globalConfig.rates.defaultCommissionRate;

    // ── 7. Build ticket document (lazy enrollment model) ──
    const selectionHash = computeSelectionHash(builtBoards);
    const expansionMode =
      totalLinesPerDraw > EXPANSION_THRESHOLD
        ? ExpansionMode.OnSettle
        : ExpansionMode.None;

    const ticketNo = `L535-${Date.now()}`;
    const isFullyEnrolled = drawCount === 1;

    const ticketDoc: Omit<TicketDoc, "_id"> = {
      tenantId,
      playerId,
      appId,
      accountId,
      product: GameProduct.Lotto535 as typeof GameProduct.Lotto535,
      ticketNo,
      channel,
      drawPlan: {
        startDrawId: drawId,
        drawCount,
        enrolledDrawIds: [drawId],
        enrolledDraws: 1,
        remainingDraws: drawCount - 1,
        fullyEnrolled: isFullyEnrolled,
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
        pendingDraws: 1,
        nextDrawId: drawId,
      },
      status: TicketStatus.Paid as any,
      createdAt: now,
      updatedAt: now,
    };

    // ── 8. Insert ticket ──
    const ticketId = await this.ticketRepo.insertOne(ticketDoc as any);

    // ── 9. Create entry CHỈ cho kỳ hiện tại ──
    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      mainNumbers: b.selection.mainNumbers,
      specialNumbers: b.selection.specialNumbers,
      expandedLines: b.derived.expandedLines,
    }));

    const entryDoc: Omit<TicketEntryDoc, "_id" | "version"> = {
      tenantId,
      playerId,
      ticketId,
      drawId,
      drawTime: currentDraw.drawTime,
      drawDate: currentDraw.drawDate,
      financialDate: currentDraw.drawDate,
      tenantSnapshot: { commissionRate },
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
    };

    await this.entryRepo.insertEntry(entryDoc as any);

    return {
      ticketId,
      ticketNo,
      status: TicketStatus.Paid,
      drawPlan: {
        startDrawId: drawId,
        drawCount,
        enrolledDrawIds: [drawId],
        enrolledDraws: 1,
        remainingDraws: drawCount - 1,
        fullyEnrolled: isFullyEnrolled,
      },
      pricing: {
        unitPrice,
        linesPerDraw: totalLinesPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      entryCount: 1,
    };
  }
}

// ── Helpers ──

function generateQuickPick(): { mainNumbers: number[]; specialNumbers: number[] } {
  const mainSet = new Set<number>();
  while (mainSet.size < LOTTO535_MAIN_COUNT) {
    mainSet.add(
      Math.floor(Math.random() * (LOTTO535_MAIN_MAX - LOTTO535_MAIN_MIN + 1)) +
        LOTTO535_MAIN_MIN,
    );
  }
  const special =
    Math.floor(Math.random() * (LOTTO535_SPECIAL_MAX - LOTTO535_SPECIAL_MIN + 1)) +
    LOTTO535_SPECIAL_MIN;

  return {
    mainNumbers: [...mainSet].sort((a, b) => a - b),
    specialNumbers: [special],
  };
}

function validateNumberRanges(
  boardNo: string,
  mainNumbers: number[],
  specialNumbers: number[],
): void {
  for (const n of mainNumbers) {
    if (!Number.isInteger(n) || n < LOTTO535_MAIN_MIN || n > LOTTO535_MAIN_MAX) {
      throw AppException.badRequest(
        `Board ${boardNo}: số chính ${n} ngoài phạm vi ${LOTTO535_MAIN_MIN}-${LOTTO535_MAIN_MAX}.`,
      );
    }
  }
  if (new Set(mainNumbers).size !== mainNumbers.length) {
    throw AppException.badRequest(
      `Board ${boardNo}: số chính không được trùng nhau.`,
    );
  }

  for (const n of specialNumbers) {
    if (!Number.isInteger(n) || n < LOTTO535_SPECIAL_MIN || n > LOTTO535_SPECIAL_MAX) {
      throw AppException.badRequest(
        `Board ${boardNo}: số đặc biệt ${n} ngoài phạm vi ${LOTTO535_SPECIAL_MIN}-${LOTTO535_SPECIAL_MAX}.`,
      );
    }
  }
  if (new Set(specialNumbers).size !== specialNumbers.length) {
    throw AppException.badRequest(
      `Board ${boardNo}: số đặc biệt không được trùng nhau.`,
    );
  }
}
