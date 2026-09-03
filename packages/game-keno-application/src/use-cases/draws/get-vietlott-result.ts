/**
 * Use Case: Get Vietlott Result (Keno)
 *
 * Tự lấy kết quả Vietlott đã publish (ResultFeed) để điền form nhập/sửa kết quả kỳ Keno —
 * gọi qua interface `VietlottResultClient` (`@megawin/game-core/types`), KHÔNG import bất kỳ
 * `@megawin/resultfeed*` (domain boundary D7). Trả `found: false` khi ResultFeed chưa có kết
 * quả — không phải lỗi, dialog publish tự hiện cảnh báo và staff tự nhập tay.
 *
 * Thiết kế đầy đủ: `.cursor/plans/resultfeed/08-vietlott-result-autofill.plan.md` §6.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { VietlottResultClient } from "@megawin/game-core/types";

import type { GetVietlottResultInput, GetVietlottResultOutput } from "./dto/draw.dto";

export class GetVietlottResultUseCase extends UseCase<GetVietlottResultInput, GetVietlottResultOutput> {
  private readonly resultFeedClient: VietlottResultClient;

  constructor(resultFeedClient: VietlottResultClient) {
    super();
    this.resultFeedClient = resultFeedClient;
  }

  protected async execute(input: GetVietlottResultInput): Promise<GetVietlottResultOutput> {
    const record = await this.resultFeedClient.getResult({
      gameKey: "keno",
      drawPeriod: input.drawPeriod,
    });

    return {
      found: record !== null,
      numbers: record?.numbers ?? null,
      drawDateSource: record?.drawDateSource ?? null,
      publishedAt: record?.publishedAt ?? null,
      verifiedByHuman: record?.verifiedByHuman ?? null,
      sourceCount: record?.sourceCount ?? null,
    };
  }
}
