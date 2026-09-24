/**
 * Use Case: Place Bet (Max 3D)
 *
 * Đặt cược Max 3D: validate boards → validate draws → tính giá → tạo ticket + entries.
 *
 * Max 3D khác Lotto 5/35:
 * - Mỗi board có playMode (basic/plus) và playType (straight/combo3/combo6)
 * - Selection là triplets (bộ ba số 000-999) thay vì mainNumbers/specialNumbers
 * - Tối đa 4 boards (A-D), tối đa 6 kỳ
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { DebitPlayerService, type DebitPlayerInput } from "@megawin/game-core-application/services";
import { buildTicketNo, DrawStatus, EntryStatus, GameProduct, TicketStatus } from "@megawin/game-core/entities";
import type { Board, DrawEntity, EntryBoardSnapshot, TicketDoc, TicketEntryDoc } from "@megawin/game-max3d/entities";
import { calculateLineCount, validateSelection } from "@megawin/game-max3d/rules/play-types";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { Currency } from "@megawin/shared/types";
import { getFinancialDate, nowVN } from "@megawin/shared/utils";
import { ObjectId } from "mongodb";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { PlaceBetStore } from "../../infras/repos/place-bet-store";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";

export class PlaceBetUseCase extends UseCase<PlaceBetInput, PlaceBetOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly placeBetStore = new PlaceBetStore();
  private readonly ticketCounter = new TicketCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();
  private readonly debitService = new DebitPlayerService();
  private readonly ticketRepo = new TicketRepository();

  protected async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const { tenantId, accountId, username, channel, ipAddress, idempotencyKey, drawIds, boards: boardInputs } = input;

    // ── 1. Load game config ──
    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    // ── 2. Validate draws count vs config (config có thể thay đổi sau khi Zod validate) ──
    if (drawIds.length > play.maxDrawCount) {
      throw AppException.badRequest(`Số kỳ phải từ 1 đến ${play.maxDrawCount}.`);
    }

    // ── 3. Build boards — validate combo constraint + betCount ──
    if (boardInputs.length > play.maxBoardsPerTicket) {
      throw AppException.badRequest(`Số board phải từ 1 đến ${play.maxBoardsPerTicket}.`);
    }

    const builtBoards: Board[] = [];
    let totalLinesPerDraw = 0;
    let totalBetUnitsPerDraw = 0;

    for (const bi of boardInputs) {
      // Validate betCount không vượt maxBetCount từ game config.
      const betCount = bi.betCount;

      if (betCount > play.maxBetCount) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: betCount ${betCount} vượt quá giới hạn ${play.maxBetCount}.`,
        );
      }

      if (betCount < play.minBetCount) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: betCount ${betCount} thấp hơn tối thiểu ${play.minBetCount}.`,
        );
      }

      // validateSelection kiểm tra combo constraint (combo3/combo6 yêu cầu cấu trúc chữ số cụ thể)
      // — các rule về playMode/playType/triplet format đã qua Zod ở handler
      try {
        validateSelection(bi.playType, bi.selection);
      } catch (err) {
        throw AppException.badRequest(`Board ${bi.boardNo}: ${(err as Error).message}`);
      }

      const lineCount = calculateLineCount(bi.playMode, bi.playType, bi.selection);
      totalLinesPerDraw += lineCount;
      // betUnitsPerDraw = Σ(lineCount × betCount) — phản ánh tiền thực trả
      totalBetUnitsPerDraw += lineCount * betCount;

      builtBoards.push({
        boardNo: bi.boardNo,
        playMode: bi.playMode,
        playType: bi.playType,
        selection: {
          triplets: bi.selection.triplets,
        },
        derived: {
          lineCount,
          betCount,
        },
      });
    }

    // ── 4. Validate tất cả draws – all-or-nothing ──
    const now = nowVN();
    const draws = await this.drawRepo.getDrawsByIds(drawIds);
    const drawMap = new Map(draws.map((d) => [d.drawId, d]));
    const validatedDraws: DrawEntity[] = [];

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

      validatedDraws.push(draw);
    }

    // ── 5. Calculate pricing ──
    const drawCount = drawIds.length;
    const unitPrice = play.unitPrice;
    // amountPerDraw = betUnitsPerDraw × unitPrice (không phải linesPerDraw × unitPrice)
    const amountPerDraw = unitPrice * totalBetUnitsPerDraw;
    const totalAmount = amountPerDraw * drawCount;

    // ── 6. Load tenant commission rate ──
    const tenantConfig = await this.getTenantConfig.run({ tenantId });

    if (tenantConfig?.isEnabled !== true) {
      throw AppException.unauthorized("Không được phép chơi game. Vui lòng liên hệ admin.");
    }

    const commissionRate = tenantConfig.commissionRate;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    // ── 7. Build ticket document ──
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Max3d, date, seq);

    // tx từ Idempotency-Key: cùng input → cùng tx, unique WAL chặn trùng.
    const tx = this.debitService.deriveTx(accountId, idempotencyKey);

    // Tạo ticketId mới — _id phải là ObjectId instance để MongoDB lưu đúng kiểu và mapper có thể gọi toHexString().
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
        linesPerDraw: totalLinesPerDraw,
        betUnitsPerDraw: totalBetUnitsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boards: builtBoards,
      progress: {
        totalDraws: drawCount,
        settledDraws: 0,
      },
      tx,
      financialDate: getFinancialDate(now),
      status: TicketStatus.Paid,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };

    // ── 8. Build entry documents — ticketId đã biết trước, không cần đợi insert ticket ──
    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playMode: b.playMode,
      playType: b.playType,
      triplets: b.selection.triplets,
      lineCount: b.derived.lineCount,
      betCount: b.derived.betCount,
    }));

    const entryDocs: Array<Omit<TicketEntryDoc, "_id" | "version">> = validatedDraws.map((draw) => {
      return {
        tenantId,
        accountId,
        username,
        ipAddress,
        ticketId,
        drawId: draw.drawId,
        financialDate: draw.financialDate,
        tenant: { commissionRate, commissionAmount },
        status: EntryStatus.Scheduled,
        lineCount: totalLinesPerDraw,
        betUnitCount: totalBetUnitsPerDraw,
        amount: amountPerDraw,
        unitPrice,
        entrySummary: {
          ticketNo,
          boards: boardSnapshots,
        },

        createdAt: now,
        updatedAt: now,
      };
    });

    // ── 10. Debit player via WAL — ngay trước save để giảm cửa sổ crash ──
    const debitInput = {
      tx,
      tenantId,
      accountId,
      username,
      amount: totalAmount,
      currency: Currency.VND,
      gameId: GameProduct.Max3d,
      roundIds: drawIds,
      description: `Đặt cược Max 3D ${drawCount} kỳ ${drawIds[0]}${drawCount > 1 ? `→${drawIds[drawCount - 1]}` : ""}`,
      metadata: { ticketNo },
    };

    let balance: number;
    try {
      const result = await this.debitService.debit(debitInput);
      balance = result.balance;
    } catch (error) {
      if (!(error instanceof AppException) || error.code !== APP_ERROR_CODES.IDEMPOTENCY_CONFLICT) {
        throw error;
      }
      return await this.replayCompletedBet(tx, debitInput);
    }

    // ── 11. Insert ticket + entries trong 1 transaction (atomic) ──
    await this.placeBetStore.saveAtomically(ticketDoc, entryDocs);

    // ── 12. Mark WAL completed ──
    await this.debitService.markCompleted(tx);

    return {
      ticketId,
      ticketNo,
      status: TicketStatus.Paid,
      balance,
      drawPlan: {
        drawIds,
        drawCount,
      },
      pricing: {
        unitPrice,
        linesPerDraw: totalLinesPerDraw,
        betUnitsPerDraw: totalBetUnitsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      entryCount: drawCount,
    };
  }

  /**
   * Replay place-bet khi WAL đã COMPLETED — `replayCompletedDebit` đã xử lý phần
   * "được replay không" (throw 409 nếu không), ở đây chỉ còn lấy vé cũ theo `tx`
   * để build lại đúng response ban đầu.
   */
  private async replayCompletedBet(tx: string, debitInput: DebitPlayerInput): Promise<PlaceBetOutput> {
    const { balance } = await this.debitService.replayCompletedDebit(debitInput);

    const ticket = await this.ticketRepo.findByTx(tx);
    if (!ticket) {
      throw new AppException(APP_ERROR_CODES.IDEMPOTENCY_CONFLICT, "Không tìm thấy vé của giao dịch trước.");
    }

    return {
      ticketId: ticket.id,
      ticketNo: ticket.ticketNo,
      status: ticket.status,
      balance,
      drawPlan: ticket.drawPlan,
      pricing: ticket.pricing,
      boardCount: ticket.boards.length,
      entryCount: ticket.drawPlan.drawCount,
    };
  }
}
