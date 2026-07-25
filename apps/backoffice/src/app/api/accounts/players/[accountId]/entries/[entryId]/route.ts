import { GetPlayerEntryDetailUseCase } from "@megawin/game-core-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { playerEntryDetailQuerySchema } from "../../_lib/schema";

const getPlayerEntryDetailUseCase = new GetPlayerEntryDetailUseCase();

/**
 * GET /api/accounts/players/[accountId]/entries/[entryId]?game={gameProduct}
 *
 * Trả full entry doc để hiển thị EntryDetailDialog.
 * Dùng chung cho cả outstanding (scheduled) và financial (settled/voided) entries.
 *
 * Outstanding: không có payout/result/outcome — dialog chỉ hiển thị bộ số đặt cược.
 * Settled: có payout (nếu win), result, outcome — dialog hiển thị đầy đủ.
 * Voided: có voidInfo — dialog hiển thị thông tin hoàn trả.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(playerEntryDetailQuerySchema)
  .handler(async ({ query, params }) => {
    const { entryId } = params as { accountId: string; entryId: string };
    return getPlayerEntryDetailUseCase.run({
      game: query.game,
      entryId,
    });
  });
