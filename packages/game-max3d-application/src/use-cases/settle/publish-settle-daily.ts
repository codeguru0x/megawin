/**
 * Use Case: Publish Settle Daily — Max 3D
 *
 * Wrapper per-game của PublishSettleDailyUseCase (game-core).
 * Tự khởi tạo SystemSettleGameDailyRepo + SystemSettleTenantDailyRepo
 * → handler không cần khởi tạo repo trực tiếp.
 *
 * CRASH-SAFE: re-aggregate toàn bộ → overwrite system reports.
 * IDEMPOTENT: chạy lại nhiều lần cho cùng kết quả.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { GameProduct } from "@megawin/game-core/entities";
import {
  SystemPublishSettleDailyUseCase as CorePublishSettleDailyUseCase,
  type PublishSettleDailyResult,
} from "@megawin/game-core-application/use-cases";

import { SystemSettleGameDailyRepo, SystemSettleTenantDailyRepo } from "../../infras/repos";

/** Input tối thiểu — chỉ cần financialDate từ SettleContext. */
export interface PublishSettleDailyInput {
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
}

/**
 * Publish settle daily reports lên system level cho Max 3D.
 *
 * Bọc CorePublishSettleDailyUseCase, tự inject per-game repos.
 * Handler chỉ cần gọi use case, không khởi tạo repo trực tiếp.
 */
export class PublishSettleDailyUseCase extends InternalUseCase<PublishSettleDailyInput, PublishSettleDailyResult> {
  private readonly gameDailyRepo = new SystemSettleGameDailyRepo();
  private readonly tenantDailyRepo = new SystemSettleTenantDailyRepo();
  private readonly coreUseCase = new CorePublishSettleDailyUseCase();

  protected async execute(input: PublishSettleDailyInput): Promise<PublishSettleDailyResult> {
    return this.coreUseCase.run({
      gameProduct: GameProduct.Max3d,
      financialDate: input.financialDate,
      gameDailyRepo: this.gameDailyRepo,
      tenantDailyRepo: this.tenantDailyRepo,
    });
  }
}
