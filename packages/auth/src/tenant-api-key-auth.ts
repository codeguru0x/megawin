/**
 * Middy middleware: Xác thực server-to-server bằng API Key.
 *
 * Tenant gửi api key qua:
 *   1. Header: X-Api-Key (ưu tiên)
 *   2. Query string: ?apiKey=xxx (fallback)
 *
 * Middleware lookup tenant trong MongoDB bằng api key.
 * Nếu hợp lệ → gán event.tenant (TenantContext).
 * Nếu sai → earlyResponse 401/403 (ApiErrorResponse format).
 */

import type { ApiErrorResponse } from "@megawin/shared/api-types";

const JSON_HEADERS = { "Content-Type": "application/json" };

// ============ Types ============

export interface TenantContext {
  tenantId: string;
  displayName: string;
  status: string;
  apiKey: string;
}

export interface TenantApiKeyAuthOptions {
  getTenantByApiKey: (apiKey: string) => Promise<{
    tenantId: string;
    displayName: string;
    status: string;
    apiKey: string;
  } | null>;
  allowedStatuses?: string[];
}

export interface ApiGatewayEventWithTenant {
  tenant: TenantContext;
}

// ============ Helpers ============

function errorResponse(statusCode: number, code: string, message: string) {
  const body: ApiErrorResponse = {
    success: false,
    error: { code, message },
  };
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

function extractApiKey(event: {
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
}): string | undefined {
  const headers = event.headers ?? {};
  const fromHeader = headers["x-api-key"] ?? headers["X-Api-Key"] ?? undefined;
  if (fromHeader) return fromHeader;

  const qs = event.queryStringParameters ?? {};
  return qs["apiKey"] ?? qs["api_key"] ?? undefined;
}

// ============ Middleware ============

export function tenantApiKeyAuthMiddleware(options: TenantApiKeyAuthOptions) {
  const { getTenantByApiKey, allowedStatuses = ["active"] } = options;

  return {
    before: async (request: {
      event: Record<string, unknown> & {
        headers?: Record<string, string | undefined>;
        queryStringParameters?: Record<string, string | undefined> | null;
        tenant?: TenantContext | null;
      };
      earlyResponse?: unknown;
    }) => {
      const { event } = request;
      const apiKey = extractApiKey(event);

      if (!apiKey) {
        request.earlyResponse = errorResponse(
          401,
          "UNAUTHORIZED",
          "Missing API key. Provide via X-Api-Key header or apiKey query parameter.",
        );
        return;
      }

      const tenant = await getTenantByApiKey(apiKey);

      if (!tenant) {
        request.earlyResponse = errorResponse(401, "UNAUTHORIZED", "Invalid API key");
        return;
      }

      if (!allowedStatuses.includes(tenant.status)) {
        request.earlyResponse = errorResponse(403, "TENANT_DISABLED", `Tenant "${tenant.tenantId}" is not active`);
        return;
      }

      event.tenant = {
        tenantId: tenant.tenantId,
        displayName: tenant.displayName,
        status: tenant.status,
        apiKey: tenant.apiKey,
      };
    },
  };
}
