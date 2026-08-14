import { UseCase } from "@megawin/app-core/use-cases";
import { buildTicketNo, DrawStatus, EntryStatus, GameProduct, TicketStatus } from "@megawin/game-core/entities";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { DebitPlayerService } from "@megawin/game-core-application/services";
import type { Board, EntryBoardSnapshot, TicketDoc, TicketEntryDoc } from "@megawin/game-mega645/entities";
import { PlayType } from "@megawin/game-mega645/entities";
import { calculateLineCount, getRequiredNumberCount } from "@megawin/game-mega645/rules/play-types";
import { AppException } from "@megawin/shared/errors";
import { Currency } from "@megawin/shared/types";
import { getFinancialDate, nowVN } from "@megawin/shared/utils";
import { ObjectId } from "mongodb";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { PlaceBetStore } from "../../infras/repos/place-bet-store";
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

  protected async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const { tenantId, accountId, username, channel, ipAddress, drawIds, boards: boardInputs } = input;

    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    if (drawIds.length === 0 || drawIds.length > play.maxDrawCount) {
      throw AppException.badRequest(`Số kỳ phải từ 1 đến ${play.maxDrawCount}.`);
    }

    if (boardInputs.length === 0 || boardInputs.length > play.maxBoardsPerTicket) {
      throw AppException.badRequest(`Số board phải từ 1 đến ${play.maxBoardsPerTicket}.`);
    }

    const builtBoards: Board[] = [];
    let totalLinesPerDraw = 0;

    // Validate betCount per board theo config
    const minBetCount = play.minBetCount ?? 1;
    const maxBetCount = play.maxBetCount ?? 10;

    for (const bi of boardInputs) {
      const playType = bi.playType as PlayType;
      const betCount = bi.betCount ?? 1;

      if (betCount < minBetCount || betCount > maxBetCount) {
        throw AppException.badRequest(`betCount ${betCount} phải nằm trong khoảng [${minBetCount}, ${maxBetCount}].`);
      }

      const lineCount = calculateLineCount(playType);
      totalLinesPerDraw += lineCount;

      builtBoards.push({
        boardNo: bi.boardNo,
        playType,
        selection: {
          numbers: [...bi.selection.numbers].sort(),
        },
        derived: {
          expandedLines: lineCount,
          baoSize: playType !== PlayType.Standard ? getRequiredNumberCount(playType) : undefined,
        },
        betCount,
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
        throw AppException.badRequest(`Kỳ quay ${drawId} không đang mở bán.`);
      }

      if (now >= draw.sales.closeAt) {
        throw AppException.badRequest(`Kỳ quay ${drawId} đã hết thời gian nhận cược.`);
      }
    }

    const drawCount = drawIds.length;
    const unitPrice = play.unitPrice;
    // betUnitsPerDraw = tổng đơn vị cược thực tế (lines × betCount per board).
    const betUnitsPerDraw = builtBoards.reduce((sum, b) => sum + b.derived.expandedLines * b.betCount, 0);
    const amountPerDraw = unitPrice * betUnitsPerDraw;
    const totalAmount = amountPerDraw * drawCount;

    const tenantConfig = await this.getTenantConfig.run({ tenantId });

    if (!tenantConfig || tenantConfig.isEnabled !== true) {
      throw AppException.unauthorized("Không được phép chơi game. Vui lòng liên hệ admin.");
    }

    const commissionRate = tenantConfig.commissionRate;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Mega645, date, seq);

    // Gọi api để tính tiền xong mới cập nhập status
    const ticketStatus = TicketStatus.Paid;

    // tx (UUIDv7) generate sớm để gán vào ticketDoc — link ticket ↔ WAL.
    const tx = this.debitService.generateTx();

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
        linesPerDraw: totalLinesPerDraw,
        betUnitsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boards: builtBoards,
      lineCount: totalLinesPerDraw,
      progress: {
        totalDraws: drawCount,
        settledDraws: 0,
      },
      tx,
      financialDate: getFinancialDate(now),
      status: ticketStatus,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };

    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      numbers: b.selection.numbers,
      expandedLines: b.derived.expandedLines,
      betCount: b.betCount,
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
        financialDate: draw.financialDate,
        tenant: { commissionRate, commissionAmount },
        status: EntryStatus.Scheduled,
        lineCount: totalLinesPerDraw,
        betUnitCount: betUnitsPerDraw,
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

    // ── Debit player via WAL — ngay trước save để giảm cửa sổ crash ──
    const { balance } = await this.debitService.debit({
      tx,
      tenantId,
      accountId,
      username,
      amount: totalAmount,
      currency: Currency.VND,
      gameId: GameProduct.Mega645,
      roundIds: drawIds,
      description: `Đặt cược Mega 6/45 ${drawCount} kỳ ${drawIds[0]}${drawCount > 1 ? `→${drawIds[drawCount - 1]}` : ""}`,
      metadata: { ticketNo },
    });

    await this.placeBetStore.saveAtomically(ticketDoc, entryDocs);

    await this.debitService.markCompleted(tx);

    return {
      ticketId,
      ticketNo,
      status: ticketStatus,
      balance,
      drawPlan: {
        drawIds,
        drawCount,
      },
      pricing: {
        unitPrice,
        linesPerDraw: totalLinesPerDraw,
        betUnitsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      entryCount: drawCount,
    };
  }
}
