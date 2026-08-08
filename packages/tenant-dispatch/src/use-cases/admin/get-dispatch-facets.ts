import { NextApiUseCase } from "@megawin/next/server";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { toVNStartOfDay, toVNEndOfDay } from "@megawin/shared/utils/date";

import { DispatchOrderRepository } from "../../infras/repos/dispatch-order-repo";
import type { DispatchFacets } from "../../infras/repos/types";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;

export interface GetDispatchFacetsInput {
  from?: string;
  to?: string;
}

export type GetDispatchFacetsOutput = DispatchFacets;

/**
 * BO use case — distinct tenantIds + gameIds trong range.
 *
 * Dùng cho filter Combobox ở FE: Tenant (search-as-you-type) + Game (fixed list).
 * Sort theo count DESC nên tenant/game active nhất lên đầu.
 */
export class GetDispatchFacetsUseCase extends NextApiUseCase<GetDispatchFacetsInput, GetDispatchFacetsOutput> {
  private readonly repo = new DispatchOrderRepository();

  protected async execute(input: GetDispatchFacetsInput): Promise<GetDispatchFacetsOutput> {
    const from = input.from ? this.parseBoundary(input.from, "start") : undefined;
    const to = input.to ? this.parseBoundary(input.to, "end") : undefined;
    if (from && to) this.validateRange(from, to);

    return await this.repo.aggregateFacets({ from, to });
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
