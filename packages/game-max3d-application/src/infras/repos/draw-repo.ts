import { Max3dCollections } from "@megawin/game-max3d/entities";
import type { Max3dDrawResult } from "@megawin/game-max3d/entities";
import type { DrawDoc } from "@megawin/game-max3d/entities";
import { AbstractDrawRepository } from "@megawin/game-max3d-core/repos";
import { DrawMapper } from "../mappers/draw-mapper";
import type { DrawEntity } from "@megawin/game-max3d/entities";

export class DrawRepository extends AbstractDrawRepository<
  DrawEntity,
  DrawMapper,
  Max3dDrawResult
> {
  constructor() {
    super({
      collName: Max3dCollections.Draws,
      dataMapper: new DrawMapper(),
    });
  }
}

export type { DrawEntity };
