import { SQSClient } from "@aws-sdk/client-sqs";

import { getAwsClientConfig } from "../config";

export type SqsClient = SQSClient;

/**
 * Tạo SQS client với cấu hình mặc định.
 */
export function createSqsClient(): SqsClient {
  return new SQSClient(getAwsClientConfig());
}

/**
 * Singleton SQS client.
 *
 * Chỉ được khởi tạo khi module SQS được import.
 */
export const sqsClient = createSqsClient();
