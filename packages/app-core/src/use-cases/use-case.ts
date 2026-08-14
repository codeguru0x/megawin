/**
 * UseCase – canonical base class cho mọi business logic use-case trong monorepo.
 *
 * Chỉ có 2 method, cả 2 đều runtime-agnostic (không phụ thuộc Next.js/Lambda/AI SDK):
 * - `run()`     – trả raw output O, throw AppException khi lỗi. Dùng cho route/handler/
 *                 worker/compose — facade success-envelope đính ở middleware biên
 *                 (Next `ApiRouteBuilder.handler()`, Lambda `buildHandler()`/`withPublicHandler()`),
 *                 KHÔNG đính trên use-case.
 * - `safeRun()` – KHÔNG BAO GIỜ throw, trả AppResult<O>. Dùng cho AI tool `execute` hoặc
 *                 bất kỳ caller muốn Result-style thay vì try/catch.
 *
 * KHÔNG có hook `validate()` — input shape luôn do Zod đảm nhiệm ở biên (route builder /
 * middy validator / tool inputSchema). Business rule phụ thuộc dữ liệu DB thì throw
 * AppException ngay trong `execute`.
 *
 * run() signature tự động suy ra từ I:
 *   - I = void                            → run()           (không arg)
 *   - {} extends I (all-optional fields)  → run() hoặc run(input) (optional arg)
 *   - I = SomeType                        → run(input)       (bắt buộc arg)
 *
 * @example
 * // Không cần input
 * class GetConfigUseCase extends UseCase<void, Config> {
 *   protected async execute(_input: void): Promise<Config> { ... }
 * }
 * await getConfigUseCase.run();
 *
 * // Input optional (tất cả fields có dấu ?)
 * class SyncFeedUseCase extends UseCase<{ batchSize?: number }, Result> {
 *   protected async execute(input: { batchSize?: number }): Promise<Result> { ... }
 * }
 * await syncFeedUseCase.run();
 * await syncFeedUseCase.run({ batchSize: 100 });
 *
 * // Input bắt buộc — route giữ nguyên return useCase.run(input), facade tự bọc envelope.
 * class GetDailyOverviewUseCase extends UseCase<QueryInput, ReportOutput> {
 *   protected async execute(input: QueryInput): Promise<ReportOutput> { ... }
 * }
 * return getDailyOverviewUseCase.run(query);
 *
 * // AI tool call — safeRun() không throw, trả AppResult<O> đúng shape tool cần.
 * execute: (input) => getDailyOverviewUseCase.safeRun(input);
 */

import { AppException, type AppResult, isAppError } from "@megawin/shared/errors";

export abstract class UseCase<I = void, O = void> {
  protected abstract execute(input: I): Promise<O>;

  // biome-ignore lint/complexity/noBannedTypes: {} ở đây là type-level trick chuẩn để check "I có toàn field optional" trong conditional type (nếu {} extends I thì mọi field của I đều optional) — không phải dùng {} làm type giá trị thông thường.
  async run(...args: I extends void ? [] : {} extends I ? [input?: I] : [input: I]): Promise<O> {
    const input = args[0] as I;
    try {
      return await this.execute(input);
    } catch (err) {
      throw this.handleError(err);
    }
  }

  // biome-ignore lint/complexity/noBannedTypes: cùng type-level trick như run() ở trên — kiểm tra I toàn field optional.
  async safeRun(...args: I extends void ? [] : {} extends I ? [input?: I] : [input: I]): Promise<AppResult<O>> {
    const input = args[0] as I;
    try {
      const data = await this.execute(input);
      return { success: true, data };
    } catch (err) {
      const exception = this.handleError(err);
      return { success: false, error: exception.toError() };
    }
  }

  protected handleError(err: unknown): AppException {
    if (err instanceof AppException) {
      return err;
    }
    if (isAppError(err)) {
      const appErr = err as {
        code: string;
        message: string;
        details?: unknown;
      };
      return new AppException(appErr.code, appErr.message, {
        details: appErr.details,
      });
    }
    return AppException.internal(err instanceof Error ? err.message : "Unknown error", err);
  }
}
