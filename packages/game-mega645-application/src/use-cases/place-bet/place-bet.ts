import { AppException } from "@megawin/shared/errors";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus, EntryStatus, TicketStatus } from "@megawin/game-core/entities";
import type {
  Board,
  TicketDoc,
  TicketEntryDoc,
  EntryBoardSnapshot,
} from "@megawin/game-mega645/entities";
import { PlayType } from "@megawin/game-mega645/entities";
import {
  MEGA645_MAIN_COUNT,
  VALID_BOARD_NOS,
  ALL_MAIN_NUMBERS,
  VALID_MAIN_NUMBER_SET,
} from "@megawin/game-mega645/entities";
import {
  calculateLineCount,
  validateSelection,
  getRequiredMainCount,
} from "@megawin/game-mega645/rules/play-types";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { buildTicketNo, GameProduct } from "@megawin/game-core/entities";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";
import { nowVN } from "@megawin/shared/utils/date";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";

export class PlaceBetUseCase extends ApiGatewayUseCase<PlaceBetInput, PlaceBetOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly ticketRepo = new TicketRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly ticketCounter = new TicketCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();

  protected async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const { tenantId, accountId, username, channel, ipAddress, drawIds, boards: boardInputs } = input;

    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    if (drawIds.length === 0 || drawIds.length > play.maxDrawCount) {
      throw AppException.badRequest(`Số kỳ phải từ 1 đến ${play.maxDrawCount}.`);
    }
    if (new Set(drawIds).size !== drawIds.length) {
      throw AppException.badRequest("Danh sách kỳ quay chứa drawId trùng lặp.");
    }

    if (boardInputs.length === 0 || boardInputs.length > play.maxBoardsPerTicket) {
      throw AppException.badRequest(`Số board phải từ 1 đến ${play.maxBoardsPerTicket}.`);
    }

    const seenBoardNos = new Set<string>();
    const builtBoards: Board[] = [];
    let totalLinesPerDraw = 0;

    for (const bi of boardInputs) {
      if (!VALID_BOARD_NOS.includes(bi.boardNo as any)) {
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

      validateNumberRanges(bi.boardNo, bi.selection.mainNumbers);

      const lineCount = calculateLineCount(playType);
      totalLinesPerDraw += lineCount;

      builtBoards.push({
        boardNo: bi.boardNo,
        playType,
        selection: {
          mainNumbers: [...bi.selection.mainNumbers].sort(),
        },
        derived: {
          expandedLines: lineCount,
          baoSize:
            playType !== PlayType.Standard && playType !== PlayType.QuickPick
              ? getRequiredMainCount(playType)
              : undefined,
        },
      });
    }

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

    const drawCount = drawIds.length;
    const unitPrice = play.unitPrice;
    const amountPerDraw = unitPrice * totalLinesPerDraw;
    const totalAmount = amountPerDraw * drawCount;

    const tenantConfig = await this.getTenantConfig.run({ tenantId });
    if (!tenantConfig || tenantConfig.isEnabled !== true) {
      throw AppException.unauthorized("Không được phép chơi game. Vui lòng liên hệ admin.");
    }
    const commissionRate = tenantConfig.commissionRate;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Mega645, date, seq);

    const ticketDoc: Omit<TicketDoc, "_id"> = {
      tenantId,
      accountId,
      username,
      ticketNo,
      channel,
      ipAddress,
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
      financialDate: getFinancialDate(now),
      status: TicketStatus.Paid as any,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };

    const ticketId = await this.ticketRepo.insertOne(ticketDoc as any);

    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      mainNumbers: b.selection.mainNumbers,
      expandedLines: b.derived.expandedLines,
    }));

    const entryDocs: Array<Omit<TicketEntryDoc, "_id" | "version">> = [];

    for (let i = 0; i < drawIds.length; i++) {
      const draw = drawMap.get(drawIds[i]!)!;
      entryDocs.push({
        tenantId,
        accountId,
        username,
        ipAddress,
        ticketId,
        drawId: draw.drawId,
        drawTime: draw.drawTime,
        drawDate: draw.drawDate,
        financialDate: draw.financialDate,
        tenant: { commissionRate, commissionAmount },
        status: EntryStatus.Scheduled,
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

function generateQuickPick(): { mainNumbers: string[] } {
  const pool = [...ALL_MAIN_NUMBERS];
  const picked: string[] = [];
  for (let i = 0; i < MEGA645_MAIN_COUNT; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool[idx]!);
    pool.splice(idx, 1);
  }

  return {
    mainNumbers: picked.sort(),
  };
}

function validateNumberRanges(boardNo: string, mainNumbers: string[]): void {
  for (const n of mainNumbers) {
    if (!VALID_MAIN_NUMBER_SET.has(n)) {
      throw AppException.badRequest(
        `Board ${boardNo}: số chính "${n}" không hợp lệ (phải từ "01" đến "45").`,
      );
    }
  }
  if (new Set(mainNumbers).size !== mainNumbers.length) {
    throw AppException.badRequest(`Board ${boardNo}: số chính không được trùng nhau.`);
  }
}
