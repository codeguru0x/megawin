/**
 * Middy middleware: parse SQS event → event.parsed.
 * Parse JSON body từ Records[0].body → gán vào event.parsed.
 *
 * @example
 * const handler = middy(async (event) => {
 *   const dto = event.parsed as MyDto;
 *   return useCase.run(dto);
 * }).use(sqsParserMiddleware());
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Raw SQS event shape. */
interface SqsEvent {
  Records?: Array<{ body?: string; messageId?: string }>;
  parsed?: unknown;
}

/**
 * Parse SQS body string → JSON.
 * Export để handler có thể dùng trực tiếp nếu không dùng middleware.
 */
export function parseSqsBody<T = unknown>(body: string): T {
  return JSON.parse(body) as T;
}

/**
 * Middleware: parse SQS record body và gán vào event.parsed.
 * Mặc định lấy Records[0]; set recordIndex để chọn record khác.
 */
export function sqsParserMiddleware(options?: { recordIndex?: number }) {
  const idx = options?.recordIndex ?? 0;

  return {
    before: async (request: { event: SqsEvent; earlyResponse?: unknown }) => {
      const { event } = request;
      const body = event.Records?.[idx]?.body;

      if (!body) {
        request.earlyResponse = {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            code: "VALIDATION",
            message: `Missing SQS body at Records[${idx}]`,
          }),
        };
        return;
      }

      try {
        event.parsed = parseSqsBody(body);
      } catch {
        request.earlyResponse = {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            code: "VALIDATION",
            message: "Invalid SQS body (not valid JSON)",
          }),
        };
      }
    },
  };
}
