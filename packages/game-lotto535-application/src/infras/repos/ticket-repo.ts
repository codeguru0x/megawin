import { Lotto535Collections } from "@megawin/game-lotto535/entities";
import { Lotto535BaseRepo } from "./lotto535-base-repo";
import { TicketMapper, type TicketEntity } from "../mappers/ticket-mapper";

export class TicketRepository extends Lotto535BaseRepo<
  TicketEntity,
  TicketMapper
> {
  constructor() {
    super({
      collName: Lotto535Collections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }

  async getTicketsByDrawId(drawId: string, page: number, size: number): Promise<TicketEntity[]> {
    return await this.paging(
      { "drawPlan.drawIds": drawId },
      page,
      size,
      { sort: { createdAt: -1 } },
    );
  }

  async countTicketsByDrawId(drawId: string): Promise<number> {
    return await this.count({ "drawPlan.drawIds": drawId });
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
