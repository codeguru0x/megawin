/**
 * Middy middleware: parse SNS event → event.parsed.
 * Parse JSON Message từ Records[0].Sns.Message → gán vào event.parsed.
 *
 * @example
 * const handler = middy(async (event) => {
 *   const dto = event.parsed as MyDto;
 *   return useCase.run(dto);
 * }).use(snsParserMiddleware());
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Raw SNS event shape. */
interface SnsEvent {
  Records?: Array<{ Sns?: { Message?: string; MessageId?: string } }>;
  parsed?: unknown;
}

/**
 * Parse SNS Message string → JSON.
 * Export để handler có thể dùng trực tiếp nếu không dùng middleware.
 */
export function parseSnsMessage<T = unknown>(message: string): T {
  return JSON.parse(message) as T;
}

/**
 * Middleware: parse SNS record message và gán vào event.parsed.
 * Mặc định lấy Records[0]; set recordIndex để chọn record khác.
 */
export function snsParserMiddleware(options?: { recordIndex?: number }) {
  const idx = options?.recordIndex ?? 0;

  return {
    before: async (request: { event: SnsEvent; earlyResponse?: unknown }) => {
      const { event } = request;
      const message = event.Records?.[idx]?.Sns?.Message;

      if (!message) {
        request.earlyResponse = {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            code: "VALIDATION",
            message: `Missing SNS Message at Records[${idx}]`,
          }),
        };
        return;
      }

      try {
        event.parsed = parseSnsMessage(message);
      } catch {
        request.earlyResponse = {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            code: "VALIDATION",
            message: "Invalid SNS Message (not valid JSON)",
          }),
        };
      }
    },
  };
}
