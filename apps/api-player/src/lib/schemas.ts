/**
 * API Player – Shared Zod Schemas
 *
 * Chỉ chứa schemas dùng chung cho nhiều handlers.
 * Schemas đặc thù cho 1 handler → inline trong handler file đó.
 */

import { z } from "zod";

import { Pagination, OBJECT_ID_REGEX } from "@megawin/shared/constants";

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

// ─── Composed shared schemas ───

export const cursorQuerySchema = z.object({
  size: sizeSchema,
  cursor: objectIdSchema.optional(),
});

export const lineIndexCursorSchema = z
  .string()
  .transform((v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  })
  .optional();

export const lineCursorQuerySchema = z.object({
  size: sizeSchema,
  cursor: lineIndexCursorSchema,
});
