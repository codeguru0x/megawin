/**
 * Use Case: Place Bet (Power 6/55)
 *
 * Tạo vé cược cho player. Validate boards, draws, tính giá, tạo ticket + entries.
 *
 * Power 6/55 differences from Lotto 5/35:
 *   - Chỉ có mainNumbers (không có specialNumbers/bonus)
 *   - PlayTypes: Standard (6 số), Bao7-Bao18, QuickPick (6 số)
 *   - Numbers range: 1-55
 *   - Ticket prefix: "P655"
 *   - 1 kỳ/ngày, quay thứ 3/5/7
 *
 * Flow:
 *   1. Load global config
 *   2. Validate drawIds (đang mở bán, chưa hết hạn)
 *   3. Validate boards (playType, selection, number ranges)
 *   4. Calculate pricing (unitPrice × lines × draws)
 *   5. Load tenant commission
 *   6. Build ticket document
 *   7. Create entries cho tất cả draws (all-or-nothing)
 */

import { AppException } from "@megawin/shared/errors";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus, EntryStatus, TicketStatus } from "@megawin/game-core/entities";
import type {
  Board,
  TicketDoc,
  TicketEntryDoc,
  EntrySummary,
  BoardSelection,
} from "@megawin/game-power655/entities";
import { PlayType } from "@megawin/game-power655/entities";
import {
  POWER655_MAIN_MIN,
  POWER655_MAIN_MAX,
  POWER655_MAIN_COUNT,
  VALID_BOARD_NOS,
  VALID_MAIN_NUMBER_SET,
} from "@megawin/game-power655/entities";
import { getLineCount, validateMainNumbers } from "@megawin/game-power655/rules/play-types";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { buildTicketNo, GameProduct } from "@megawin/game-core/entities";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";
import { nowVN } from "@megawin/shared/utils/date";

/**
 * Tạo vé cược Power 6/55.
 * Validate boards/draws, tính giá, tạo ticket + entries (all-or-nothing).
 */
export class PlaceBetUseCase extends ApiGatewayUseCase<PlaceBetInput, PlaceBetOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly ticketRepo = new TicketRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly ticketCounter = new TicketCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();

  /** @inheritdoc */
  protected async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const {
      tenantId,
      accountId,
      username,
      channel,
      ipAddress,
      drawIds,
      boards: boardInputs,
    } = input;

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

      const valResult = validateMainNumbers(bi.selection.mainNumbers, playType);
      if (!valResult.valid) {
        throw AppException.badRequest(`Board ${bi.boardNo}: ${valResult.error}`);
      }

      validateNumberRanges(bi.boardNo, bi.selection.mainNumbers);

      const lineCount = getLineCount(playType);
      totalLinesPerDraw += lineCount;

      builtBoards.push({
        boardNo: bi.boardNo as any,
        playType,
        selection: {
          mainNumbers: [...bi.selection.mainNumbers].sort(),
        },
        derived: { expandedLines: lineCount },
        isVoid: false,
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

    // ── 6. Load tenant commission rate ──
    const tenantConfig = await this.getTenantConfig.run({ tenantId });
    if (!tenantConfig || tenantConfig.isEnabled !== true) {
      throw AppException.unauthorized("Không được phép chơi game. Vui lòng liên hệ admin.");
    }
    const commissionRate = tenantConfig.commissionRate;

    // ── 7. Build ticket document ──
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Power655, date, seq);

    const ticketDoc: Omit<TicketDoc, "_id"> = {
      ticketNo,
      tenantId,
      accountId,
      username,
      channel,
      ipAddress,
      boards: builtBoards,
      pricing: {
        unitPrice,
        linesPerDraw: totalLinesPerDraw,
        amountPerDraw,
        totalAmount,
      },
      lineCount: totalLinesPerDraw,
      drawPlan: {
        drawIds,
        drawCount,
      },
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

    // ── 8. Insert ticket ──
    const ticketId = await this.ticketRepo.insertOne(ticketDoc as any);

    // ── 9. Create entries cho TẤT CẢ draws (all-or-nothing) ──
    const entrySummary: EntrySummary = {
      ticketNo,
      boards: builtBoards.map((b) => ({
        boardNo: String(b.boardNo),
        playType: b.playType,
        mainNumbers: b.selection.mainNumbers,
        expandedLines: b.derived.expandedLines,
      })),
    };

    const entryDocs: Array<Omit<TicketEntryDoc, "_id" | "version">> = [];

    for (let i = 0; i < drawIds.length; i++) {
      const draw = drawMap.get(drawIds[i]!)!;
      // commissionAmount tính sẵn lúc place-bet: snapshot cứng, không thay đổi dù rate update sau.
      const commissionAmount = Math.round(amountPerDraw * commissionRate);
      entryDocs.push({
        ticketId,
        tenantId,
        accountId,
        username,
        ipAddress,
        drawId: draw.drawId,
        drawDate: draw.drawDate,
        financialDate: draw.financialDate,
        drawTime: draw.drawTime,
        tenant: { commissionRate, commissionAmount },
        status: EntryStatus.Scheduled as any,
        lineCount: totalLinesPerDraw,
        amount: amountPerDraw,
        unitPrice,
        entrySummary,
        createdAt: now,
        updatedAt: now,
      });
    }

    try {
      await this.entryRepo.insertEntries(entryDocs as any[]);
    } catch {
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

/**
 * Sinh ngẫu nhiên 6 số trong range [1, 55] cho QuickPick.
 */
function generateQuickPick(): BoardSelection {
  const mainSet = new Set<string>();
  while (mainSet.size < POWER655_MAIN_COUNT) {
    const num =
      Math.floor(Math.random() * (POWER655_MAIN_MAX - POWER655_MAIN_MIN + 1)) + POWER655_MAIN_MIN;
    mainSet.add(String(num).padStart(2, "0"));
  }

  return {
    mainNumbers: [...mainSet].sort(),
  };
}

/**
 * Validate range cho từng số trong board.
 */
function validateNumberRanges(boardNo: string, mainNumbers: string[]): void {
  for (const n of mainNumbers) {
    if (!VALID_MAIN_NUMBER_SET.has(n)) {
      throw AppException.badRequest(
        `Board ${boardNo}: số "${n}" không hợp lệ (phải từ "01" đến "55").`,
      );
    }
  }
  if (new Set(mainNumbers).size !== mainNumbers.length) {
    throw AppException.badRequest(`Board ${boardNo}: các số không được trùng nhau.`);
  }
}
