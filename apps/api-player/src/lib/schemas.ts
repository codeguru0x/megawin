/**
 * API Player – Shared Zod Schemas
 *
 * Chỉ chứa schemas dùng chung cho nhiều handlers.
 * Schemas đặc thù cho 1 handler → inline trong handler file đó.
 */

import { z } from "zod";

import { Pagination } from "@megawin/shared/constants/pagination";
import { OBJECT_ID_REGEX } from "@megawin/shared/constants/validation";

// ─── Primitives ───

export const objectIdSchema = z
  .string()
  .regex(OBJECT_ID_REGEX, "Invalid ID format");

// ─── Reusable field schemas (compose vào handler-specific schemas) ───

export const sizeSchema = z
  .string()
  .default(String(Pagination.Default.Size))
  .transform((v) =>
    Math.min(
      Pagination.Max.Size,
      Math.max(1, parseInt(v, 10) || Pagination.Default.Size)
    )
  );

export const pageSchema = z
  .string()
  .default(String(Pagination.Default.Page))
  .transform((v) =>
    Math.min(
      Pagination.Max.Page,
      Math.max(1, parseInt(v, 10) || Pagination.Default.Page)
    )
  );

// ─── Composed shared schemas ───

export const paginationQuerySchema = z.object({
  page: pageSchema,
  size: sizeSchema,
});

export const cursorQuerySchema = z.object({
  size: sizeSchema,
  cursor: objectIdSchema.optional(),
});
