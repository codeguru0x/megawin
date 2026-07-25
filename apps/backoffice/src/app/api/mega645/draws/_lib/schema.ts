import { DRAW_STATUS_VALUES } from "@megawin/game-core/entities";
import { MEGA645_NUMBER_COUNT } from "@megawin/game-mega645/entities";
import { mega645NumberSchema } from "@megawin/game-mega645/schemas";
import { z } from "zod";

/**
 * Mảng 6 số chính Mega 6/45: đúng `MEGA645_NUMBER_COUNT` phần tử, mỗi phần tử là
 * số hợp lệ ("01"–"45"). Dùng chung cho các schema kết quả/đề xuất.
 */
const winningNumbersArraySchema = z
  .array(mega645NumberSchema)
  .length(MEGA645_NUMBER_COUNT, `Phải có đúng ${MEGA645_NUMBER_COUNT} số chính.`);

/**
 * 6 số chính phải đôi một khác nhau. Mega 6/45 KHÔNG có số đặc biệt/bonus.
 *
 * @param numbers - Mảng số chính cần kiểm tra.
 */
function areNumbersDistinct(numbers: string[]): boolean {
  return new Set(numbers).size === numbers.length;
}

/**
 * Schema body cho `POST /draws/[drawId]/resettle-preflight` — phân tích tác động
 * trước khi resettle. Dùng tên field `proposedWinningNumbers` để phản ánh "kết
 * quả đề xuất", chưa publish chính thức.
 */
export const resettlePreflightSchema = z
  .object({
    proposedWinningNumbers: winningNumbersArraySchema,
  })
  .refine((data) => areNumbersDistinct(data.proposedWinningNumbers), {
    message: "Các số chính không được trùng nhau.",
    path: ["proposedWinningNumbers"],
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
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "drawDate phải là YYYY-MM-DD."),
  /** Số thứ tự kỳ trong năm. */
  drawNo: z.number().int().min(1),
  /**
   * Giờ quay, ISO 8601 có timezone offset (ví dụ: "2026-04-02T18:00:00+07:00").
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
    .max(12, "Tối đa 12 kỳ mỗi lần tạo.")
    .superRefine((draws, ctx) => {
      const seen = new Set<string>();
      draws.forEach((slot, i) => {
        const key = `${slot.drawDate}-${slot.drawNo}`;
        if (seen.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: [i, "drawNo"],
            message: `Kỳ ${slot.drawDate} drawNo=${slot.drawNo} bị trùng trong danh sách.`,
          });
        }
        seen.add(key);
      });
    }),
});

export const previewDrawsSchema = z.object({
  count: z.coerce.number().int().min(1).max(12).default(2),
});

export const listDrawsQuerySchema = z.object({
  status: z.enum(DRAW_STATUS_VALUES as [string, ...string[]]).optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fromDate phải là YYYY-MM-DD.")
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "toDate phải là YYYY-MM-DD.")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});
