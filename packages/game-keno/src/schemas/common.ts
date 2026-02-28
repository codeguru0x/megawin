/**
 * Keno – Zod Schemas
 *
 * Reusable validation schemas cho game Keno.
 * Dùng chung bởi: API Gateway handler, Next.js web app, agent app…
 *
 * Quy ước:
 * - Số gửi lên API dạng string zero-padded ("01"-"80").
 * - drawId format: "YYYY-MM-DD.NNN"
 * - boards: cách chơi cơ bản (pick 1-10 số)
 * - sideBets: cách chơi bổ sung (Lớn/Nhỏ, Chẵn/Lẻ)
 */

import { z } from "zod";

// ─── Atomic schemas ───

export const kenoNumberSchema = z
  .string()
  .regex(/^(0[1-9]|[1-7][0-9]|80)$/, "Số Keno phải từ '01' đến '80'");

export const kenoDrawIdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");
