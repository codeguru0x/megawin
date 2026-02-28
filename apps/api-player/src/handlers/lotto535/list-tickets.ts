/**
 * Lambda handler: GET /player/lotto535/tickets
 * Danh sách vé Lotto 5/35 của player.
 */

import { withPlayerAuth } from "@megawin/auth";

import { ListTicketsPlayerUseCase } from "@megawin/game-lotto535-application/use-cases/player";
import { paginationQuerySchema } from "#lib/schemas";

const useCase = new ListTicketsPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId } = event.user;
    const { page, size } = event.schema.query;

    return useCase.run({ tenantId, accountId, page, size });
  },
  { schemas: { query: paginationQuerySchema } }
);
