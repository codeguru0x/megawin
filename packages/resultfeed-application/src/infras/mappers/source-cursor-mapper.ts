/**
 * ResultFeed – Source Cursor Mapper
 */

import { MongoMapper } from "@megawin/data/mongo";
import type { SourceCursorEntity } from "@megawin/resultfeed/entities";
import type { Document } from "mongodb";

export class SourceCursorMapper extends MongoMapper<Document, SourceCursorEntity> {
  protected mapProps(doc: Document): SourceCursorEntity {
    return {
      id: doc._id.toHexString(),
      sourceId: doc.sourceId,
      gameKey: doc.gameKey,
      lastConfirmedPeriod: doc.lastConfirmedPeriod,
      nextExpectedPeriod: doc.nextExpectedPeriod,
      nextFetchAt: doc.nextFetchAt,
      consecutiveFailures: doc.consecutiveFailures,
      needsBackfill: doc.needsBackfill,
      consecutiveIntrinsicFailures: doc.consecutiveIntrinsicFailures,
      isPaused: doc.isPaused,
      updatedAt: doc.updatedAt,
    } satisfies SourceCursorEntity;
  }
}
