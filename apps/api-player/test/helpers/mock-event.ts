/**
 * Test Helpers cho API Gateway handler tests.
 *
 * Tạo mock API Gateway event với auth context đã inject sẵn,
 * giống hệt cách middleware gán vào event thật.
 */

import type { TenantAuthContext } from "@megawin/auth";

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
          sub: user.sub,
          "custom:username": user.username,
          "custom:account_type": user.accountType,
          "custom:account_status": user.accountStatus,
          "custom:account_id": user.accountId,
          "custom:tenant_id": user.tenantId,
          "custom:roles": user.roles.join(","),
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
