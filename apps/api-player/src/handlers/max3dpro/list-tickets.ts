/**
 * Lambda handler: GET /games/max3dpro/tickets
 * Lịch sử vé Max 3D Pro — tất cả trạng thái (chờ xử lý, đã kết sổ, đã hoàn tiền, đã huỷ).
 */

import { z } from "zod";
import { withPlayerAuth } from "@megawin/auth";
import { ListTicketsPlayerUseCase } from "@megawin/game-max3dpro-application/use-cases/player";
import { ISO_DATE_REGEX } from "@megawin/shared/constants";
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
