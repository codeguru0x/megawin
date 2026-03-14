import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import type { Max3dproDrawResult } from "@megawin/game-max3dpro/entities";
import { AbstractDrawRepository } from "@megawin/game-max3d-core/repos";
import { DrawMapper } from "../mappers/draw-mapper";
import type { DrawEntity } from "@megawin/game-max3dpro/entities";

export class DrawRepository extends AbstractDrawRepository<
  DrawEntity,
  DrawMapper,
  Max3dproDrawResult
> {
  constructor() {
    super({
      collName: Max3dproCollections.Draws,
      dataMapper: new DrawMapper(),
    });
  }
}

export type { DrawEntity };
