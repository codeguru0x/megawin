/**
 * ResultFeed – Observation Mapper
 */

import { MongoMapper } from "@megawin/data/mongo";
import type { ObservationEntity } from "@megawin/resultfeed/entities";
import type { Document } from "mongodb";

export class ObservationMapper extends MongoMapper<Document, ObservationEntity> {
  protected mapProps(doc: Document): ObservationEntity {
    return {
      id: doc._id.toHexString(),
      sourceId: doc.sourceId,
      gameKey: doc.gameKey,
      drawPeriod: doc.drawPeriod,
      drawDateSource: doc.drawDateSource,
      drawTimeSource: doc.drawTimeSource,
      numbersDisplay: doc.numbersDisplay,
      numbersCanonical: doc.numbersCanonical,
      displayHash: doc.displayHash,
      payoutHash: doc.payoutHash,
      claimedChecksums: doc.claimedChecksums,
      intrinsicState: doc.intrinsicState,
      intrinsicMismatch: doc.intrinsicMismatch,
      parserVersion: doc.parserVersion,
      submissionId: doc.submissionId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies ObservationEntity;
  }
}
