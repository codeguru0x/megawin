import { NextApiUseCase } from "@megawin/next/server";
import { PlayerOutstandingRepository } from "../../infras/repos/player-outstanding-repo";
import type { GetPlayerOutstandingInput, GetPlayerOutstandingOutput } from "./types";

/**
 * Lấy danh sách entries đang chờ (outstanding) của 1 player.
 *
 * On-demand query song song 7 game collections — KHÔNG pre-compute.
 * Mỗi lần gọi = 7 MongoDB queries song song (Promise.all).
 * staleTime client nên đặt thấp (0–30s) vì dữ liệu thay đổi liên tục.
 *
 * Filter: { accountId, status: "scheduled" }.
 * Index cần: { accountId: 1, status: 1 } trên mỗi {game}_ticket_entries.
 */
export class GetPlayerOutstandingUseCase extends NextApiUseCase<GetPlayerOutstandingInput, GetPlayerOutstandingOutput> {
  private readonly repo = new PlayerOutstandingRepository();

  protected async execute(input: GetPlayerOutstandingInput): Promise<GetPlayerOutstandingOutput> {
    const data = await this.repo.getPlayerOutstanding(input.accountId);
    return { data };
  }
}
