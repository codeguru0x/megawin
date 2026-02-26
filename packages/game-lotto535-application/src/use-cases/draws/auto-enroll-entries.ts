/**
 * Use Case: Auto-Enroll Entries
 *
 * Khi 1 kỳ quay mở bán, scan tất cả tickets multi-draw chưa fully enrolled,
 * tạo entries mới cho kỳ này.
 *
 * DATA CONSISTENCY (ticket-first):
 *   1. enrollDraw (ticket) – atomic $ne guard, nếu drawId đã có → skip
 *   2. insertEntry – unique index (ticketId, drawId) phòng duplicate
 *   3. Nếu step 2 fail → ticket đã enroll nhưng entry thiếu
 *      → closeSales sẽ detect entries vs tickets count mismatch
 *      → admin có thể retry step function
 *   4. Nếu step 1 fail → skip ticket, retry vòng sau
 *
 * IDEMPOTENT:
 *   - enrollDraw dùng $ne guard → gọi lại không thay đổi gì
 *   - insertEntry dùng unique index → duplicate key bị catch → skip
 *   - Step function có thể retry toàn bộ an toàn
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { EntryStatus, DrawStatus } from "@megawin/game-core/entities";
import type {
  TicketEntryDoc,
  EntryBoardSnapshot,
} from "@megawin/game-lotto535/entities";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import { TenantConfigRepository } from "../../infras/repos/tenant-config-repo";

const AUTO_ENROLL_BATCH_SIZE = 200;

// ─────────────────────────────────────────────
// Input / Output
// ─────────────────────────────────────────────

export interface AutoEnrollInput {
  drawId: string;
}

export interface AutoEnrollOutput {
  drawId: string;
  enrolledCount: number;
  skippedCount: number;
  entriesCreated: number;
  done: boolean;
}

// ─────────────────────────────────────────────
// Use Case
// ─────────────────────────────────────────────

export class AutoEnrollEntriesUseCase extends StepFunctionUseCase<
  AutoEnrollInput,
  AutoEnrollOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly configRepo = new GameConfigRepository();
  private readonly ticketRepo = new TicketRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly tenantConfigRepo = new TenantConfigRepository();

  protected async execute(input: AutoEnrollInput): Promise<AutoEnrollOutput> {
    const { drawId } = input;
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw new Error(`Draw ${drawId} không tồn tại.`);
    }
    if (draw.status !== DrawStatus.SalesOpen) {
      throw new Error(
        `Draw ${drawId} không đang mở bán (status: ${draw.status}).`
      );
    }
    const globalConfig = await this.configRepo.getGlobalConfig();
    if (!globalConfig) {
      throw new Error("GameConfig chưa được khởi tạo.");
    }
    let enrolledCount = 0;
    let skippedCount = 0;
    let entriesCreated = 0;
    let lastId: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.ticketRepo.findTicketsForAutoEnroll(
        AUTO_ENROLL_BATCH_SIZE,
        lastId
      );

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const ticket of batch) {
        lastId = ticket.id;

        if (ticket.drawPlan.enrolledDrawIds.includes(drawId)) {
          skippedCount++;
          continue;
        }

        try {
          const isLastDraw =
            ticket.drawPlan.enrolledDraws + 1 >= ticket.drawPlan.drawCount;

          const enrolled = await this.ticketRepo.enrollDraw(
            ticket.id,
            drawId,
            isLastDraw
          );
          if (!enrolled) {
            skippedCount++;
            continue;
          }

          const tenantConfig = await this.tenantConfigRepo.getTenantConfig(
            ticket.tenantId
          );
          const commissionRate =
            tenantConfig?.commissionRate ??
            globalConfig.rates.defaultCommissionRate;

          const boardSnapshots: EntryBoardSnapshot[] = ticket.boards.map(
            (b: any) => ({
              boardNo: b.boardNo,
              playType: b.playType,
              mainNumbers: b.selection.mainNumbers,
              specialNumbers: b.selection.specialNumbers,
              expandedLines: b.derived.expandedLines,
            })
          );

          const now = new Date();
          const entryDoc: Omit<TicketEntryDoc, "_id" | "version"> = {
            tenantId: ticket.tenantId,
            playerId: ticket.playerId,
            ticketId: ticket.id,
            drawId,
            drawTime: draw.drawTime,
            drawDate: draw.drawDate,
            financialDate: draw.financialDate,
            tenantSnapshot: { commissionRate },
            status: EntryStatus.Scheduled as any,
            lineCount: ticket.pricing.linesPerDraw,
            amount: ticket.pricing.amountPerDraw,
            unitPrice: ticket.pricing.unitPrice,
            entrySummary: {
              ticketNo: ticket.ticketNo,
              selectionHash: ticket.expansion.selectionHash,
              ticketVersion: ticket.audit.version,
              boards: boardSnapshots,
            },
            createdAt: now,
            updatedAt: now,
          };

          await this.entryRepo.insertEntry(entryDoc as any);

          enrolledCount++;
          entriesCreated++;
        } catch (err: unknown) {
          skippedCount++;
        }
      }

      if (batch.length < AUTO_ENROLL_BATCH_SIZE) {
        hasMore = false;
      }
    }

    return {
      drawId,
      enrolledCount,
      skippedCount,
      entriesCreated,
      done: true,
    };
  }
}
