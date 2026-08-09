import type { BaseEntity } from "@megawin/data/mongo";
import { GameRepo, type MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";

/**
 * Base repo cho mọi collection game (DB `megawin-game`).
 *
 * Bao gồm cả per-game report (`{game}_*_reports`) — report đi theo vòng đời game.
 * Cross-game aggregate (`system_*`, `player_settle_game_daily`) nằm ở DB report riêng.
 *
 * Alias mỏng của {@link GameRepo}.
 */
export class BaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends GameRepo<TEntity, TDataMapper> {}
