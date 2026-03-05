/**
 * Lambda handler: GET /games/bingo18/tickets
 * Danh sách tất cả vé Bingo 18 (pending + completed).
 */

import { z } from "zod";
import { withPlayerAuth } from "@megawin/auth";
import { ListTicketsPlayerUseCase } from "@megawin/game-bingo18-application/use-cases/player";
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
  { schemas: { query: querySchema } }
);
