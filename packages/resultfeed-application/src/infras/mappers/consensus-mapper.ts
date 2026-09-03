/**
 * ResultFeed – Consensus Mapper
 */

import { MongoMapper } from "@megawin/data/mongo";
import type { ConsensusEntity } from "@megawin/resultfeed/entities";
import type { Document } from "mongodb";

export class ConsensusMapper extends MongoMapper<Document, ConsensusEntity> {
  protected mapProps(doc: Document): ConsensusEntity {
    return {
      id: doc._id.toHexString(),
      gameKey: doc.gameKey,
      drawPeriod: doc.drawPeriod,
      drawDateSource: doc.drawDateSource,
      state: doc.state,
      numbers: doc.numbers,
      payoutHash: doc.payoutHash,
      displayHash: doc.displayHash,
      agreeing: doc.agreeing,
      conflicting: doc.conflicting,
      decidedBy: doc.decidedBy,
      decidedAt: doc.decidedAt,
      appliedPolicy: doc.appliedPolicy,
      humanVerify: doc.humanVerify,
      publishedAt: doc.publishedAt,
      version: doc.version,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies ConsensusEntity;
  }
}
