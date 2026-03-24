import { MongoMapper } from "@megawin/data/mongo";
import { TenantEntity } from "@megawin/identity/entities";
import { Document } from "mongodb";

export class TenantMapper extends MongoMapper<Document, TenantEntity> {
  constructor() {
    super();
  }

  /**
   * Map properties from document to AccountEntity
   * @param doc - Document to map
   * @returns AccountEntity mapped from document
   */
  protected mapProps(doc: Document): TenantEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as TenantEntity;
  }
}
