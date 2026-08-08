import type { Db, MongoClient } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var __nextJsMongoClients: Map<string, MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __nextJsMongoDbCache: Map<string, Db> | undefined;
}
