/**
 * BO use case — tìm 1 tx log theo `tx` (unique).
 *
 * Dùng cho trang detail: click vào row → show request/response đầy đủ.
 * Trả 404 nếu không tồn tại (đã bị TTL purge hoặc chưa từng log).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";

import type { TxLogEntity } from "../../entities/tx-log";
import { TxLogRepository } from "../../infras/repos";

export interface GetTxLogByTxInput {
  tx: string;
}

export interface GetTxLogByTxOutput {
  data: TxLogEntity;
}

export class GetTxLogByTxUseCase extends UseCase<GetTxLogByTxInput, GetTxLogByTxOutput> {
  private readonly repo = new TxLogRepository();

  protected async execute(input: GetTxLogByTxInput): Promise<GetTxLogByTxOutput> {
    if (!input.tx) {
      throw new AppException(APP_ERROR_CODES.VALIDATION, "Thiếu `tx`");
    }
    const log = await this.repo.findByTx(input.tx);
    if (!log) {
      throw new AppException(APP_ERROR_CODES.NOT_FOUND, `Không tìm thấy transaction log cho tx=${input.tx}`);
    }
    return { data: log };
  }
}
