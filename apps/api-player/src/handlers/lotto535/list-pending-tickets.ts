/**
 * Lambda handler: GET /player/lotto535/tickets/pending
 * Danh sách vé Lotto 5/35 đang chờ xử lý.
 */

import { withPlayerAuth } from "@megawin/auth";
import { ListPendingTicketsPlayerUseCase } from "@megawin/game-lotto535-application/use-cases/player";
import { cursorQuerySchema } from "#lib/schemas";

const useCase = new ListPendingTicketsPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId } = event.user;
    const { size, cursor } = event.schema.query;

    return useCase.run({ tenantId, accountId, size, cursor });
  },
  { schemas: { query: cursorQuerySchema } }
);
