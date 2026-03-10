/**
 * Use Case: Place Bet (Max 3D Pro)
 *
 * Đặt cược Max 3D Pro: validate boards → validate draws → tính giá → tạo ticket + entries.
 *
 * Max 3D Pro khác Max 3D:
 * - Mỗi board có playMode (multiNumber/multiDigit) và playType (straight/quickPick)
 * - Selection tạo ra các cặp (pairs) hai bộ ba số thay vì single triplets
 * - multiNumber: chọn 3-20 bộ ba số, hệ thống tạo C(n,2) cặp
 * - multiDigit: chọn 3 chữ số đầu + 3 chữ số sau, hệ thống expand
 * - Tối đa 4 boards (A-D), tối đa 6 kỳ
 * - QuickPick: máy chọn ngẫu nhiên bộ ba số (3 bộ cho multiNumber)
 */

import { AppException } from "@megawin/shared/errors";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus, EntryStatus, TicketStatus } from "@megawin/game-core/entities";
import type {
  Board,
  TicketDoc,
  TicketEntryDoc,
  EntryBoardSnapshot,
  Triplet,
} from "@megawin/game-max3dpro/entities";
import {
  PlayMode,
  PlayType,
  PLAY_MODE_VALUES,
  PLAY_TYPE_VALUES,
} from "@megawin/game-max3dpro/entities";
import {
  calculateLineCount,
  validateSelection,
  expandSelectionToPairs,
  VALID_BOARD_NOS,
} from "@megawin/game-max3dpro/rules/play-types";

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
      if (!(VALID_BOARD_NOS as readonly string[]).includes(bi.boardNo)) {
        throw AppException.badRequest(
          `Board "${bi.boardNo}" không hợp lệ. Chỉ chấp nhận: ${VALID_BOARD_NOS.join(", ")}.`,
        );
      }
      if (seenBoardNos.has(bi.boardNo)) {
        throw AppException.badRequest(`Board "${bi.boardNo}" bị trùng lặp.`);
      }
      seenBoardNos.add(bi.boardNo);

      if (!PLAY_MODE_VALUES.includes(bi.playMode)) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: playMode "${bi.playMode}" không hợp lệ.`,
        );
      }
      if (!PLAY_TYPE_VALUES.includes(bi.playType)) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: playType "${bi.playType}" không hợp lệ.`,
        );
      }

      if (bi.playType === PlayType.QuickPick) {
        bi.selection = generateQuickPick(bi.playMode);
      }

      const valResult = validateSelection(bi.playMode, bi.playType, bi.selection);
      if (!valResult.valid) {
        throw AppException.badRequest(`Board ${bi.boardNo}: ${valResult.errors.join("; ")}`);
      }

      const lineCount = calculateLineCount(bi.playMode, bi.playType, bi.selection);
      totalLinesPerDraw += lineCount;

      builtBoards.push({
        boardNo: bi.boardNo,
        playMode: bi.playMode,
        playType: bi.playType,
        selection: {
          triplets: [...bi.selection.triplets],
          frontDigits: bi.selection.frontDigits ? [...bi.selection.frontDigits] : undefined,
          backDigits: bi.selection.backDigits ? [...bi.selection.backDigits] : undefined,
        },
        derived: {
          lineCount,
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

    // ── 6. Load tenant commission rate ──
    const tenantConfig = await this.getTenantConfig.run({ tenantId });
    if (!tenantConfig || tenantConfig.isEnabled !== true) {
      throw AppException.unauthorized("Không được phép chơi game. Vui lòng liên hệ admin.");
    }
    const commissionRate = tenantConfig.commissionRate;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    // ── 7. Build ticket document ──
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Max3dpro, date, seq);

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
    const ticketId = await this.ticketRepo.createTicket(ticketDoc as any);

    // ── 9. Create entries cho TẤT CẢ draws (all-or-nothing) ──
    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playMode: b.playMode,
      playType: b.playType,
      triplets: b.selection.triplets,
      frontDigits: b.selection.frontDigits,
      backDigits: b.selection.backDigits,
      lineCount: b.derived.lineCount,
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
        tenantSnapshot: { commissionRate, commissionAmount },
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

function generateQuickPick(playMode: PlayMode): {
  triplets: Triplet[];
  frontDigits?: number[];
  backDigits?: number[];
} {
  if (playMode === PlayMode.MultiDigit) {
    const frontDigits = [
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
    ];
    const backDigits = [
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
    ];
    return { triplets: [], frontDigits, backDigits };
  }

  // multiNumber: generate 3 random triplets (minimum)
  const triplets: Triplet[] = [];
  const used = new Set<string>();
  while (triplets.length < 3) {
    const d1 = Math.floor(Math.random() * 10);
    const d2 = Math.floor(Math.random() * 10);
    const d3 = Math.floor(Math.random() * 10);
    const t = `${d1}${d2}${d3}`.padStart(3, "0");
    if (!used.has(t)) {
      used.add(t);
      triplets.push(t);
    }
  }

  return { triplets };
}
