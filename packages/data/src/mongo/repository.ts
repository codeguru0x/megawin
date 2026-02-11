import {
  AggregateOptions,
  AnyBulkWriteOperation,
  BulkWriteOptions,
  BulkWriteResult,
  Collection,
  CountOptions,
  Db,
  DeleteOptions,
  DistinctOptions,
  Document,
  Filter,
  FindOneAndUpdateOptions,
  FindOptions,
  InsertManyResult,
  InsertOneOptions,
  InsertOneResult,
  MongoClient,
  ObjectId,
  OptionalId,
  Sort,
  UpdateFilter,
  UpdateOptions,
  UpdateResult,
  WithId,
} from "mongodb";

import { getMongoClient, getMongoDb } from "./client";
import { DefaultMongoMapper, MongoMapper } from "./mapper";

import { Constants } from "./constants";
import { BaseEntity } from "./base-entity";

export abstract class MongoRepository<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> {
  protected _mongoEnvKey: string;
  protected _clientOptions?: ConstructorParameters<typeof MongoClient>[1];

  protected _db!: Db;

  protected _dbName!: string;
  protected _collName!: string;

  protected _collection!: Collection<Document>;
  protected _dataMapper!: MongoMapper<Document, TEntity>;

  /**
   * constructor
   * @param mongoDbConfig
   * @param mapper
   */
  constructor({
    mongoEnvKey,
    dbName,
    collName,
    clientOptions,
    dataMapper,
  }: {
    mongoEnvKey?: string;
    dbName: string;
    collName: string;
    clientOptions?: ConstructorParameters<typeof MongoClient>[1];
    dataMapper?: TDataMapper;
  }) {
    if (!dbName) {
      throw new Error("Database name is required");
    }

    if (!collName) {
      throw new Error("Collection name is required");
    }
    // Nếu không có mongoEnvKey thì mặc định lấy từ env MONGODB_URI
    this._mongoEnvKey = mongoEnvKey ?? "MONGODB_URI";

    this._dbName = dbName;
    this._collName = collName;

    this._clientOptions = clientOptions;

    // Nếu không có mapper thì mặc định dùng mapper hết từ mongodb collection sang entity
    this._dataMapper =
      dataMapper ?? new DefaultMongoMapper<Document, TEntity>();
  }

  /**
   * Get Mongodb collection.
   * Lấy collection name theo chỉ định nếu có giá trị collName
   * Ngược lại lấy collection name khi khởi tạo class
   * @param collName
   * @returns
   */
  public async getCollection(): Promise<Collection<Document>> {
    if (!this._collection) {
      const db = await this.getDb();
      this._collection = db.collection(this._collName);
    }

    return this._collection;
  }

  /**
   * Get db name
   * Nếu có giá trị dbName sẽ lấy theo chỉ định
   * Ngược lại lấy theo dbName khi khởi tạo class
   * @param dbName
   * @returns
   */
  public async getDb(): Promise<Db> {
    if (!this._db) {
      this._db = await getMongoDb({
        mongoEnvKey: this._mongoEnvKey,
        dbName: this._dbName,
        clientOptions: this._clientOptions,
      });
    }

    return this._db;
  }

  /**
   * Get MongoDB Client
   * @returns
   */
  public async getClient(): Promise<MongoClient> {
    return await getMongoClient({
      mongoEnvKey: this._mongoEnvKey,
      clientOptions: this._clientOptions,
    });
  }

  /**
   * Initialize before use
   * Lấy collection và db để sử dụng trong các phương thức khác
   * @returns
   */
  public async initBeforeUse(): Promise<void> {
    if (this._collection) {
      return;
    }

    // Lấy collection nếu chưa có
    const db = await this.getDb();
    this._collection = db.collection(this._collName);
  }

  /**
   * Tìm 1 document theo Id
   * @param id
   * @param options
   * @returns
   */
  public async findOneById(
    id: string,
    options?: FindOptions
  ): Promise<TEntity | null> {
    if (!ObjectId.isValid(id)) {
      throw new Error("Invalid id");
    }

    return await this.findOne(
      {
        _id: new ObjectId(id),
      },
      options
    );
  }

  /**
   * Tìm 1 document theo Id và trả về document
   * @param id - Id of the document
   * @param options - Options query
   * @returns - One document found as document or null
   */
  public async findOneByIdAsDocument(
    id: string,
    options?: FindOptions
  ): Promise<Document | null> {
    if (!ObjectId.isValid(id)) {
      throw new Error("Invalid id");
    }

    return await this.findOneAsDocument({ _id: new ObjectId(id) }, options);
  }

  /**
   * Find one document
   * @param filter - Filter query to find one document
   * @param options - Options query
   * @returns - One document found or null
   */
  public async findOne(
    filter: Filter<Document>,
    options?: FindOptions
  ): Promise<TEntity | null> {
    const doc = await this.findOneAsDocument(filter, options);
    return doc != null ? this._dataMapper.mapOne(doc) : null;
  }

  /**
   * Find one document as document
   * @param filter - Filter query to find one document
   * @param options - Options query
   * @returns - One document found as document
   */
  public async findOneAsDocument(
    filter: Filter<Document>,
    options?: FindOptions
  ): Promise<Document | null> {
    await this.initBeforeUse();

    const [doc] = await this._collection
      .find(filter, options)
      .limit(1)
      .toArray();

    return doc ?? null;
  }
  /**
   * Tìm documents
   * @param filter
   * @param options
   * @returns
   */
  public async findMany(
    filter: Filter<Document>,
    options?: FindOptions
  ): Promise<TEntity[]> {
    const docs = await this.findManyAsDocuments(filter, options);

    return this._dataMapper.map(docs) ?? [];
  }

  /**
   * Find many documents
   * @param filter - Filter query to find many documents
   * @param options - Options query
   * @returns - Many documents found as documents
   */
  public async findManyAsDocuments(
    filter: Filter<Document>,
    options?: FindOptions
  ): Promise<Document[]> {
    await this.initBeforeUse();

    // Nếu không có limit thì mặc định lấy tối đa 500 bản ghi
    const limit = options?.limit ?? Constants.HardLimit.MongoDBLimit;

    return await this._collection
      .find(filter, { ...(options ?? {}), limit })
      .toArray();
  }

  /**
   * Tìm tất cả documents
   * @param options
   * @returns
   */
  public async findAll(options?: FindOptions): Promise<TEntity[]> {
    return await this.findMany({}, options);
  }

  /**
   * Phân trang tìm tất cả documents
   * @param page
   * @param size
   * @param options
   * @returns
   */
  public async pagingAll(
    page: number,
    size: number,
    options?: FindOptions
  ): Promise<TEntity[]> {
    return await this.paging({}, page, size, options);
  }

  /**
   * Phân trang theo lọc document theo điều kiện
   * @param filter
   * @param page
   * @param size
   * @param options
   * @returns
   */
  public async paging(
    filter: Filter<Document>,
    page: number,
    size: number,
    options?: FindOptions
  ): Promise<TEntity[]> {
    page = page <= 0 ? Constants.Default.Paging.Page : page;

    // Lấy tối đa số page size đã fix cứng
    size =
      size <= 0
        ? Constants.Default.Paging.Size
        : Math.min(size, Constants.HardLimit.Paging.Size);

    const skip = size * (page - 1);

    // Override các thuộc tính limit và skip để phân trang cho đúng
    options = Object.assign(options ?? {}, { limit: size, skip: skip });

    return await this.findMany(filter, options);
  }

  /**
   * Thêm 1 document
   * @param doc
   * @param options
   * @returns
   */
  public async insertOne(
    doc: OptionalId<Document>,
    options?: InsertOneOptions
  ): Promise<string> {
    await this.initBeforeUse();

    const result = await this._collection.insertOne(doc, options);
    return result.insertedId.toString();
  }

  /**
   * Thêm nhiều documents
   * @param docs
   * @param options
   * @returns
   */
  public async insertMany(
    docs: OptionalId<Document>[],
    options?: BulkWriteOptions
  ): Promise<InsertManyResult<Document>> {
    await this.initBeforeUse();

    return await this._collection.insertMany(docs, options);
  }

  /**
   * Cập nhật 1 document theo Id
   * @param id
   * @param update
   * @param options
   * @returns
   */
  public async updateById(
    id: string,
    update: UpdateFilter<Document>,
    options?: UpdateOptions & {
      sort?: Sort;
    }
  ): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      throw new Error("Invalid id");
    }

    return await this.updateOne(
      {
        _id: new ObjectId(id),
      },
      update,
      options
    );
  }

  /**
   * Cập nhật 1 document theo điều kiện
   * @param filter
   * @param update
   * @param options
   * @returns
   */
  public async updateOne(
    filter: Filter<Document>,
    update: UpdateFilter<Document> | Document[],
    options?: UpdateOptions & {
      sort?: Sort;
    }
  ): Promise<boolean> {
    await this.initBeforeUse();

    const result = await this._collection.updateOne(filter, update, options);
    return result.modifiedCount === 1 || result.upsertedCount === 1;
  }

  /**
   * Cập nhật nhiều documents
   * @param filter
   * @param update
   * @param options
   * @returns
   */
  public async updateMany(
    filter: Filter<Document>,
    update: Document[] | UpdateFilter<Document>,
    options?: UpdateOptions
  ): Promise<UpdateResult<Document>> {
    await this.initBeforeUse();

    return await this._collection.updateMany(filter, update, options);
  }

  /**
   * Xoá 1 document theo điều kiện
   * @param filter
   * @param options
   * @returns
   */
  public async deleteOne(
    filter?: Filter<Document>,
    options?: DeleteOptions
  ): Promise<boolean> {
    await this.initBeforeUse();

    const result = await this._collection.deleteOne(filter, options);
    return result.deletedCount === 1;
  }

  /**
   * Xoá 1 document theo Id
   * @param id
   * @param options
   * @returns
   */
  public async deleteOneById(
    id: string,
    options?: DeleteOptions
  ): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      throw new Error("Invalid id");
    }

    return await this.deleteOne(
      {
        _id: new ObjectId(id),
      },
      options
    );
  }

  /**
   * Xoá nhiều documents
   * @param filter
   * @param options
   * @returns
   */
  public async deleteMany(
    filter?: Filter<Document>,
    options?: DeleteOptions
  ): Promise<number> {
    await this.initBeforeUse();

    const result = await this._collection.deleteMany(filter, options);
    return result.deletedCount;
  }

  /**
   * Tìm 1 document theo Id và cập nhật
   * @param id
   * @param update
   * @param options
   * @returns
   */
  public async findOneByIdAndUpdate(
    id: string,
    update: UpdateFilter<Document>,
    options: FindOneAndUpdateOptions
  ): Promise<TEntity | null> {
    if (!ObjectId.isValid(id)) {
      throw new Error("Invalid id");
    }

    return await this.findOneAndUpdate(
      {
        _id: new ObjectId(id),
      },
      update,
      options
    );
  }

  /**
   * Tìm và cập nhật document
   * Từ phiên bản MongoDB client 6.0 nodejs sẽ mặc định trả về document nếu có (includeResultMetadata = false - default)
   * https://github.com/mongodb/node-mongodb-native/releases/tag/v6.0.0
   * @param filter
   * @param update
   * @param options
   * @returns
   */
  public async findOneAndUpdate(
    filter: Filter<Document>,
    update: UpdateFilter<Document> | Document[],
    options: FindOneAndUpdateOptions
  ): Promise<TEntity | null> {
    await this.initBeforeUse();

    const modifyResult = await this._collection.findOneAndUpdate(
      filter,
      update,
      options
    );

    return modifyResult != null ? this._dataMapper.mapOne(modifyResult) : null;
  }

  /**
   * Bulk write
   * @param operations
   * @param options
   * @returns
   */
  public async bulkWrite(
    operations: AnyBulkWriteOperation<Document>[],
    options?: BulkWriteOptions
  ): Promise<BulkWriteResult> {
    await this.initBeforeUse();

    return await this._collection.bulkWrite(operations, options);
  }

  /**
   * Đếm số lượng document trong collection
   * @param filter
   * @param options
   * @returns
   */
  public async count(
    filter?: Filter<Document>,
    options?: CountOptions
  ): Promise<number> {
    await this.initBeforeUse();

    return await this._collection.countDocuments(filter, options);
  }

  /**
   * Kiểm tra có tồn tại document
   * @param filter
   * @returns
   */
  public async exists(filter?: Filter<Document>): Promise<boolean> {
    return (await this.count(filter, { limit: 1 })) === 1;
  }

  /**
   * Aggregate Pipeline
   * @param pipeline
   * @param options
   * @returns
   */
  public async aggregate(
    pipeline: Document[],
    options?: AggregateOptions
  ): Promise<Document[]> {
    await this.initBeforeUse();

    return await this._collection.aggregate(pipeline, options).toArray();
  }

  /**
   * Lấy danh sách các giá trị không trùng lặp theo key trong collection
   * @param key
   * @param filter
   * @param options
   * @returns
   */
  public async distinct(
    key: string,
    filter: Filter<Document> = {},
    options: DistinctOptions = {}
  ): Promise<any[]> {
    await this.initBeforeUse();

    return await this._collection.distinct(key, filter, options);
  }
}
