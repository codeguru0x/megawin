import { NextApiUseCase } from "@megawin/next/server";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { toVNStartOfDay, toVNEndOfDay } from "@megawin/shared/utils/date";

import { DispatchOrderRepository } from "../../infras/repos/dispatch-order-repo";
import type { TenantDispatchOrderEntity } from "../../entities/dispatch-order";
import type { DispatchOrderStatus, DispatchSourceKind } from "../../entities/enums";
import type { DispatchRetryMode } from "../../infras/repos/types";

/** Date-only format `YYYY-MM-DD`. */
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Giới hạn range để tránh full-scan khi filter không đủ hẹp. */
const MAX_RANGE_DAYS = 31;

/** Default limit một page — cân giữa payload size và số lần fetch. */
const DEFAULT_LIMIT = 50;
/** Max limit per page. */
const MAX_LIMIT = 100;

export interface ListDispatchOrdersInput {
  /** Identity lookup — khi có, dimension filters bị bypass. */
  tx?: string;
  batchKey?: string;
  accountId?: string;
  username?: string;

  // Dimension filters
  tenantId?: string;
  gameId?: string;
  status?: DispatchOrderStatus;
  sourceKind?: DispatchSourceKind;
  retryMode?: DispatchRetryMode;
  stuckMinRetry?: number;
  /**
   * Ngày bắt đầu `YYYY-MM-DD` (VN timezone, inclusive 00:00:00).
   * Hoặc ISO 8601 full — parse bình thường.
   */
  from?: string;
  /**
   * Ngày kết thúc `YYYY-MM-DD` (VN timezone, inclusive 23:59:59.999).
   * Hoặc ISO 8601 full.
   */
  to?: string;
  /** Cursor string `"{iso}|{id}"` — từ `nextCursor` của page trước. */
  cursor?: string;
  limit?: number;
}

export interface ListDispatchOrdersOutput {
  data: TenantDispatchOrderEntity[];
  nextCursor: { createdAt: string; id: string } | null;
}

/**
 * BO use case — list dispatch orders với filter tổng hợp + cursor pagination.
 *
 * Dùng cho trang chính "Nhật ký Dispatch". Hỗ trợ filter đa chiều
 * (tenant/game/status/sourceKind/retry/batch) + date range + cursor FIFO.
 *
 * KHÔNG gọi MongoDB trực tiếp — mọi query xuyên qua `DispatchOrderRepository`.
 */
export class ListDispatchOrdersUseCase extends NextApiUseCase<ListDispatchOrdersInput, ListDispatchOrdersOutput> {
  private readonly repo = new DispatchOrderRepository();

  protected async execute(input: ListDispatchOrdersInput): Promise<ListDispatchOrdersOutput> {
    const limit = this.normalizeLimit(input.limit);
    const cursor = this.parseCursor(input.cursor);

    // Identity lookup mode — chỉ đưa 1 identity field xuống repo. Date range
    // và dimension filters bị bypass để tránh match rỗng (staff có id cụ
    // thể → muốn thấy order bất kể thời gian / status).
    const isIdentityMode = !!(input.tx || input.batchKey || input.accountId || input.username);

    if (isIdentityMode) {
      const result = await this.repo.listWithCursor({
        tx: input.tx,
        batchKey: input.batchKey,
        accountId: input.accountId,
        username: input.username,
        cursor,
        limit,
      });
      return result;
    }

    const from = input.from ? this.parseBoundary(input.from, "start") : undefined;
    const to = input.to ? this.parseBoundary(input.to, "end") : undefined;
    if (from && to) {
      this.validateRange(from, to);
    }

    const result = await this.repo.listWithCursor({
      tenantId: input.tenantId,
      gameId: input.gameId,
      status: input.status,
      sourceKind: input.sourceKind,
      retryMode: input.retryMode,
      stuckMinRetry: input.stuckMinRetry,
      from,
      to,
      cursor,
      limit,
    });

    return result;
  }

  private normalizeLimit(raw: number | undefined): number {
    const size = raw ?? DEFAULT_LIMIT;
    if (!Number.isFinite(size) || size <= 0) return DEFAULT_LIMIT;
    return Math.min(size, MAX_LIMIT);
  }

  /** Parse cursor `"{iso}|{hexId}"` → object hoặc null (degrade on error). */
  private parseCursor(raw: string | undefined): { createdAt: Date; id: string } | null {
    if (!raw) return null;
    const [iso, id] = raw.split("|");
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  }

  /** Convert `YYYY-MM-DD` → VN boundary Date; ISO full → parse trực tiếp. */
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
    // +1ms bù cho `toVNEndOfDay` (23:59:59.999) → same-day = 1 ngày.
    const rangeDays = Math.floor((to.getTime() - from.getTime()) / msPerDay) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new AppException(APP_ERROR_CODES.VALIDATION, `Phạm vi tối đa ${MAX_RANGE_DAYS} ngày`);
    }
  }
}
