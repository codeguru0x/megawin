/**
 * Middy middleware: parse Step Functions event → event.parsed.
 * Lấy event.payload (hoặc toàn bộ event) → gán vào event.parsed.
 *
 * @example
 * const handler = middy(async (event) => {
 *   const dto = event.parsed as MyDto;
 *   return useCase.run(dto);
 * }).use(stepFunctionParserMiddleware());
 */

/** Raw Step Function event shape. */
interface StepFunctionEvent {
  payload?: unknown;
  parsed?: unknown;
  [key: string]: unknown;
}

/**
 * Middleware: extract payload từ Step Functions event và gán vào event.parsed.
 * Nếu event.payload tồn tại → dùng payload; ngược lại dùng toàn bộ event
 * (loại trừ key "parsed" để tránh circular).
 */
export function stepFunctionParserMiddleware() {
  return {
    before: async (request: { event: StepFunctionEvent }) => {
      const { event } = request;
      event.parsed =
        event.payload !== undefined ? event.payload : { ...event };
    },
  };
}
