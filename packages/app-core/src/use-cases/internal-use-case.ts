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
 * @example
 * class GetConfigUseCase extends InternalUseCase<void, Config> {
 *   protected async execute(): Promise<Config> {
 *     const config = await this.repo.get();
 *     if (!config) throw AppException.internal("Config not found");
 *     return config;
 *   }
 * }
 *
 * // Caller:
 * private readonly getConfig = new GetConfigUseCase();
 * const config = await this.getConfig.run();
 */

import { AppException } from "@megawin/shared/errors";
import { isAppError } from "@megawin/shared/errors";

export abstract class InternalUseCase<I = void, O = void> {
  protected validate(_input: I): void | AppException {
    return undefined;
  }

  protected abstract execute(input: I): Promise<O>;

  async run(...args: I extends void ? [] : [input: I]): Promise<O> {
    const input = args[0] as I;
    const validationError = this.validate(input);
    if (validationError) {
      throw validationError;
    }
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
    return AppException.internal(
      err instanceof Error ? err.message : "Unknown error",
      err
    );
  }
}
