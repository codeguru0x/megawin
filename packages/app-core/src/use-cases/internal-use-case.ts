/**
 * InternalUseCase – use case cho logic nghiệp vụ nội bộ.
 *
 * Khác với BaseUseCase (trả AppResult wrapped) và NextApiUseCase (trả NextResponse),
 * InternalUseCase trả trực tiếp output O và throw AppException khi lỗi.
 *
 * Thiết kế này phù hợp khi use case được gọi từ use case khác:
 *   - Caller không cần unwrap AppResult
 *   - Error propagate tự nhiên lên caller's error handler
 *
 * run() signature tự động suy ra từ I:
 *   - I = void                → run()           (không arg)
 *   - {} extends I (all-optional fields) → run() hoặc run(input) (optional arg)
 *   - I = SomeType            → run(input)       (bắt buộc arg)
 *
 * @example
 * // Không cần input
 * class GetConfigUseCase extends InternalUseCase<void, Config> {
 *   protected async execute(_input: void): Promise<Config> { ... }
 * }
 * getConfigUseCase.run();
 *
 * // Input optional (tất cả fields có dấu ?)
 * class SyncFeedUseCase extends InternalUseCase<{ batchSize?: number }, Result> {
 *   protected async execute(input: { batchSize?: number }): Promise<Result> { ... }
 * }
 * syncFeedUseCase.run();
 * syncFeedUseCase.run({ batchSize: 100 });
 *
 * // Input bắt buộc
 * class PrepareSettleUseCase extends InternalUseCase<SettleInput, SettleContext> {
 *   protected async execute(input: SettleInput): Promise<SettleContext> { ... }
 * }
 * prepareSettleUseCase.run(input);
 */

import { AppException } from "@megawin/shared/errors";
import { isAppError } from "@megawin/shared/errors";

export abstract class InternalUseCase<I = void, O = void> {
  protected abstract execute(input: I): Promise<O>;

  async run(...args: I extends void ? [] : {} extends I ? [input?: I] : [input: I]): Promise<O> {
    const input = args[0] as I;
    try {
      return await this.execute(input);
    } catch (err) {
      throw this.handleError(err);
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
