/**
 * Middy middleware: Xác thực server-to-server bằng API Key.
 *
 * Tenant server gửi:
 *   X-Tenant-Id: {tenantId}
 *   X-Api-Key: {apiKey}
 *
 * Middleware lookup tenant trong MongoDB, so sánh apiKey.
 * Nếu hợp lệ → gán event.tenantContext.
 * Nếu sai    → earlyResponse 401/403.
 *
 * WAF đã xử lý IP allowlist + rate limit ở tầng API Gateway.
 */

import { appErrorToStatusCode } from "@megawin/shared/errors";
import type { ApiErrorResponse } from "@megawin/shared/api-types";

const JSON_HEADERS = { "Content-Type": "application/json" };

export interface TenantContext {
  tenantId: string;
  displayName: string;
  status: string;
  apiKey: string;
}

export interface TenantApiKeyAuthOptions {
  /**
   * Hàm lookup tenant từ DB. Middleware không import trực tiếp repo
   * để giữ app-core tách biệt khỏi identity-application.
   */
  getTenant: (tenantId: string) => Promise<{
    tenantId: string;
    displayName: string;
    status: string;
    apiKey: string;
  } | null>;

  /**
   * Danh sách tenant status được phép. Mặc định: ["active"].
   */
  allowedStatuses?: string[];
}

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

export function tenantApiKeyAuthMiddleware(options: TenantApiKeyAuthOptions) {
  const { getTenant, allowedStatuses = ["active"] } = options;

  return {
    before: async (request: {
      event: Record<string, unknown> & {
        headers?: Record<string, string>;
        tenantContext?: TenantContext | null;
      };
      earlyResponse?: unknown;
    }) => {
      const { event } = request;
      const headers = event.headers ?? {};

      // Header names are lowercased by API Gateway v2 (HTTP API)
      const tenantId =
        headers["x-tenant-id"] ?? headers["X-Tenant-Id"] ?? "";
      const apiKey =
        headers["x-api-key"] ?? headers["X-Api-Key"] ?? "";

      if (!tenantId || !apiKey) {
        request.earlyResponse = errorResponse(
          401,
          "UNAUTHORIZED",
          "Missing X-Tenant-Id or X-Api-Key header"
        );
        return;
      }

      const tenant = await getTenant(tenantId);

      if (!tenant) {
        request.earlyResponse = errorResponse(
          401,
          "UNAUTHORIZED",
          "Invalid tenant credentials"
        );
        return;
      }

      if (tenant.apiKey !== apiKey) {
        request.earlyResponse = errorResponse(
          401,
          "UNAUTHORIZED",
          "Invalid tenant credentials"
        );
        return;
      }

      if (!allowedStatuses.includes(tenant.status)) {
        request.earlyResponse = errorResponse(
          403,
          "TENANT_DISABLED",
          `Tenant "${tenantId}" is not active`
        );
        return;
      }

      event.tenantContext = {
        tenantId: tenant.tenantId,
        displayName: tenant.displayName,
        status: tenant.status,
        apiKey: tenant.apiKey,
      };
    },
  };
}
