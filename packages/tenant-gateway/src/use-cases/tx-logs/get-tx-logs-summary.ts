/**
 * BO use case — aggregate KPI cho trang "Nhật ký giao dịch".
 *
 * Trả về đếm tổng số transaction + phân loại success/failed + số lỗi thuộc
 * nhóm "uncertainty" (WAL còn giữ, cần reconcile). Dùng cho KPI strip phía
 * trên bảng list.
 *
 * Dùng chung rule validate range như `ListTxLogsUseCase` — 1-31 ngày, trong
 * 90 ngày retention.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { toVNStartOfDay, toVNEndOfDay } from "@megawin/shared/utils/date";

import { TxLogRepository } from "../../infras/repos";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;
const MAX_LOOKBACK_DAYS = 90;

export interface GetTxLogsSummaryInput {
  /**
   * Ngày bắt đầu (inclusive). Chấp nhận:
   * - Date-only `YYYY-MM-DD` — convert sang 00:00:00 giờ VN.
   * - ISO 8601 full — parse trực tiếp.
   */
  from: string;
  /**
   * Ngày kết thúc (inclusive). Chấp nhận:
   * - Date-only `YYYY-MM-DD` — convert sang 23:59:59.999 giờ VN.
   * - ISO 8601 full — parse trực tiếp.
   */
  to: string;
}

export interface GetTxLogsSummaryOutput {
  /** Tổng số transaction trong range. */
  total: number;
  /** Số transaction `status = success`. */
  successCount: number;
  /** Số transaction `status = failed`. */
  failedCount: number;
  /**
   * Số transaction lỗi thuộc nhóm "uncertainty":
   * TIMEOUT / NETWORK_ERROR / HTTP 5xx / batch outer reject.
   * Đây là các case WAL vẫn giữ — cần scheduler recovery.
   */
  uncertainCount: number;
  /**
   * Tỷ lệ thành công dưới dạng float `0..1` — FE format `formatPercent`.
   * Khi `total = 0` → trả `null` (UI hiển thị `—`).
   */
  successRate: number | null;
}

export class GetTxLogsSummaryUseCase extends NextApiUseCase<
  GetTxLogsSummaryInput,
  GetTxLogsSummaryOutput
> {
  private readonly repo = new TxLogRepository();

  protected async execute(input: GetTxLogsSummaryInput): Promise<GetTxLogsSummaryOutput> {
    const from = this.parseBoundary(input.from, "start");
    const to = this.parseBoundary(input.to, "end");
    this.validateRange(from, to);

    const result = await this.repo.aggregateSummary({ from, to });

    const successRate = result.total > 0 ? result.successCount / result.total : null;

    return {
      total: result.total,
      successCount: result.successCount,
      failedCount: result.failedCount,
      uncertainCount: result.uncertainCount,
      successRate,
    };
  }

  /**
   * Parse boundary ngày — giống `ListTxLogsUseCase.parseBoundary`.
   * Date-only → VN start/end of day; ISO full → parse trực tiếp.
   */
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
    const maxLookbackMs = MAX_LOOKBACK_DAYS * msPerDay;
    if (Date.now() - from.getTime() > maxLookbackMs) {
      throw new AppException(
        APP_ERROR_CODES.VALIDATION,
        `Chỉ tra cứu trong ${MAX_LOOKBACK_DAYS} ngày gần nhất`,
      );
    }
  }
}
