/**
 * Max 3D – Ticket Repository
 *
 * Collection: max3dTickets
 */

import { Max3dCollections } from "@megawin/game-max3d/entities";
import { AbstractTicketRepository } from "@megawin/game-max3d-core/repos";
import { TicketMapper } from "../mappers/ticket-mapper";
import type { TicketEntity } from "@megawin/game-max3d/entities";

export class TicketRepository extends AbstractTicketRepository<TicketEntity, TicketMapper> {
  constructor() {
    super({
      collName: Max3dCollections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }
}

export type { TicketEntity };
