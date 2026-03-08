/**
 * Max 3D – Ticket Repository
 *
 * Collection: max3dTickets
 *
 * Max3D void theo board (không theo draw). voidSummary của ticket
 * dùng board-level schema (isFullVoid, voidedBoards, originalAmount...).
 * Vì vậy override buildVoidSyncSet() để không ghi draw-level void fields.
 */

import { Max3dCollections } from "@megawin/game-max3d/entities";
import { AbstractTicketRepository } from "@megawin/game-max3d-core/repos";
import { TicketMapper, type TicketEntity } from "../mappers/ticket-mapper";
import type { TicketSummary } from "@megawin/game-max3d-core/repos";

export class TicketRepository extends AbstractTicketRepository<TicketEntity, TicketMapper> {
  constructor() {
    super({
      collName: Max3dCollections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }

  /**
   * Max3D void theo board, không theo draw.
   * TicketVoidSummary entity là board-level (isFullVoid, voidedBoards...) –
   * không dùng draw-level fields (voidedDrawCount, voidedDrawIds...).
   * Void summary được cập nhật riêng qua void flow, không qua sync này.
   */
  protected override buildVoidSyncSet(
    _summary: TicketSummary,
    _voidedCount: number,
    _now: Date,
  ): Record<string, unknown> {
    return {};
  }
}

export type { TicketEntity };
