import { z } from "zod";
import { DispatchOrderStatus, DispatchSourceKind } from "@megawin/tenant-dispatch/entities";

const sourceKindValues = Object.values(DispatchSourceKind) as [
  DispatchSourceKind,
  ...DispatchSourceKind[],
];

const statusValues = Object.values(DispatchOrderStatus) as [
  DispatchOrderStatus,
  ...DispatchOrderStatus[],
];

const retryModeValues = ["fresh", "retrying", "stuck"] as const;

export const batchProgressQuerySchema = z.object({
  batchKey: z.string().min(1, "batchKey không được trống."),
});

export const listOrdersQuerySchema = z.object({
  gameId: z.string().min(1),
  sourceKind: z.enum(sourceKindValues),
  sourceId: z.string().min(1),
  status: z.enum(statusValues).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

export const cancelOrderSchema = z.object({
  tx: z.string().min(1, "tx không được trống."),
});

export const listStuckOrdersQuerySchema = z.object({
  minRetryCount: z.coerce.number().int().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

/**
 * Schema cho `GET /api/tenant-dispatch/list` — BO main view.
 *
 * Tất cả filter optional trừ pagination fallback. Date format chấp nhận
 * `YYYY-MM-DD` (tự convert VN timezone ở use case) hoặ ISO 8601 full.
 *
 * Identity lookup fields (`tx` / `batchKey` / `accountId` / `username`):
 * use case bypass các dimension filter khi có bất kỳ field nào set.
 */
export const listDispatchOrdersQuerySchema = z.object({
  // Identity lookup
  tx: z.string().min(1).optional(),
  batchKey: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  username: z.string().min(1).optional(),

  // Dimension
  tenantId: z.string().min(1).optional(),
  gameId: z.string().min(1).optional(),
  status: z.enum(statusValues).optional(),
  sourceKind: z.enum(sourceKindValues).optional(),
  retryMode: z.enum(retryModeValues).optional(),
  stuckMinRetry: z.coerce.number().int().min(1).optional(),

  // Range + pagination
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** Schema cho `GET /api/tenant-dispatch/summary` — KPI strip. */
export const dispatchSummaryQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  gameId: z.string().min(1).optional(),
  batchKey: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  stuckMinRetry: z.coerce.number().int().min(1).optional(),
});

/** Schema param cho `GET /api/tenant-dispatch/[tx]`. */
export const getDispatchByTxParamsSchema = z.object({
  tx: z.string().min(1),
});

/** Schema cho `GET /api/tenant-dispatch/facets` — distinct dimensions theo range. */
export const dispatchFacetsQuerySchema = z.object({
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
});
