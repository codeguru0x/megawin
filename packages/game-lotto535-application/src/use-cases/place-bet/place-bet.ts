import { AppException } from "@megawin/shared/errors";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus, EntryStatus, TicketStatus } from "@megawin/game-core/entities";
import type {
  Board,
  TicketDoc,
  TicketEntryDoc,
  EntryBoardSnapshot,
} from "@megawin/game-lotto535/entities";
import { PlayType } from "@megawin/game-lotto535/entities";
import {
  LOTTO535_MAIN_COUNT,
  ALL_MAIN_NUMBERS,
  VALID_MAIN_NUMBER_SET,
  VALID_SPECIAL_NUMBER_SET,
} from "@megawin/game-lotto535/entities";
import { VALID_BOARD_NOS } from "@megawin/game-lotto535/schemas";
import { calculateLineCount, validateSelection } from "@megawin/game-lotto535/rules/play-types";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { TenantConfigRepository } from "../../infras/repos/tenant-config-repo";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { buildTicketNo, GameProduct } from "@megawin/game-core/entities";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";
import { nowVN } from "@megawin/shared/utils/date";

export class PlaceBetUseCase extends ApiGatewayUseCase<PlaceBetInput, PlaceBetOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly tenantConfigRepo = new TenantConfigRepository();
  private readonly ticketRepo = new TicketRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly ticketCounter = new TicketCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const { tenantId, accountId, username, channel, drawIds, boards: boardInputs } = input;

    // ── 1. Load game config ──
    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    // ── 2. Validate drawIds ──
    if (drawIds.length === 0 || drawIds.length > play.maxDrawCount) {
      throw AppException.badRequest(`Số kỳ phải từ 1 đến ${play.maxDrawCount}.`);
    }
    if (new Set(drawIds).size !== drawIds.length) {
      throw AppException.badRequest("Danh sách kỳ quay chứa drawId trùng lặp.");
    }

    // ── 3. Validate boards ──
    if (boardInputs.length === 0 || boardInputs.length > play.maxBoardsPerTicket) {
      throw AppException.badRequest(`Số board phải từ 1 đến ${play.maxBoardsPerTicket}.`);
    }

    const seenBoardNos = new Set<string>();
    const builtBoards: Board[] = [];
    let totalLinesPerDraw = 0;

    const VALID_BOARD_NOS_ARRAY = VALID_BOARD_NOS as readonly string[];

    for (const bi of boardInputs) {
      if (!VALID_BOARD_NOS_ARRAY.includes(bi.boardNo)) {
        throw AppException.badRequest(
          `Board "${bi.boardNo}" không hợp lệ. Chỉ chấp nhận: ${VALID_BOARD_NOS.join(", ")}.`,
        );
      }
      if (seenBoardNos.has(bi.boardNo)) {
        throw AppException.badRequest(`Board "${bi.boardNo}" bị trùng lặp.`);
      }
      seenBoardNos.add(bi.boardNo);

      const playType = bi.playType as PlayType;

      if (playType === PlayType.QuickPick) {
        bi.selection = generateQuickPick();
      }

      const valResult = validateSelection(playType, bi.selection);
      if (!valResult.valid) {
        throw AppException.badRequest(`Board ${bi.boardNo}: ${valResult.errors.join("; ")}`);
      }

      validateNumberRanges(bi.boardNo, bi.selection.mainNumbers, bi.selection.specialNumbers);

      const lineCount = calculateLineCount(playType, bi.selection);
      totalLinesPerDraw += lineCount;

      builtBoards.push({
        boardNo: bi.boardNo,
        playType,
        selection: {
          mainNumbers: [...bi.selection.mainNumbers].sort(),
          specialNumbers: [...bi.selection.specialNumbers].sort(),
        },
        derived: {
          expandedLines: lineCount,
          mainCoverSize:
            playType === PlayType.MainCover || playType === PlayType.MainCover4
              ? bi.selection.mainNumbers.length
              : undefined,
          specialCoverSize:
            playType === PlayType.SpecialCover ? bi.selection.specialNumbers.length : undefined,
        },
      });
    }

    // ── 4. Validate tất cả draws – all-or-nothing ──
    const now = nowVN();
    const draws = await this.drawRepo.getDrawsByIds(drawIds);

    const drawMap = new Map(draws.map((d) => [d.drawId, d]));

    for (const drawId of drawIds) {
      const draw = drawMap.get(drawId);
      if (!draw) {
        throw AppException.badRequest(`Kỳ quay ${drawId} không tồn tại.`);
      }
      if (draw.status !== DrawStatus.SalesOpen) {
        throw AppException.badRequest(
          `Kỳ quay ${drawId} không đang mở bán (status: ${draw.status}).`,
        );
      }
      if (now >= draw.sales.closeAt) {
        throw AppException.badRequest(`Kỳ quay ${drawId} đã hết thời gian nhận cược.`);
      }
    }

    // ── 5. Calculate pricing ──
    const drawCount = drawIds.length;
    const unitPrice = play.unitPrice;
    const amountPerDraw = unitPrice * totalLinesPerDraw;
    const totalAmount = amountPerDraw * drawCount;

    // ── 6. Load tenant commission rate + tính commission amount ──
    const tenantConfig = await this.tenantConfigRepo.getTenantConfig(tenantId);
    const commissionRate = tenantConfig?.commissionRate ?? globalConfig.rates.defaultCommissionRate;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    // ── 7. Build ticket document ──
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Lotto535, date, seq);

    const ticketDoc: Omit<TicketDoc, "_id"> = {
      tenantId,
      accountId,
      username,
      ticketNo,
      channel,
      drawPlan: {
        drawIds,
        drawCount,
      },
      pricing: {
        unitPrice,
        linesPerDraw: totalLinesPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boards: builtBoards,
      lineCount: totalLinesPerDraw,
      progress: {
        totalDraws: drawCount,
        settledDraws: 0,
      },
      status: TicketStatus.Paid as any,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };

    // ── 8. Insert ticket ──
    const ticketId = await this.ticketRepo.insertOne(ticketDoc as any);

    // ── 9. Create entries cho TẤT CẢ draws (all-or-nothing) ──
    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      mainNumbers: b.selection.mainNumbers,
      specialNumbers: b.selection.specialNumbers,
      expandedLines: b.derived.expandedLines,
    }));

    const entryDocs: Array<Omit<TicketEntryDoc, "_id" | "version">> = [];

    for (let i = 0; i < drawIds.length; i++) {
      const draw = drawMap.get(drawIds[i]!)!;
      entryDocs.push({
        tenantId,
        accountId,
        username,
        ticketId,
        drawId: draw.drawId,
        drawTime: draw.drawTime,
        drawDate: draw.drawDate,
        financialDate: draw.financialDate,
        tenant: { commissionRate, commissionAmount },
        status: EntryStatus.Scheduled as any,
        lineCount: totalLinesPerDraw,
        amount: amountPerDraw,
        unitPrice,
        entrySummary: {
          ticketNo,
          boards: boardSnapshots,
        },
        createdAt: now,
        updatedAt: now,
      });
    }

    try {
      await this.entryRepo.insertEntries(entryDocs as any[]);
    } catch (err) {
      throw AppException.internal(
        "Không thể tạo entries cho các kỳ quay đã chọn. Vui lòng thử lại.",
      );
    }

    return {
      ticketId,
      ticketNo,
      status: TicketStatus.Paid,
      drawPlan: {
        drawIds,
        drawCount,
      },
      pricing: {
        unitPrice,
        linesPerDraw: totalLinesPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      entryCount: drawCount,
    };
  }
}

// ── Helpers ──

function generateQuickPick(): {
  mainNumbers: string[];
  specialNumbers: string[];
} {
  const mainSet = new Set<string>();
  while (mainSet.size < LOTTO535_MAIN_COUNT) {
    const idx = Math.floor(Math.random() * ALL_MAIN_NUMBERS.length);
    mainSet.add(ALL_MAIN_NUMBERS[idx]!);
  }

  const specialIdx = Math.floor(Math.random() * 12);
  const special = String(specialIdx + 1).padStart(2, "0");

  return {
    mainNumbers: [...mainSet].sort(),
    specialNumbers: [special],
  };
}

function validateNumberRanges(
  boardNo: string,
  mainNumbers: string[],
  specialNumbers: string[],
): void {
  for (const n of mainNumbers) {
    if (!VALID_MAIN_NUMBER_SET.has(n)) {
      throw AppException.badRequest(
        `Board ${boardNo}: số chính "${n}" không hợp lệ (phải từ "01" đến "35").`,
      );
    }
  }
  if (new Set(mainNumbers).size !== mainNumbers.length) {
    throw AppException.badRequest(`Board ${boardNo}: số chính không được trùng nhau.`);
  }

  for (const n of specialNumbers) {
    if (!VALID_SPECIAL_NUMBER_SET.has(n)) {
      throw AppException.badRequest(
        `Board ${boardNo}: số đặc biệt "${n}" không hợp lệ (phải từ "01" đến "12").`,
      );
    }
  }
  if (new Set(specialNumbers).size !== specialNumbers.length) {
    throw AppException.badRequest(`Board ${boardNo}: số đặc biệt không được trùng nhau.`);
  }
}
