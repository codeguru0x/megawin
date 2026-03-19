/**
 * Max 3D Pro – Ticket Repository
 *
 * Collection: max3dproTickets
 */

import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import { AbstractTicketRepository } from "@megawin/game-max3d-core/repos";
import { TicketMapper } from "../mappers/ticket-mapper";
import type { TicketEntity } from "@megawin/game-max3dpro/entities";

export class TicketRepository extends AbstractTicketRepository<TicketEntity, TicketMapper> {
  constructor() {
    super({
      collName: Max3dproCollections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }
}

export type { TicketEntity };
