/**
 * Test helper cho API Gateway handler tests — mirror `apps/api-player/test/helpers/mock-event.ts`,
 * rút gọn vì `api-resultfeed` chỉ có auth API key (không có `user`/claims).
 */

export interface MockEventOptions {
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
}

export function createMockEvent(options: MockEventOptions = {}) {
  return {
    httpMethod: "GET",
    headers: { "Content-Type": "application/json", ...options.headers },
    body: null,
    pathParameters: {},
    queryStringParameters: options.queryStringParameters ?? {},
    requestContext: { httpMethod: "GET" },
  };
}

export function parseBody<T = unknown>(response: {
  statusCode: number;
  body: string;
}): { success: boolean; data?: T; error?: { code: string; message: string } } {
  return JSON.parse(response.body);
}
