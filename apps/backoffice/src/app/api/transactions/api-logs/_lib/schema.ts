import { z } from "zod";
import { TxLogStatus, TxLogEventType } from "@megawin/tenant-gateway/entities";

const statusValues = Object.values(TxLogStatus) as [TxLogStatus, ...TxLogStatus[]];
const eventTypeValues = Object.values(TxLogEventType) as [TxLogEventType, ...TxLogEventType[]];

export const listTxLogsQuerySchema = z.object({
  tx: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  status: z.enum(statusValues).optional(),
  eventType: z.enum(eventTypeValues).optional(),
  tenantId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
});

export const listBatchTxLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
});

export const txLogsSummaryQuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
