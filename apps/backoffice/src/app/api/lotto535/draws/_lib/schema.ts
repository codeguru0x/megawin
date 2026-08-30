import { DRAW_STATUS_VALUES } from "@megawin/game-core/entities";
import { LOTTO535_MAIN_COUNT } from "@megawin/game-lotto535/entities";
import {
  LOTTO535_CREATE_DRAW_BATCH_MAX,
  lotto535MainNumberSchema,
  lotto535SpecialNumberSchema,
} from "@megawin/game-lotto535/schemas";
import { z } from "zod";

/** Mảng số chính Lotto 5/35 — đúng LOTTO535_MAIN_COUNT phần tử. */
const winningMainArraySchema = z
  .array(lotto535MainNumberSchema)
  .length(LOTTO535_MAIN_COUNT, `Phải có đúng ${LOTTO535_MAIN_COUNT} số chính.`);

function areMainNumbersDistinct(mainNumbers: string[]): boolean {
  return new Set(mainNumbers).size === mainNumbers.length;
}

/**
 * Schema body cho `POST /draws/[drawId]/resettle-preflight` — phân tích tác
 * động trước khi resettle. Dùng tên field `proposed*` (kết quả đề xuất).
 */
export const resettlePreflightSchema = z
  .object({
    proposedWinningMain: winningMainArraySchema,
    proposedWinningSpecial: lotto535SpecialNumberSchema,
  })
  .refine((data) => areMainNumbersDistinct(data.proposedWinningMain), {
    message: "Các số chính không được trùng nhau.",
    path: ["proposedWinningMain"],
  });

/** Schema body cho `POST /draws/[drawId]/resettle` — khởi chạy Resettle SFN. */
export const triggerResettleSchema = z.object({
  dbaConfirmed: z.boolean().default(false),
});

/**
 * Schema body cho `POST /draws/[drawId]/resettle-reopen` — mở cổng resettle cho
 * kỳ T+n trong cascade TYPE_B2 khi KẾT QUẢ SỐ KHÔNG ĐỔI.
 *
 * `dbaConfirmed`: BẮT BUỘC `true`. Reopen chỉ phục vụ cascade cần Quản trị hệ
 * thống can thiệp cycle thủ công — không cho phép tự động. Mặc định `false`
 * (use-case sẽ reject `RESETTLE_REQUIRES_DBA`).
 */
export const reopenForCascadeSchema = z.object({
  dbaConfirmed: z.boolean().default(false),
});

const createDrawSlotSchema = z.object({
  /** Ngày quay, format YYYY-MM-DD (theo giờ VN). */
  drawDate: z.iso.date("drawDate phải là YYYY-MM-DD."),
  /**
   * Giờ quay, ISO 8601 có timezone offset (ví dụ: "2026-03-20T21:00:00+07:00").
   * Server tự suy ra drawNo (1 = sáng 13h, 2 = tối 21h) bằng cách khớp giờ với
   * `play.drawTimes` — không nhận drawNo từ client (client có thể sửa, gây lệch drawId).
   * closeAt tính tự động phía server: drawTime − play.salesCloseBeforeMinutes.
   */
  drawTime: z.iso.datetime({ offset: true }),
  /** Mở bán ngay sau khi tạo. */
  openNow: z.boolean().default(false),
});

export const createDrawSchema = z.object({
  draws: z
    .array(createDrawSlotSchema)
    .min(1, "Cần ít nhất 1 kỳ.")
    .max(LOTTO535_CREATE_DRAW_BATCH_MAX, `Tối đa ${LOTTO535_CREATE_DRAW_BATCH_MAX} kỳ mỗi lần tạo.`)
    .superRefine((draws, ctx) => {
      // Kiểm tra trùng (drawDate + drawTime) trong chính input — drawNo suy ra từ
      // drawTime nên 2 slot cùng ngày + cùng giờ chắc chắn sinh cùng drawId.
      const seen = new Set<string>();
      draws.forEach((slot, i) => {
        const key = `${slot.drawDate}-${slot.drawTime}`;
        if (seen.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: [i, "drawTime"],
            message: `Kỳ ${slot.drawDate} giờ ${slot.drawTime} bị trùng trong danh sách.`,
          });
        }
        seen.add(key);
      });
    }),
});

export const previewDrawsSchema = z.object({
  count: z.coerce.number().int().min(1).max(LOTTO535_CREATE_DRAW_BATCH_MAX).default(2),
});

export const listDrawsQuerySchema = z.object({
  status: z.enum(DRAW_STATUS_VALUES as [string, ...string[]]).optional(),
  fromDate: z.iso.date("fromDate phải là YYYY-MM-DD.").optional(),
  toDate: z.iso.date("toDate phải là YYYY-MM-DD.").optional(),
  cursor: z.string().optional(),
  size: z.coerce.number().int().min(1).max(100).default(20),
});
