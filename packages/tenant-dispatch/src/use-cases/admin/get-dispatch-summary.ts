import { NextApiUseCase } from "@megawin/next/server";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { toVNStartOfDay, toVNEndOfDay } from "@megawin/shared/utils/date";

import { DispatchOrderRepository } from "../../infras/repos/dispatch-order-repo";
import type { DispatchSummary } from "../../infras/repos/types";

/** Date-only format `YYYY-MM-DD`. */
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Window tối đa cho summary — khớp với `list` để hành vi nhất quán. */
const MAX_RANGE_DAYS = 31;

export interface GetDispatchSummaryInput {
  tenantId?: string;
  gameId?: string;
  batchKey?: string;
  from?: string;
  to?: string;
  stuckMinRetry?: number;
}

export type GetDispatchSummaryOutput = DispatchSummary;

/**
 * BO use case — KPI summary cho 1 query range.
 *
 * Trả về counts theo status + retrying/stuck buckets + total/dispatched amount.
 * FE dùng cho KPI strip phía trên bảng. KHÔNG ảnh hưởng bởi list-level
 * `status`/`retryMode` filter — luôn phản ánh toàn range.
 */
export class GetDispatchSummaryUseCase extends NextApiUseCase<
  GetDispatchSummaryInput,
  GetDispatchSummaryOutput
> {
  private readonly repo = new DispatchOrderRepository();

  protected async execute(input: GetDispatchSummaryInput): Promise<GetDispatchSummaryOutput> {
    const from = input.from ? this.parseBoundary(input.from, "start") : undefined;
    const to = input.to ? this.parseBoundary(input.to, "end") : undefined;
    if (from && to) {
      this.validateRange(from, to);
    }

    return await this.repo.aggregateSummary({
      tenantId: input.tenantId,
      gameId: input.gameId,
      batchKey: input.batchKey,
      from,
      to,
      stuckMinRetry: input.stuckMinRetry,
    });
  }

  private parseBoundary(raw: string, kind: "start" | "end"): Date {
    if (DATE_ONLY_REGEX.test(raw)) {
      return kind === "start" ? toVNStartOfDay(raw) : toVNEndOfDay(raw);
    }
    return new Date(raw);
  }

  private validateRange(from: Date, to: Date): void {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new AppException(APP_ERROR_CODES.VALIDATION, "Ngày không hợp lệ");
    }
    if (from > to) {
      throw new AppException(APP_ERROR_CODES.VALIDATION, "`from` phải ≤ `to`");
    }
    const msPerDay = 86_400_000;
    const rangeDays = Math.floor((to.getTime() - from.getTime()) / msPerDay) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new AppException(APP_ERROR_CODES.VALIDATION, `Phạm vi tối đa ${MAX_RANGE_DAYS} ngày`);
    }
  }
}
