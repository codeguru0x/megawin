/**
 * API Player – Shared Zod Schemas
 *
 * Schemas dùng chung cho nhiều handlers trong api-player.
 * Pagination, ObjectId validation, etc.
 */

import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z
    .string()
    .default("1")
    .transform((v) => Math.max(1, parseInt(v, 10) || 1)),
  size: z
    .string()
    .default("20")
    .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10) || 20))),
});

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid ID format");
