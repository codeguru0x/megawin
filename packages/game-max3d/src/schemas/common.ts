/**
 * Max 3D – Zod Schemas
 *
 * Bộ ba số: "000"-"999" (3 chữ số zero-padded).
 * DrawId: "YYYY-MM-DD.NNN"
 */

import { z } from "zod";

/**
 * Trần rộng (sanity ceiling) cho số kỳ tối đa trong 1 lần tạo — dùng chung giữa Zod schema
 * route (`createDrawSchema.draws`, `previewDrawsSchema.count`) và input UI
 * (`create-draw-action.tsx`) để tránh lệch giá trị giữa 2 nơi.
 *
 * Max 3D quay theo lịch T2/T4/T6 (3 kỳ/tuần) nên trần đủ cho nhiều tuần/lần tạo. KHÔNG
 * phải giới hạn nghiệp vụ thật — giới hạn thật do use-case tính lại theo GlobalConfig tại
 * thời điểm tạo. Hằng số này chỉ chặn input vô lý (batch quá khổ).
 */
export const MAX3D_CREATE_DRAW_BATCH_MAX = 12;

export const max3dTripletSchema = z.string().regex(/^\d{3}$/, "Bộ ba số phải gồm 3 chữ số (000-999)");

export const max3dDrawIdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");
