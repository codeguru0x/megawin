import { Mapper } from "@megawin/shared/mappers";
import { BaseEntity } from "./base-entity";
import { Document } from "mongodb";
/**
 * Map document từ MongoDB sang Entity object
 */
export abstract class MongoMapper<TDoc extends Document, TModel extends BaseEntity> extends Mapper<TDoc, TModel> {
  /**
   * Map properties from document to entity
   * @param doc
   */
  protected abstract mapProps(doc: TDoc): TModel;
}

/**
 * Default mapper để map từ mongodb collection sang entity.
 * Mặc định sẽ map từ _id sang id và loại bỏ _id khỏi object.
 * Các field khác sẽ được map theo tên của field trong document.
 * @example
 * const doc: MongoDoc = {
 *   _id: new ObjectId(),
 *   user_name: "John Doe",
 * };
 * const model: Model = {
 *   id: doc._id.toString(),
 *   user_name: doc.name,
 * };
 * @template TDoc - Document type
 * @template TModel - Model type
 */
export class DefaultMongoMapper<TDoc extends Document, TModel extends BaseEntity> extends MongoMapper<TDoc, TModel> {
  /**
   * constructor
   */
  constructor() {
    super();
  }

  /**
   * Map properties from document to model
   * @param doc - Document to map
   * @returns Model mapped from document
   */
  protected mapProps(doc: TDoc): TModel {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as TModel;
  }
}
