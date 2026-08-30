import { DRAW_STATUS_VALUES } from "@megawin/game-core/entities";
import { POWER655_MAIN_COUNT } from "@megawin/game-power655/entities";
import { POWER655_CREATE_DRAW_BATCH_MAX, power655MainNumberSchema } from "@megawin/game-power655/schemas";
import { z } from "zod";

/**
 * Mảng số chính Power 6/55: đúng POWER655_MAIN_COUNT phần tử, mỗi phần tử là
 * số chính hợp lệ. Phần validate lõi dùng chung cho mọi schema kết quả.
 */
const winningMainArraySchema = z
  .array(power655MainNumberSchema)
  .length(POWER655_MAIN_COUNT, `Phải có đúng ${POWER655_MAIN_COUNT} số chính.`);

/**
 * Số bonus không được trùng bất kỳ số chính nào — bonus quay từ các quả còn
 * lại sau khi đã rút số chính, nên không thể trùng. Dùng chung cho mọi schema
 * kết quả Power 6/55.
 *
 * @param mainNumbers - Mảng số chính.
 * @param bonus - Số bonus cần kiểm tra.
 */
function isBonusDistinctFromMain(mainNumbers: string[], bonus: string): boolean {
  return !mainNumbers.includes(bonus);
}

/**
 * Các số chính phải đôi một khác nhau. Dùng chung cho mọi schema kết quả
 * Power 6/55.
 *
 * @param mainNumbers - Mảng số chính cần kiểm tra.
 */
function areMainNumbersDistinct(mainNumbers: string[]): boolean {
  return new Set(mainNumbers).size === mainNumbers.length;
}

/**
 * Schema body cho `POST /draws/[drawId]/publish-result` — công bố kết quả kỳ
 * quay. Dùng tên field domain: `winningMain` + `bonusNumber`, kèm `vietlottRef`
 * tham chiếu nguồn Vietlott (optional).
 */
export const publishResultSchema = z
  .object({
    winningMain: winningMainArraySchema,
    bonusNumber: power655MainNumberSchema,
    vietlottRef: z
      .object({
        drawPeriod: z.string(),
        drawDate: z.string(),
      })
      .optional(),
  })
  .refine((data) => isBonusDistinctFromMain(data.winningMain, data.bonusNumber), {
    message: "Số bonus không được trùng với số chính.",
    path: ["bonusNumber"],
  })
  .refine((data) => areMainNumbersDistinct(data.winningMain), {
    message: "Các số chính không được trùng nhau.",
    path: ["winningMain"],
  });

/**
 * Schema body cho `POST /draws/[drawId]/resettle-preflight` — phân tích tác
 * động trước khi resettle. Validate lõi y hệt `publishResultSchema` nhưng dùng
 * tên field `proposed*` để phản ánh "kết quả đề xuất", chưa publish chính thức.
 */
export const resettlePreflightSchema = z
  .object({
    proposedWinningMain: winningMainArraySchema,
    proposedBonusNumber: power655MainNumberSchema,
  })
  .refine((data) => isBonusDistinctFromMain(data.proposedWinningMain, data.proposedBonusNumber), {
    message: "Số bonus không được trùng với số chính.",
    path: ["proposedBonusNumber"],
  })
  .refine((data) => areMainNumbersDistinct(data.proposedWinningMain), {
    message: "Các số chính không được trùng nhau.",
    path: ["proposedWinningMain"],
  });

/**
 * Schema body cho `POST /draws/[drawId]/resettle` — khởi động phiên kết sổ lại.
 *
 * `dbaConfirmed`: staff xác nhận đã thông báo Quản trị hệ thống chuẩn bị chốt
 * jackpot cycle. BẮT BUỘC `true` cho TYPE_B1 + TYPE_B2 (worker auto payout,
 * cycle do Quản trị hệ thống chốt tay). TYPE_A bỏ qua. Mặc định `false`.
 */
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
  /** Ngày quay, format YYYY-MM-DD. */
  drawDate: z.iso.date("drawDate phải là YYYY-MM-DD."),
  /**
   * Giờ quay, ISO 8601 có timezone offset (ví dụ: "2026-04-01T18:00:00+07:00").
   * closeAt tính tự động phía server.
   */
  drawTime: z.iso.datetime({ offset: true }),
  /** Mở bán ngay sau khi tạo. */
  openNow: z.boolean().default(false),
});

export const createDrawSchema = z.object({
  draws: z
    .array(createDrawSlotSchema)
    .min(1, "Cần ít nhất 1 kỳ.")
    .max(POWER655_CREATE_DRAW_BATCH_MAX, `Tối đa ${POWER655_CREATE_DRAW_BATCH_MAX} kỳ mỗi lần tạo.`)
    .superRefine((draws, ctx) => {
      const seen = new Set<string>();
      draws.forEach((slot, i) => {
        // Power 6/55 chỉ 1 kỳ/ngày (drawNo luôn = 1, server tự gán) → key trùng chỉ cần drawDate.
        if (seen.has(slot.drawDate)) {
          ctx.addIssue({
            code: "custom",
            path: [i, "drawDate"],
            message: `Ngày ${slot.drawDate} bị trùng trong danh sách.`,
          });
        }
        seen.add(slot.drawDate);
      });
    }),
});

export const previewDrawsSchema = z.object({
  count: z.coerce.number().int().min(1).max(POWER655_CREATE_DRAW_BATCH_MAX).default(2),
});

export const listDrawsQuerySchema = z.object({
  status: z.enum(DRAW_STATUS_VALUES as [string, ...string[]]).optional(),
  fromDate: z.iso.date("fromDate phải là YYYY-MM-DD.").optional(),
  toDate: z.iso.date("toDate phải là YYYY-MM-DD.").optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});
