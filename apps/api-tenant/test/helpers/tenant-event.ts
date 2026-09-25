/**
 * Event HTTP API v2 cho test rate-limit api-tenant.
 * Auth đọc `X-Api-Key` rồi gán `event.tenant` — test mock TenantRepository theo apiKey.
 */

export interface TenantEventOptions {
  tenantId: string;
  apiKey?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  sourceIp?: string;
  omitApiKey?: boolean;
}

export function createTenantHttpEvent(options: TenantEventOptions) {
  const apiKey = options.apiKey ?? `key-${options.tenantId}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!options.omitApiKey) {
    headers["x-api-key"] = apiKey;
  }

  return {
    httpMethod: options.body ? "POST" : "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : null,
    pathParameters: {},
    queryStringParameters: options.query ?? {},
    requestContext: {
      http: {
        method: options.body ? "POST" : "GET",
        sourceIp: options.sourceIp ?? "203.0.113.80",
      },
    },
  };
}

export function parseBody<T = unknown>(response: {
  statusCode: number;
  body: string;
}): { success: boolean; data?: T; error?: { code: string; message: string } } {
  return JSON.parse(response.body);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
