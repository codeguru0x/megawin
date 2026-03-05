/**
 * Lambda handler: GET /games/max3d/tickets/pending
 * Danh sách vé Max 3D đang chờ xử lý.
 */

import { z } from "zod";
import { withPlayerAuth } from "@megawin/auth";
import { ListPendingTicketsPlayerUseCase } from "@megawin/game-max3d-application/use-cases/player";
import { ISO_DATE_REGEX } from "@megawin/shared/constants/validation";
import { objectIdSchema, sizeSchema } from "#lib/schemas";

const querySchema = z.object({
  size: sizeSchema,
  cursor: objectIdSchema.optional(),
  from: z.string().regex(ISO_DATE_REGEX, "Expected YYYY-MM-DD").optional(),
  to: z.string().regex(ISO_DATE_REGEX, "Expected YYYY-MM-DD").optional(),
});

const useCase = new ListPendingTicketsPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId } = event.user;
    const { size, cursor, from, to } = event.schema.query;

    return useCase.run({ tenantId, accountId, size, cursor, from, to });
  },
  { schemas: { query: querySchema } }
);
