/**
 * Lambda handler: GET /games/lotto535/tickets/pending
 * Danh sách vé Lotto 5/35 đang chờ xử lý.
 */

import { withPlayerAuth } from "@megawin/auth";
import { ListPendingTicketsPlayerUseCase } from "@megawin/game-lotto535-application/use-cases/player";
import { z } from "zod";

import { objectIdSchema, sizeSchema } from "#lib/schemas";

const querySchema = z.object({
  size: sizeSchema,
  cursor: objectIdSchema.optional(),
});

const useCase = new ListPendingTicketsPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId } = event.user;
    const { size, cursor } = event.schema.query;

    return useCase.run({ tenantId, accountId, size, cursor });
  },
  { schemas: { query: querySchema } },
);
