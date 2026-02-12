export const DEFAULT_AWS_REGION =
  process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-southeast-1";

if (!DEFAULT_AWS_REGION) {
  throw new Error(
    "AWS region is not configured. Please set AWS_REGION or AWS_DEFAULT_REGION."
  );
}

export interface AwsClientConfig {
  /**
   * AWS region, for example: ap-southeast-1
   */
  region: string;
}

/**
 * Base config cho tất cả AWS SDK clients.
 *
 * - Region đọc từ env (`AWS_REGION` hoặc `AWS_DEFAULT_REGION`).
 * - Credentials dùng default AWS SDK provider chain:
 *   env vars, shared credentials file, hoặc default profile.
 */
export function getAwsClientConfig(
  overrides?: Partial<AwsClientConfig>
): AwsClientConfig {
  return {
    region: DEFAULT_AWS_REGION,
    ...overrides,
  };
}

