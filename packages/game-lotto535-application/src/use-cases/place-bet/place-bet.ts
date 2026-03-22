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
import { calculateLineCount } from "@megawin/game-lotto535/rules/play-types";

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
    } = input;

    // ── 1. Load game config ──
    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    // ── 2. Validate tenant ──

    const tenantConfig = await this.getTenantConfig.run({ tenantId });
    if (!tenantConfig || tenantConfig.isEnabled !== true) {
      throw AppException.unauthorized("Không được phép chơi game. Vui lòng liên hệ admin.");
    }

    // ── 3. Build boards + tính line count ──
    if (boardInputs.length === 0 || boardInputs.length > play.maxBoardsPerTicket) {
      throw AppException.badRequest(`Số board phải từ 1 đến ${play.maxBoardsPerTicket}.`);
    }

    // Validate betCount range trước khi build boards
    const minBetCount = play.minBetCount ?? 1;
    const maxBetCount = play.maxBetCount ?? 10;
    for (const bi of boardInputs) {
      const bc = bi.betCount ?? 1;
      if (bc < minBetCount || bc > maxBetCount) {
        throw AppException.badRequest(
          `betCount ${bc} của board ${bi.boardNo} phải nằm trong khoảng [${minBetCount}, ${maxBetCount}].`,
        );
      }
    }

    const builtBoards: Board[] = [];
    let totalLinesPerDraw = 0;
    let betUnitsPerDraw = 0;

    for (const bi of boardInputs) {
      const playType = bi.playType as PlayType;
      const lineCount = calculateLineCount(playType, bi.selection);
      const betCount = bi.betCount ?? 1;
      totalLinesPerDraw += lineCount;
      // betUnitsPerDraw = Σ(expandedLines × betCount) — đơn vị cược thực tế tính tiền
      betUnitsPerDraw += lineCount * betCount;

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
        betCount,
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
        throw AppException.badRequest(`Kỳ quay ${drawId} không đang mở bán.`);
      }

      if (now >= draw.sales.closeAt) {
        throw AppException.badRequest(`Kỳ quay ${drawId} đã hết thời gian nhận cược.`);
      }
    }

    // ── 5. Kiểm tra drawCount không vượt giới hạn config (dynamic từ DB) ──
    if (drawIds.length > play.maxDrawCount) {
      throw AppException.badRequest(`Số kỳ tối đa là ${play.maxDrawCount}.`);
    }

    // ── 6. Calculate pricing ──
    const drawCount = drawIds.length;
    const unitPrice = play.unitPrice;
    // Tiền cược = betUnitsPerDraw × unitPrice (không phải linesPerDraw × unitPrice)
    const amountPerDraw = unitPrice * betUnitsPerDraw;
    const totalAmount = amountPerDraw * drawCount;

    const commissionRate = tenantConfig.commissionRate;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    // ── 7. Build ticket document ──
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Lotto535, date, seq);

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
      mainNumbers: b.selection.mainNumbers,
      specialNumbers: b.selection.specialNumbers,
      expandedLines: b.derived.expandedLines,
      betCount: b.betCount ?? 1,
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
