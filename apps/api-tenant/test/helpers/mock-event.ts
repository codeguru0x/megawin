/**
 * Test Helpers cho API Gateway handler tests (tenant API key auth).
 *
 * Tạo mock event với `event.tenant` đã inject sẵn, giống hệt cách
 * `tenantAuth` middleware gán vào event sau khi verify API key thành công.
 * Dùng khi mock `@megawin/auth/tenant` ở test file (xem test/setup.ts).
 */

import type { TenantContext } from "@megawin/auth";

export interface MockEventOptions {
  tenant?: Partial<TenantContext>;
  body?: Record<string, unknown>;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
}

const DEFAULT_TENANT: TenantContext = {
  tenantId: "tenant-001",
  displayName: "Test Tenant",
  status: "active",
  apiKey: "test-api-key",
};

export function createMockEvent(options: MockEventOptions = {}) {
  const tenant = { ...DEFAULT_TENANT, ...options.tenant };

  return {
    httpMethod: "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : null,
    pathParameters: options.pathParameters ?? {},
    queryStringParameters: options.queryStringParameters ?? {},
    tenant,
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

export { DEFAULT_TENANT };
