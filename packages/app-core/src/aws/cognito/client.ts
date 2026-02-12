import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

import { getAwsClientConfig } from "../config";

export type CognitoClient = CognitoIdentityProviderClient;

/**
 * Tạo Cognito client với cấu hình mặc định.
 *
 * - Region: lấy từ `AWS_REGION` hoặc `AWS_DEFAULT_REGION`.
 * - Credentials: dùng default AWS SDK provider chain.
 */
export function createCognitoClient(): CognitoClient {
  return new CognitoIdentityProviderClient(getAwsClientConfig());
}

/**
 * Singleton Cognito client.
 *
 * Chỉ được khởi tạo khi module Cognito được import.
 */
export const cognitoClient = createCognitoClient();

