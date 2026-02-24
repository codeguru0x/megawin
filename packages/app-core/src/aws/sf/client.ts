import { SFNClient } from "@aws-sdk/client-sfn";

import { getAwsClientConfig } from "../config";

export type StepFunctionClient = SFNClient;

/**
 * maxAttempts = 5 → 2 lần gọi gốc + 3 lần retry.
 * SDK v3 default chỉ 3 (1 + 2 retry), nâng lên đảm bảo
 * startExecution không bị miss do transient error.
 *
 * Retry strategy: standard (exponential backoff + jitter).
 * Retry conditions: throttling, transient errors, 5xx server errors.
 */
const MAX_ATTEMPTS = 5;

/**
 * Tạo Step Functions client với cấu hình mặc định.
 */
export function createSfnClient(): StepFunctionClient {
  return new SFNClient({
    ...getAwsClientConfig(),
    maxAttempts: MAX_ATTEMPTS,
  });
}

/**
 * Singleton Step Functions client.
 *
 * Chỉ được khởi tạo khi module sf được import.
 */
export const sfnClient = createSfnClient();
