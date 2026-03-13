/**
 * Lambda handler: GET /games/keno/tickets
 * Lịch sử vé Keno — tất cả trạng thái (chờ xử lý, đã kết sổ, đã hoàn tiền, đã huỷ).
 */

import { z } from "zod";
import { withPlayerAuth } from "@megawin/auth";
import { ListTicketsPlayerUseCase } from "@megawin/game-keno-application/use-cases/player";
import { ISO_DATE_REGEX } from "@megawin/shared/constants/validation";
import { objectIdSchema, sizeSchema } from "#lib/schemas";

const querySchema = z.object({
  size: sizeSchema,
  cursor: objectIdSchema.optional(),
  from: z.string().regex(ISO_DATE_REGEX, "Expected YYYY-MM-DD").optional(),
  to: z.string().regex(ISO_DATE_REGEX, "Expected YYYY-MM-DD").optional(),
});

const useCase = new ListTicketsPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId } = event.user;
    const { size, cursor, from, to } = event.schema.query;

    return useCase.run({ tenantId, accountId, size, cursor, from, to });
  },
  { schemas: { query: querySchema } },
);
