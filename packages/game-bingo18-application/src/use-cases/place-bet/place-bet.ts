/**
 * Use Case: Place Bet (Bingo 18)
 *
 * Đặt cược Bingo 18 với tất cả entries tạo ngay (all-or-nothing):
 *   - Player gửi danh sách drawIds đang mở bán
 *   - Server validate tất cả draws → reject nếu 1 draw không hợp lệ
 *   - Tạo entries cho TẤT CẢ draws ngay lập tức
 *
 * Validation tại use case (các rule phụ thuộc runtime config hoặc DB state):
 *   - drawIds.length <= play.maxDrawCount (từ GlobalConfig)
 *   - boards.length <= play.maxBasicBoardsPerTicket (từ GlobalConfig)
 *   - Tất cả drawIds phải đang salesOpen + chưa hết hạn (DB)
 *   - tenantConfig.isEnabled (DB)
 *
 * Các validation về format/enum/required-fields được xử lý bởi Zod schema tại API handler.
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
  EntrySummary,
  Bingo18SideBetPlayType,
} from "@megawin/game-bingo18/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { PlaceBetStore } from "../../infras/repos/place-bet-store";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { buildTicketNo, GameProduct } from "@megawin/game-core/entities";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";
import { nowVN } from "@megawin/shared/utils/date";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
import { ObjectId } from "mongodb";

export class PlaceBetUseCase extends ApiGatewayUseCase<PlaceBetInput, PlaceBetOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly placeBetStore = new PlaceBetStore();
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
    // drawIds.length >= 1 và không duplicate đã validate bởi Zod schema.
    // Giới hạn maxDrawCount là runtime config → cần check lại ở đây.
    if (drawIds.length > play.maxDrawCount) {
      throw AppException.badRequest(`Số kỳ phải từ 1 đến ${play.maxDrawCount}.`);
    }

    // ── 3. Build boards + sideBets ──
    // playType, number, tripleKind, sum, bet — đã validate đủ bởi Zod schema.
    // boards.length >= 1 (hoặc sideBets >= 1) đã validate bởi Zod schema.
    // Giới hạn maxBasicBoardsPerTicket là runtime config → cần check lại ở đây.
    if (boardInputs.length > play.maxBasicBoardsPerTicket) {
      throw AppException.badRequest(`Số board cơ bản tối đa là ${play.maxBasicBoardsPerTicket}.`);
    }

    // Validate betCount range cho boards và side bets.
    for (const bi of boardInputs) {
      if (bi.betCount < play.minBetCount || bi.betCount > play.maxBetCount) {
        throw AppException.badRequest(
          `betCount phải từ ${play.minBetCount} đến ${play.maxBetCount}.`,
        );
      }
    }
    for (const si of sideBetInputs) {
      if (si.betCount < play.minBetCount || si.betCount > play.maxBetCount) {
        throw AppException.badRequest(
          `betCount phải từ ${play.minBetCount} đến ${play.maxBetCount}.`,
        );
      }
    }

    const builtBoards: BasicBoard[] =
      boardInputs.map((bi) => ({
        boardNo: bi.boardNo,
        playType: bi.playType,
        number: bi.number,
        tripleKind: bi.tripleKind,
        betCount: bi.betCount,
      })) ?? [];

    const builtSideBets: SideBet[] =
      sideBetInputs.map((si) => ({
        playType: si.playType,
        sum: si.sum,
        bet: si.bet,
        betCount: si.betCount,
      })) ?? [];

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
        throw AppException.badRequest(`Kỳ quay ${drawId} không đang mở bán.`);
      }

      if (now >= draw.sales.closeAt) {
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
    // selectionsPerDraw = đếm số bets logic (boards + sideBets), KHÔNG tính multiplier.
    const selectionsPerDraw = builtBoards.length + builtSideBets.length;
    // betUnitsPerDraw = tổng đơn vị cược thực tế = Σ(board.betCount) + Σ(sideBet.betCount).
    const betUnitsPerDraw =
      builtBoards.reduce((acc, b) => acc + b.betCount, 0) +
      builtSideBets.reduce((acc, s) => acc + s.betCount, 0);
    const amountPerDraw = unitPrice * betUnitsPerDraw;
    const totalAmount = amountPerDraw * drawIds.length;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    // ── 7. Build ticket document ──
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Bingo18, date, seq);
    const drawCount = drawIds.length;

    // _id phải là ObjectId instance để MongoDB lưu đúng kiểu và mapper có thể gọi toHexString().
    const ticketObjectId = new ObjectId();
    const ticketId = ticketObjectId.toHexString();
    const ticketDoc: TicketDoc = {
      _id: ticketObjectId,
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
        selectionsPerDraw,
        betUnitsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boards: builtBoards,
      sideBets: builtSideBets,
      progress: {
        totalDraws: drawCount,
        settledDraws: 0,
      },
      financialDate: getFinancialDate(now),
      status: TicketStatus.Paid,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };

    // ── 8. Insert ticket + entries ──

    // ── 9. Create entries cho TẤT CẢ draws (all-or-nothing) ──
    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      number: b.number,
      tripleKind: b.tripleKind,
      betCount: b.betCount,
    }));

    const sideBetSnapshots: EntrySideBetSnapshot[] = builtSideBets.map((s) => ({
      playType: s.playType,
      sum: s.sum,
      bet: s.bet,
      betCount: s.betCount,
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
        financialDate: draw.financialDate,
        tenant: { commissionRate, commissionAmount },
        status: EntryStatus.Scheduled,
        selectionCount: selectionsPerDraw,
        betUnitCount: betUnitsPerDraw,
        amount: amountPerDraw,
        unitPrice,
        entrySummary: {
          ticketNo,
          boards: boardSnapshots,
          sideBets: sideBetSnapshots,
        } satisfies EntrySummary,
        createdAt: now,
        updatedAt: now,
      });
    }

    await this.placeBetStore.saveAtomically(ticketDoc, entryDocs);

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
        selectionsPerDraw,
        betUnitsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      sideBetCount: builtSideBets.length,
      entryCount: drawCount,
    };
  }
}
