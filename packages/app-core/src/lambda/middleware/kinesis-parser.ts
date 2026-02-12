/**
 * Middy middleware: parse Kinesis event → event.parsed.
 * Decode base64 data từ Records[0].kinesis.data → JSON → gán vào event.parsed.
 * Fail → throw (để httpErrorHandler bắt).
 *
 * @example
 * const handler = middy(async (event) => {
 *   const dto = event.parsed as MyDto;
 *   return useCase.run(dto);
 * }).use(kinesisParserMiddleware());
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Raw Kinesis event shape. */
interface KinesisEvent {
  Records?: Array<{ kinesis?: { data?: string }; eventID?: string }>;
  parsed?: unknown;
}

/**
 * Parse Kinesis data (base64 → UTF-8 → JSON).
 * Export để handler có thể dùng trực tiếp nếu không dùng middleware.
 */
export function parseKinesisData<T = unknown>(data: string): T {
  const decoded = Buffer.from(data, "base64").toString("utf-8");
  return JSON.parse(decoded) as T;
}

/**
 * Middleware: parse Kinesis record và gán vào event.parsed.
 * Mặc định lấy Records[0]; set recordIndex để chọn record khác.
 */
export function kinesisParserMiddleware(options?: { recordIndex?: number }) {
  const idx = options?.recordIndex ?? 0;

  return {
    before: async (request: { event: KinesisEvent; earlyResponse?: unknown }) => {
      const { event } = request;
      const data = event.Records?.[idx]?.kinesis?.data;

      if (!data) {
        request.earlyResponse = {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            code: "VALIDATION",
            message: `Missing Kinesis data at Records[${idx}]`,
          }),
        };
        return;
      }

      try {
        event.parsed = parseKinesisData(data);
      } catch {
        request.earlyResponse = {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            code: "VALIDATION",
            message: "Invalid Kinesis data (not valid base64/JSON)",
          }),
        };
      }
    },
  };
}
