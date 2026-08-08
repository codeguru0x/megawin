/**
 * BO use case — list tx logs with filters (by tx, by date range + status + eventType).
 *
 * Dùng cho trang "Audit Transactions" trong backoffice. Hỗ trợ:
 * - Tìm nhanh theo `tx` (exact match → ignore các filter khác).
 * - Filter theo `from/to` (1-31 ngày, trong phạm vi 90 ngày giữ TTL).
 * - Filter theo `status`, `eventType`, `tenantId`.
 * - Cursor-based pagination (stable khi data insert liên tục).
 */

import { NextApiUseCase } from "@megawin/next/server";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { Pagination } from "@megawin/shared/constants/pagination";
import { toVNStartOfDay, toVNEndOfDay } from "@megawin/shared/utils/date";

import type { TxLogStatus, TxLogEventType } from "../../entities/enums";
import type { TxLogEntity } from "../../entities/tx-log";
import { TxLogRepository, type ListTxLogsResult } from "../../infras/repos";

/** Date-only format `YYYY-MM-DD` — không chứa ký tự `T`. */
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Giới hạn date range để tránh full-table scan. */
const MAX_RANGE_DAYS = 31;
/** Retention window — TTL MongoDB purge sau 90 ngày. */
const MAX_LOOKBACK_DAYS = 90;

export interface ListTxLogsInput {
  /** Exact match — nếu có, các filter khác bị bỏ qua. */
  tx?: string;
  /**
   * Ngày bắt đầu (inclusive). Chấp nhận:
   * - Date-only `YYYY-MM-DD` — tự convert sang 00:00:00 giờ VN.
   * - ISO 8601 full `YYYY-MM-DDTHH:mm:ss…` — parse bình thường.
   */
  from?: string;
  /**
   * Ngày kết thúc (inclusive). Chấp nhận:
   * - Date-only `YYYY-MM-DD` — tự convert sang 23:59:59.999 giờ VN.
   * - ISO 8601 full — parse bình thường.
   */
  to?: string;
  status?: TxLogStatus;
  eventType?: TxLogEventType;
  tenantId?: string;
  limit?: number;
  /** `"{isoCreatedAt}|{id}"` — nextCursor từ trang trước. */
  cursor?: string;
}

export interface ListTxLogsOutput {
  data: TxLogEntity[];
  nextCursor: { createdAt: string; id: string } | null;
}

export class ListTxLogsUseCase extends NextApiUseCase<ListTxLogsInput, ListTxLogsOutput> {
  private readonly repo = new TxLogRepository();

  protected async execute(input: ListTxLogsInput): Promise<ListTxLogsOutput> {
    const limit = this.normalizeLimit(input.limit);
    const cursor = this.parseCursor(input.cursor);

    // Search theo exact tx: bypass date range — tra cứu nhanh 1 record.
    if (input.tx) {
      const result = await this.repo.listLogs({ tx: input.tx }, { limit, cursor });
      return this.toOutput(result);
    }

    // Range search: yêu cầu from + to, validate window.
    if (!input.from || !input.to) {
      throw new AppException(APP_ERROR_CODES.VALIDATION, "Phải cung cấp từ & đến khi không search theo tx");
    }

    const from = this.parseBoundary(input.from, "start");
    const to = this.parseBoundary(input.to, "end");
    this.validateRange(from, to);

    const result = await this.repo.listLogs(
      {
        from,
        to,
        status: input.status,
        eventType: input.eventType,
        tenantId: input.tenantId,
      },
      { limit, cursor },
    );
    return this.toOutput(result);
  }

  private normalizeLimit(raw: number | undefined): number {
    const size = raw ?? Pagination.Default.Size;
    if (!Number.isFinite(size) || size <= 0) return Pagination.Default.Size;
    return Math.min(size, Pagination.Max.Size);
  }

  /**
   * Parse cursor dạng `"{iso}|{id}"` → object hoặc null.
   *
   * Không throw nếu format sai — degrade về null, hệ thống trả trang đầu.
   */
  private parseCursor(raw: string | undefined): { createdAt: Date; id: string } | null {
    if (!raw) return null;
    const [iso, id] = raw.split("|");
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  }

  /**
   * Parse boundary ngày từ FE.
   *
   * FE truyền date-only `YYYY-MM-DD` — convert về đúng múi giờ VN:
   * - `from` → 00:00:00 giờ VN (inclusive lower bound).
   * - `to`   → 23:59:59.999 giờ VN (inclusive upper bound).
   *
   * Nếu nhận ISO full string (có `T`), parse bình thường — tương thích ngược
   * cho caller đã serialize sẵn timestamp chính xác.
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
    // Cộng 1ms bù cho `toVNEndOfDay(to)` kết thúc ở 23:59:59.999 — khi from/to
    // cùng ngày, rangeDays ~0.999 (không phải 0). Floor sau đó để count số ngày
    // bao phủ đúng — VD same-day = 1, 31 ngày liên tiếp = 31.
    const rangeDays = Math.floor((to.getTime() - from.getTime()) / msPerDay) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new AppException(APP_ERROR_CODES.VALIDATION, `Phạm vi tối đa ${MAX_RANGE_DAYS} ngày`);
    }

    const maxLookbackMs = MAX_LOOKBACK_DAYS * msPerDay;
    if (Date.now() - from.getTime() > maxLookbackMs) {
      throw new AppException(APP_ERROR_CODES.VALIDATION, `Chỉ tra cứu trong ${MAX_LOOKBACK_DAYS} ngày gần nhất`);
    }
  }

  private toOutput(result: ListTxLogsResult): ListTxLogsOutput {
    return { data: result.data, nextCursor: result.nextCursor };
  }
}
