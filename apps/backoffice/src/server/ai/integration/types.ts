/**
 * `getIntegrationHealth` — types cho aggregate 3 nguồn (p1-03 §2.8).
 *
 * KHÔNG gắn nhãn `ConfigItem` — dữ liệu vận hành hạ tầng (dispatch/stuck-orders/worker), field tự
 * giải thích qua tên + JSDoc entity gốc, cùng nguyên tắc RAW với `draws/`/`operations/`.
 */

export interface GetIntegrationHealthInput {
  from?: string;
  to?: string;
  tenantId?: string;
}

/** 1 block nguồn — `unavailable: true` khi nguồn lỗi/timeout, KHÔNG giết cả tool (p1-03 §2.8). */
export interface IntegrationHealthBlock<T> {
  unavailable: boolean;
  /** RAW output của use-case nguồn — `undefined` khi `unavailable`. */
  data?: T;
}

export interface GetIntegrationHealthOutput {
  meta: {
    from?: string;
    to?: string;
    tenantId?: string;
    /** Thời điểm tool đọc (ISO). */
    fetchedAt: string;
  };
  /** RAW `GetDispatchSummaryOutput` từ `@megawin/tenant-dispatch/use-cases/admin`. */
  dispatchSummary: IntegrationHealthBlock<unknown>;
  /** RAW `ListStuckOrdersOutput` (limit 10) từ `@megawin/tenant-dispatch/use-cases/admin`. */
  stuckOrders: IntegrationHealthBlock<unknown>;
  /** RAW `ListWorkersHealthOutput` từ `@megawin/worker-core/use-cases/admin`. */
  workersHealth: IntegrationHealthBlock<unknown>;
}
