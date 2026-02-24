import { KenoCollections } from "@megawin/game-keno/entities";
import { BaseRepo } from "./base-repo";
import { TicketMapper, type TicketEntity } from "../mappers/ticket-mapper";

export class TicketRepository extends BaseRepo<TicketEntity, TicketMapper> {
  constructor() {
    super({
      collName: KenoCollections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }

  async getTicketsByPlayer(
    tenantId: string,
    playerId: string,
    page: number,
    size: number,
  ): Promise<TicketEntity[]> {
    return await this.paging(
      { tenantId, playerId },
      page,
      size,
      { sort: { createdAt: -1 } },
    );
  }
}
