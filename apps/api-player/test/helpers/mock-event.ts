/**
 * Test Helpers cho API Gateway handler tests.
 *
 * Tạo mock API Gateway event với auth context đã inject sẵn,
 * giống hệt cách middleware gán vào event thật.
 */

import type { TenantAuthContext } from "@megawin/auth";
import { ClaimKey } from "@megawin/identity/entities";

export interface MockEventOptions {
  user?: Partial<TenantAuthContext>;
  body?: Record<string, unknown>;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
}

const DEFAULT_USER: TenantAuthContext = {
  sub: "test-sub-123",
  username: "player001",
  accountType: "player",
  accountStatus: "active",
  accountId: "acc-001",
  tenantId: "tenant-001",
  roles: ["player"],
};

export function createMockEvent(options: MockEventOptions = {}) {
  const user = { ...DEFAULT_USER, ...options.user };

  return {
    httpMethod: "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : null,
    pathParameters: options.pathParameters ?? {},
    queryStringParameters: options.queryStringParameters ?? {},
    requestContext: {
      httpMethod: "GET",
      authorizer: {
        claims: {
          [ClaimKey.Sub]: user.sub,
          [ClaimKey.Username]: user.username,
          [ClaimKey.AccountType]: user.accountType,
          [ClaimKey.AccountStatus]: user.accountStatus,
          [ClaimKey.AccountId]: user.accountId,
          [ClaimKey.TenantId]: user.tenantId,
          [ClaimKey.Roles]: user.roles.join(","),
        },
      },
    },
    user,
    schema: {
      body: options.body ?? {},
      path: options.pathParameters ?? {},
      query: options.queryStringParameters ?? {},
    },
  };
}

export function parseBody<T = unknown>(response: {
  statusCode: number;
  body: string;
}): { success: boolean; data?: T; error?: { code: string; message: string } } {
  return JSON.parse(response.body);
}

export { DEFAULT_USER };
