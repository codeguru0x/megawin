import { Db, MongoClient } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var __nextJsMongoClients: Map<string, MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __nextJsMongoDbCache: Map<string, Db> | undefined;
}

// Export empty object to ensure this file is treated as a module
export {};
