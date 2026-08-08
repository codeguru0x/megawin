import type { Db, MongoClient } from "mongodb";

declare global {
  var __nextJsMongoClients: Map<string, MongoClient> | undefined;
  var __nextJsMongoDbCache: Map<string, Db> | undefined;
}
