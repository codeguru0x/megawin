import { Max3dCollections } from "@megawin/game-max3d/entities";
import type { TicketLineDoc } from "@megawin/game-max3d/entities";
import { AbstractLineRepository } from "@megawin/game-max3d-core/repos";

export class LineRepository extends AbstractLineRepository<TicketLineDoc> {
  constructor() {
    super({ collName: Max3dCollections.TicketLines });
  }
}
