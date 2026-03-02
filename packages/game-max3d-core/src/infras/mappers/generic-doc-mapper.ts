import { MongoMapper } from "@megawin/data/mongo";
import type { BaseEntity } from "@megawin/data/mongo";
import { Document } from "mongodb";

export class GenericDocMapper<
  TDoc extends Record<string, unknown>,
  TEntity extends TDoc & BaseEntity = TDoc & { id: string },
> extends MongoMapper<Document, TEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as TEntity;
  }
}
