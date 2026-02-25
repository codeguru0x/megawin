import { z } from "zod";
import { DrawNo } from "@megawin/game-lotto535/entities";

export const createDrawSchema = z.object({
  drawDate: z.iso.date("drawDate phải là ngày hợp lệ format YYYY-MM-DD."),
  drawNo: z.union([z.literal(DrawNo.Morning), z.literal(DrawNo.Evening)], {
    message: "drawNo chỉ chấp nhận 1 (kỳ 13h) hoặc 2 (kỳ 21h).",
  }),
});
