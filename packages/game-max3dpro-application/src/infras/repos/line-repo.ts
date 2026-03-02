import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import type { TicketLineDoc } from "@megawin/game-max3dpro/entities";
import { AbstractLineRepository } from "@megawin/game-max3d-core/repos";

export class LineRepository extends AbstractLineRepository<TicketLineDoc> {
  constructor() {
    super({ collName: Max3dproCollections.TicketLines });
  }
}
