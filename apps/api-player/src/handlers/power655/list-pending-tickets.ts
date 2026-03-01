/**
 * Lambda handler: GET /player/power655/tickets/pending
 *
 * Danh sách vé Power 6/55 đang chờ xử lý.
 * Cursor-based pagination.
 */

import { withPlayerAuth } from "@megawin/auth";
import { ListPendingTicketsPlayerUseCase } from "@megawin/game-power655-application/use-cases/player";
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
