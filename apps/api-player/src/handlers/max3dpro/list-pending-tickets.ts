/**
 * Lambda handler: GET /games/max3dpro/tickets/pending
 * Danh sách vé Max 3D Pro đang chờ xử lý.
 */

import { withPlayerAuth } from "@megawin/auth";
import { ListPendingTicketsPlayerUseCase } from "@megawin/game-max3dpro-application/use-cases/player";
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
