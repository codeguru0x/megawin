/**
 * Use Case: Place Bet (Bingo 18)
 *
 * Đặt cược Bingo 18 với tất cả entries tạo ngay (all-or-nothing):
 *   - Player gửi danh sách drawIds đang mở bán
 *   - Server validate tất cả draws → reject nếu 1 draw không hợp lệ
 *   - Tạo entries cho TẤT CẢ draws ngay lập tức
 *
 * Validation:
 *   - boards: mỗi board validate theo play type (singleNum, doubleMatch, tripleMatch)
 *   - sideBets: validate playType + bet/sum value
 *   - Tất cả drawIds phải đang salesOpen + chưa hết hạn
 */

import { AppException } from "@megawin/shared/errors";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus, EntryStatus, TicketStatus } from "@megawin/game-core/entities";
import type {
  BasicBoard,
  SideBet,
  TicketDoc,
  TicketEntryDoc,
  EntryBoardSnapshot,
  EntrySideBetSnapshot,
} from "@megawin/game-bingo18/entities";
import {
  Bingo18PlayType,
  BINGO18_BASIC_PLAY_TYPES,
  BINGO18_SIDE_BET_PLAY_TYPES,
} from "@megawin/game-bingo18/entities";
import {
  validateSingleNumSelection,
  validateDoubleMatchSelection,
  validateTripleMatchSelection,
  validateSumTotalSelection,
} from "@megawin/game-bingo18/rules/play-types";

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
    const {
      tenantId,
      accountId,
      username,
      channel,
      ipAddress,
      drawIds,
      boards: boardInputs,
      sideBets: sideBetInputs,
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

    // ── 3. Validate boards + sideBets ──
    if (boardInputs.length === 0 && sideBetInputs.length === 0) {
      throw AppException.badRequest("Phải có ít nhất 1 board cơ bản hoặc 1 side bet.");
    }

    if (boardInputs.length > play.maxBasicBoardsPerTicket) {
      throw AppException.badRequest(`Số board cơ bản tối đa là ${play.maxBasicBoardsPerTicket}.`);
    }

    const builtBoards: BasicBoard[] = [];
    for (const bi of boardInputs) {
      if (!BINGO18_BASIC_PLAY_TYPES.includes(bi.playType as any)) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: playType "${bi.playType}" không hợp lệ.`,
        );
      }

      if (bi.playType === Bingo18PlayType.SingleNum) {
        if (bi.number === undefined) {
          throw AppException.badRequest(`Board ${bi.boardNo}: cần chọn số cho "Một số".`);
        }
        const valResult = validateSingleNumSelection(bi.number);
        if (!valResult.valid) {
          throw AppException.badRequest(`Board ${bi.boardNo}: ${valResult.errors.join("; ")}`);
        }
        builtBoards.push({
          boardNo: bi.boardNo,
          playType: Bingo18PlayType.SingleNum,
          number: bi.number,
        });
      } else if (bi.playType === Bingo18PlayType.DoubleMatch) {
        if (bi.number === undefined) {
          throw AppException.badRequest(
            `Board ${bi.boardNo}: cần chọn số cho "Hai số trùng nhau".`,
          );
        }
        const valResult = validateDoubleMatchSelection(bi.number);
        if (!valResult.valid) {
          throw AppException.badRequest(`Board ${bi.boardNo}: ${valResult.errors.join("; ")}`);
        }
        builtBoards.push({
          boardNo: bi.boardNo,
          playType: Bingo18PlayType.DoubleMatch,
          number: bi.number,
        });
      } else if (bi.playType === Bingo18PlayType.TripleMatch) {
        if (!bi.tripleKind) {
          throw AppException.badRequest(
            `Board ${bi.boardNo}: cần chọn loại (specific/any) cho "Ba số trùng nhau".`,
          );
        }
        const valResult = validateTripleMatchSelection(bi.tripleKind, bi.number);
        if (!valResult.valid) {
          throw AppException.badRequest(`Board ${bi.boardNo}: ${valResult.errors.join("; ")}`);
        }
        builtBoards.push({
          boardNo: bi.boardNo,
          playType: Bingo18PlayType.TripleMatch,
          number: bi.number,
          tripleKind: bi.tripleKind,
        });
      }
    }

    const builtSideBets: SideBet[] = [];
    for (const si of sideBetInputs) {
      if (!BINGO18_SIDE_BET_PLAY_TYPES.includes(si.playType as any)) {
        throw AppException.badRequest(`Side bet playType "${si.playType}" không hợp lệ.`);
      }

      if (si.playType === Bingo18PlayType.SumTotal) {
        if (si.sum === undefined) {
          throw AppException.badRequest("Side bet Cộng tổng: cần chọn tổng (3-18).");
        }
        const valResult = validateSumTotalSelection(si.sum);
        if (!valResult.valid) {
          throw AppException.badRequest(valResult.errors.join("; "));
        }
        builtSideBets.push({
          playType: Bingo18PlayType.SumTotal as any,
          sum: si.sum,
        });
      } else if (si.playType === Bingo18PlayType.BigSmallDraw) {
        if (!si.bet) {
          throw AppException.badRequest("Side bet Lớn/Hòa/Nhỏ: cần chọn bet (big/draw/small).");
        }
        builtSideBets.push({
          playType: Bingo18PlayType.BigSmallDraw as any,
          bet: si.bet,
        });
      }
    }

    // ── 4. Validate tất cả draws – all-or-nothing ──
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
      if (draw.sales?.closeAt && new Date() >= draw.sales.closeAt) {
        throw AppException.badRequest(`Kỳ quay ${drawId} đã hết thời gian nhận cược.`);
      }
    }

    // ── 5. Load commission rate ──
    const tenantConfig = await this.getTenantConfig.run({ tenantId });
    if (!tenantConfig || tenantConfig.isEnabled !== true) {
      throw AppException.unauthorized("Không được phép chơi game. Vui lòng liên hệ admin.");
    }
    const commissionRate = tenantConfig.commissionRate;

    // ── 6. Calculate pricing ──
    const unitPrice = play.unitPrice;
    const betsPerDraw = builtBoards.length + builtSideBets.length;
    const amountPerDraw = unitPrice * betsPerDraw;
    const totalAmount = amountPerDraw * drawIds.length;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    // ── 7. Build ticket document ──
    const now = nowVN();
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Bingo18, date, seq);
    const drawCount = drawIds.length;

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
        betsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      tenant: { commissionRate },
      boards: builtBoards,
      sideBets: builtSideBets,
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
    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      number: b.number,
      tripleKind: b.tripleKind,
    }));

    const sideBetSnapshots: EntrySideBetSnapshot[] = builtSideBets.map((s) => ({
      playType: s.playType as any,
      sum: s.sum,
      bet: s.bet,
    }));

    const entryDocs: Array<Omit<TicketEntryDoc, "_id" | "version">> = [];

    for (const drawId of drawIds) {
      const draw = drawMap.get(drawId)!;
      entryDocs.push({
        tenantId,
        accountId,
        username,
        ipAddress,
        ticketId,
        drawId: draw.drawId,
        drawDate: draw.drawDate,
        financialDate: draw.financialDate,
        tenant: { commissionRate, commissionAmount },
        status: EntryStatus.Scheduled as any,
        betCount: betsPerDraw,
        amount: amountPerDraw,
        unitPrice,
        entrySummary: {
          ticketNo,
          boards: boardSnapshots,
          sideBets: sideBetSnapshots,
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
        betsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      sideBetCount: builtSideBets.length,
      entryCount: drawCount,
    };
  }
}
