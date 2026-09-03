/**
 * ResultFeed – ListConsensusUseCase
 *
 * `07-admin-management-page.plan.md §3.3`. Thin wrapper `ConsensusRepository.findByStateWithCursor`
 * — filter theo `state`/`gameKey` (cả hai optional), cursor-based `(updatedAt, _id)`.
 *
 * Dùng cho trang `review` (state=Conflict) và tra cứu chung (không filter state) — KHÔNG dùng
 * cho `periods` (đó là lookup CHÍNH XÁC 1 kỳ, xem `GetConsensusPeriodUseCase`).
 *
 * `cursor` đã được ROUTE decode từ token opaque (`decodeCursor` — xem `_lib/schema.ts`) —
 * use-case chỉ nhận object `{ updatedAt: Date; id }`, không đụng tới encoding (theo convention
 * `ListAuditLogsUseCase`).
 */

import { encodeCursor } from "@megawin/data/mongo";
import type { ConsensusEntity, ConsensusState, ResultFeedGameKey } from "@megawin/resultfeed/entities";

import type { ConsensusListCursor } from "../../infras/repos/consensus-repo";
import { ConsensusRepository } from "../../infras/repos/consensus-repo";

export interface ListConsensusInput {
  state?: ConsensusState;
  gameKey?: ResultFeedGameKey;
  cursor?: ConsensusListCursor;
  limit: number;
}

export interface ListConsensusOutput {
  data: ConsensusEntity[];
  nextCursor: string | null;
}

export class ListConsensusUseCase {
  private readonly consensusRepo = new ConsensusRepository();

  async run(input: ListConsensusInput): Promise<ListConsensusOutput> {
    const page = await this.consensusRepo.findByStateWithCursor(input.state, input.gameKey, input.cursor, input.limit);
    return { data: page.data, nextCursor: encodeCursor(page.nextCursor) };
  }
}
