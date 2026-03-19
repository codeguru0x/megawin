/**
 * Use Case: Publish Settle Daily — Bingo 18 (Void Flow)
 *
 * Wrapper per-game của PublishSettleDailyUseCase (game-core).
 * Tự khởi tạo SystemSettleGameDailyRepo + SystemSettleTenantDailyRepo
 * → handler không cần khởi tạo repo trực tiếp.
 *
 * Dùng sau BuildVoidReport: draw-level settle reports đã bị xoá
 * → aggregate giảm → system daily tự giảm theo.
 *
 * CRASH-SAFE: re-aggregate toàn bộ → overwrite system reports.
 * IDEMPOTENT: chạy lại nhiều lần cho cùng kết quả.
 */

import { GameProduct } from "@megawin/game-core/entities";
import {
  SystemPublishSettleDailyUseCase,
  type PublishSettleDailyResult,
} from "@megawin/game-core-application/use-cases";
import { InternalUseCase } from "@megawin/app-core/use-cases";
import { SystemSettleGameDailyRepo, SystemSettleTenantDailyRepo } from "../../infras/repos";
import type { VoidContext } from "./types";

/**
 * Publish settle daily reports lên system level cho Bingo 18 (sau void).
 *
 * Bọc CorePublishSettleDailyUseCase, tự inject per-game repos.
 * Nhận VoidContext — chỉ dùng financialDate.
 * Handler không cần khởi tạo hay truyền repo trực tiếp.
 */
export class PublishSettleDailyUseCase extends InternalUseCase<
  VoidContext,
  PublishSettleDailyResult
> {
  private readonly gameDailyRepo = new SystemSettleGameDailyRepo();
  private readonly tenantDailyRepo = new SystemSettleTenantDailyRepo();
  private readonly coreUseCase = new SystemPublishSettleDailyUseCase();

  protected async execute(input: VoidContext): Promise<PublishSettleDailyResult> {
    return this.coreUseCase.run({
      gameProduct: GameProduct.Bingo18,
      financialDate: input.financialDate,
      gameDailyRepo: this.gameDailyRepo,
      tenantDailyRepo: this.tenantDailyRepo,
    });
  }
}
