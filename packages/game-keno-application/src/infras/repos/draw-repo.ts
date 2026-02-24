import { KenoCollections } from "@megawin/game-keno/entities";
import { DrawStatus } from "@megawin/game-core/entities";
import { BaseRepo } from "./base-repo";
import { DrawMapper, type DrawEntity } from "../mappers/draw-mapper";

export class DrawRepository extends BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: KenoCollections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  async getDrawById(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne({ drawId });
  }

  async getNextOpenDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      { status: DrawStatus.SalesOpen },
      { sort: { drawTime: 1 } },
    );
  }

  async getDrawsByDate(drawDate: string): Promise<DrawEntity[]> {
    return await this.findMany(
      { drawDate },
      { sort: { drawNo: 1 } },
    );
  }
}
