import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import { AbstractTicketRepository } from "@megawin/game-max3d-core/repos";
import { TicketMapper, type TicketEntity } from "../mappers/ticket-mapper";

export class TicketRepository extends AbstractTicketRepository<
  TicketEntity,
  TicketMapper
> {
  constructor() {
    super({
      collName: Max3dproCollections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }
}

export type { TicketEntity };
