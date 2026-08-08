/**
 * Use Case: Publish Player Daily — Bingo 18
 *
 * Wrapper per-game của SystemPublishPlayerDailyUseCase (game-core).
 * Tự khởi tạo PlayerDailyEntryRepository làm PlayerDailyPublisher
 * → handler không cần khởi tạo repo trực tiếp.
 *
 * Aggregate ticket_entries WHERE { financialDate, status ∈ [settled, void] }
 * → group by { tenantId, accountId } → bulk upsert player_settle_game_daily.
 *
 * CRASH-SAFE: delete cũ + re-aggregate + upsert mới → idempotent.
 * IDEMPOTENT: chạy lại nhiều lần cho cùng kết quả.
 */

import { GameProduct } from "@megawin/game-core/entities";
import {
  SystemPublishPlayerDailyUseCase as CorePublishPlayerDailyUseCase,
  type PublishPlayerDailyResult,
} from "@megawin/game-core-application/use-cases";
import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PlayerDailyEntryRepository } from "../../infras/repos";

/** Input tối thiểu — chỉ cần financialDate từ SettleContext/VoidContext. */
export interface PublishPlayerDailyInput {
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
}

/**
 * Publish player settle game daily reports cho Bingo 18.
 *
 * Bọc CorePublishPlayerDailyUseCase, tự inject PlayerDailyEntryRepository.
 * Handler chỉ cần gọi use case, không khởi tạo repo trực tiếp.
 */
export class PublishPlayerDailyUseCase extends InternalUseCase<PublishPlayerDailyInput, PublishPlayerDailyResult> {
  private readonly playerDailyEntryRepo = new PlayerDailyEntryRepository();
  private readonly coreUseCase = new CorePublishPlayerDailyUseCase();

  protected async execute(input: PublishPlayerDailyInput): Promise<PublishPlayerDailyResult> {
    return this.coreUseCase.run({
      gameProduct: GameProduct.Bingo18,
      financialDate: input.financialDate,
      playerPublisher: this.playerDailyEntryRepo,
    });
  }
}
