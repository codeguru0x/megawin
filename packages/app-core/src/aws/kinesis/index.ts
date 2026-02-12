import { KinesisClient } from "@aws-sdk/client-kinesis";

import { getAwsClientConfig } from "../config";

export type KinesisClientType = KinesisClient;

/**
 * Tạo Kinesis client với cấu hình mặc định.
 */
export function createKinesisClient(): KinesisClientType {
  return new KinesisClient(getAwsClientConfig());
}

/**
 * Singleton Kinesis client.
 *
 * Chỉ được khởi tạo khi module Kinesis được import.
 */
export const kinesisClient = createKinesisClient();

