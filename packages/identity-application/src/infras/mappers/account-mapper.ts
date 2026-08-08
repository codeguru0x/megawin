import { MongoMapper } from "@megawin/data/mongo";
import type { AccountEntity } from "@megawin/identity/entities";
import type { Document } from "mongodb";

export class AccountMapper extends MongoMapper<Document, AccountEntity> {
  constructor() {
    super();
  }

  /**
   * Map properties from document to AccountEntity
   * @param doc - Document to map
   * @returns AccountEntity mapped from document
   */
  protected mapProps(doc: Document): AccountEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as AccountEntity;
  }
}
