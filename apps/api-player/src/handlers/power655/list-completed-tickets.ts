/**
 * Lambda handler: GET /player/power655/tickets/completed
 *
 * Danh sách vé Power 6/55 đã hoàn thành (settled, refunded, void).
 * Hỗ trợ lọc theo khoảng ngày + cursor pagination.
 */

import { z } from "zod";
import { withPlayerAuth } from "@megawin/auth";
import {
  ListCompletedTicketsPlayerUseCase,
  TICKET_SORT_BY_VALUES,
} from "@megawin/game-power655-application/use-cases/player";
import { ISO_DATE_REGEX } from "@megawin/shared/constants/validation";
import { objectIdSchema, sizeSchema } from "#lib/schemas";

const querySchema = z.object({
  size: sizeSchema,
  cursor: objectIdSchema.optional(),
  sortBy: z.enum(TICKET_SORT_BY_VALUES).default("betDate"),
  from: z.string().regex(ISO_DATE_REGEX, "Expected YYYY-MM-DD").optional(),
  to: z.string().regex(ISO_DATE_REGEX, "Expected YYYY-MM-DD").optional(),
});

const useCase = new ListCompletedTicketsPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId } = event.user;
    const { size, cursor, sortBy, from, to } = event.schema.query;

    return useCase.run({ tenantId, accountId, size, cursor, sortBy, from, to });
  },
  { schemas: { query: querySchema } }
);
