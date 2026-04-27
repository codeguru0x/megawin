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
