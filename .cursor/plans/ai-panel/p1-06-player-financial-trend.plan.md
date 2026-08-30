# P1-06 — Tài chính Player theo chuỗi thời gian (ngày/tuần/tháng) + tiền cược chờ

## 0. Bối cảnh & vấn đề

Sự cố cụ thể (24/08): user hỏi *"Vẽ biểu đồ tiền cược của player4 mỗi tháng trong Q2"*. AI phải trả
lời **không vẽ được đúng theo tháng** vì:

- `GetPlayerFinancialsUseCase` (tool `getPlayerInsight`, field `financials`) chỉ trả **raw docs theo
  NGÀY × GAME** trong khoảng `from`–`to` (`PlayerSettleGameDailyRepository.findPlayerDailyRecords`) —
  không tự gộp lên tuần/tháng.
- `GetPlayerOverviewUseCase` (field `overview`) gộp **TOÀN BỘ khoảng thành 1 dòng/game** — mất hẳn
  trục thời gian, không dùng được cho biểu đồ theo kỳ.
- Không có lựa chọn nào ở giữa hai cực đó — đúng lỗ hổng mà `getFinancialTrend`/
  `getFinancialTrendByGame` đã bù cho cấp **game-level** (`system_settle_game_daily`), nhưng
  **player-level** (`player_settle_game_daily`) chưa có tool tương đương.
- AI phải "chữa cháy" bằng sandbox (tự cộng dữ liệu ngày → tháng trong code chạy runtime). Điều này
  **vi phạm nguyên tắc kiến trúc đã chốt** ở `55-charts.md`: số liệu tài chính chính thức của hệ
  thống PHẢI đi thẳng DB → tool → `renderChart` (mode 1, đọc trực tiếp output tool), KHÔNG được đi
  qua tay model tính lại rồi nhồi vào `rows` (mode 2 chỉ dành cho dữ liệu người dùng tự dán, chấp
  nhận rủi ro sai số). Dùng sandbox để tự gộp kỳ là đường vòng, không phải giải pháp đúng.

Yêu cầu của user mở rộng thêm 1 khái niệm nữa: **"tiền cược chờ của tài khoản player"** (outstanding
stake) — hiện chỉ có snapshot hiện tại (`GetPlayerOutstandingUseCase`, không có trục thời gian, không
lọc theo kỳ quá khứ) — cần cân nhắc có nên/làm thế nào bổ sung góc nhìn theo thời gian cho outstanding
hay giữ nguyên bản chất "chỉ có hiện tại" của nó.

## 1. Mục tiêu

1. Thêm khả năng lấy **tài chính đã settle của 1 player theo chuỗi thời gian** (1 dòng = 1 kỳ:
   ngày/tuần/tháng), tương tự `getFinancialTrend` nhưng scope player — để `renderChart` vẽ đúng ngay
   từ 1 lần gọi tool, không cần sandbox tự gộp.
2. Làm rõ và giữ đúng bản chất của **"tiền cược chờ"** (outstanding) — đây là khái niệm **snapshot
   hiện tại** (entries chưa settle ngay lúc query), KHÔNG có ý nghĩa "theo kỳ trong quá khứ" như tài
   chính đã chốt. Xác nhận việc này với user (không âm thầm giả định) và quyết định phạm vi P1-06 chỉ
   xử lý phần "đã chốt theo kỳ" — outstanding giữ nguyên endpoint hiện có, chỉ bổ sung docs/note.
3. Cập nhật tool policy + chart instructions để model chọn đúng tool mới thay vì lặp gọi
   `getPlayerInsight` theo từng kỳ hoặc dùng sandbox tự tính.

## 2. Nguyên tắc thiết kế (kế thừa từ `getFinancialTrend`/`getFinancialTrendByGame`)

- **1 dòng = 1 kỳ, gọi ĐÚNG MỘT LẦN cho cả khoảng.** Repo tự roll-up ngày → tuần/tháng bằng
  `financialPeriodKey()` (đã có ở `@megawin/shared/utils/financial-date`), KHÔNG bắt model gọi lặp.
- **Số liệu đi thẳng DB → tool → `renderChart` mode 1.** Field tên phải khớp
  `CURRENCY_NAME_PATTERN`/`PERCENT_NAME_PATTERN` sẵn có trong `chart-inference.ts` (đã có
  `stake`, `payout`, `ggr`, `commission`, `profit`...) để tự động format đúng đơn vị VND — không cần
  `seriesType` override như trường hợp `getFinancialTrendByGame` (nơi cột là mã game thô).
- **Tách tool riêng, không nhồi vào `getPlayerInsight`.** `getPlayerInsight` orchestrate 3 use-case
  RẺ+ĐẮT khác mục đích (tổng quan/tài chính raw/outstanding), input chỉ `accountId+from+to`. Tool
  trend cần thêm `period` bắt buộc — nhồi vào sẽ làm input/output tool hiện có phức tạp hơn cho
  mọi lần gọi, kể cả khi không cần trend. Giữ nguyên tắc 1 tool 1 mục đích (đã áp dụng cho
  `getFinancialTrend` tách khỏi `getFinancialByGame`/`getFinancialDailyOverview`).
- **Không tự bịa "outstanding theo tháng lịch sử".** Hệ thống không lưu snapshot lịch sử của
  outstanding (không có collection ghi lại "player X có bao nhiêu tiền chờ tại thời điểm T trong quá
  khứ") — chỉ có entries hiện tại ở trạng thái `scheduled`. Biến nó thành "trend" giả bằng cách suy
  diễn sẽ tạo số liệu sai lệch với thực tế DB. Xem §5 để biết phần nào của "theo kỳ" THỰC SỰ áp dụng
  được cho outstanding mà không cần thêm snapshot.

## 3. Thiết kế Phase 1 — `PlayerPeriodRow`: tài chính đã chốt theo kỳ

### 3.1. Type mới — `packages/game-core-application/src/infras/repos/types/player-settle-game-daily.types.ts`

Mirror `GamePeriodRow` (game-level) nhưng field khớp `PlayerSettleGameDaily` (có thêm
`settledCount/winCount/lossCount/voidCount`, KHÔNG có `playerCount/tenantCount` vì scope đã là 1
player):

```typescript
/**
 * Chuỗi thời gian tài chính đã chốt của 1 player — 1 dòng = 1 kỳ (ngày/tuần/tháng).
 * Có thể lọc theo 1 game qua tham số `game` khi gọi `aggregateByPeriod`.
 */
export interface PlayerPeriodRow {
  /** Khoá kỳ — `YYYY-MM-DD` (ngày, hoặc thứ Hai của tuần) hoặc `YYYY-MM` (tháng). */
  period: string;
  drawCount: number;
  entryCount: number;
  settledCount: number;
  winCount: number;
  lossCount: number;
  voidCount: number;
  /** Tổng tiền cược (VND) — CHỈ entries settled. */
  totalStake: number;
  /** Tổng trả thưởng (VND). */
  totalPayout: number;
  /** GGR = totalStake - totalPayout (VND). Có thể ÂM. */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). Có thể ÂM. */
  netProfit: number;
}
```

Export qua `infras/repos/types/index.ts` như các type khác.

### 3.2. Repo method mới — `PlayerSettleGameDailyRepository.aggregateByPeriod`

Copy nguyên cấu trúc `SystemSettleGameDailyRepository.aggregateByPeriod` (2 bước: `$group` theo
`financialDate` trong Mongo, roll-up kỳ bằng TS `Map` + `financialPeriodKey`), đổi field match/group
cho đúng schema `PlayerSettleGameDaily`:

```typescript
async aggregateByPeriod(params: {
  accountId: string;
  from: string;
  to: string;
  period: FinancialPeriod;
  game?: string;
}): Promise<PlayerPeriodRow[]> {
  const { accountId, from, to, period, game } = params;
  const match: Record<string, unknown> = {
    accountId,
    financialDate: { $gte: from, $lte: to },
  };
  if (game !== undefined) {
    match["gameProduct"] = game;
  }

  const daily = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$financialDate",
        drawCount: { $sum: "$drawCount" },
        entryCount: { $sum: "$entryCount" },
        settledCount: { $sum: "$settledCount" },
        winCount: { $sum: "$winCount" },
        lossCount: { $sum: "$lossCount" },
        voidCount: { $sum: "$voidCount" },
        totalStake: { $sum: "$totalStake" },
        totalPayout: { $sum: "$totalPayout" },
        ggr: { $sum: "$ggr" },
        totalCommission: { $sum: "$totalCommission" },
        netProfit: { $sum: "$netProfit" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Roll-up ngày → kỳ (tuần/tháng) bằng TS — xem JSDoc `financialPeriodKey`
  // (tuần ISO khó làm trực tiếp trong aggregation pipeline Mongo).
  const buckets = new Map<string, PlayerPeriodRow>();
  for (const row of daily) {
    const key = financialPeriodKey(row["_id"] as string, period);
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, {
        period: key,
        drawCount: row["drawCount"] as number,
        entryCount: row["entryCount"] as number,
        settledCount: row["settledCount"] as number,
        winCount: row["winCount"] as number,
        lossCount: row["lossCount"] as number,
        voidCount: row["voidCount"] as number,
        totalStake: row["totalStake"] as number,
        totalPayout: row["totalPayout"] as number,
        ggr: row["ggr"] as number,
        totalCommission: row["totalCommission"] as number,
        netProfit: row["netProfit"] as number,
      });
      continue;
    }
    bucket.drawCount += row["drawCount"] as number;
    bucket.entryCount += row["entryCount"] as number;
    bucket.settledCount += row["settledCount"] as number;
    bucket.winCount += row["winCount"] as number;
    bucket.lossCount += row["lossCount"] as number;
    bucket.voidCount += row["voidCount"] as number;
    bucket.totalStake += row["totalStake"] as number;
    bucket.totalPayout += row["totalPayout"] as number;
    bucket.ggr += row["ggr"] as number;
    bucket.totalCommission += row["totalCommission"] as number;
    bucket.netProfit += row["netProfit"] as number;
  }
  return Array.from(buckets.values());
}
```

Index đã đủ dùng: `{ accountId: 1, financialDate: -1 }` (đã khai báo cho `findPlayerDailyRecords`) —
`aggregateByPeriod` match cùng field, không cần index mới.

### 3.3. Use-case mới — `get-player-period-trend.ts`

```typescript
export interface GetPlayerPeriodTrendInput {
  accountId: string;
  from: string;
  to: string;
  period: FinancialPeriod;
  game?: string;
}

export interface GetPlayerPeriodTrendOutput {
  data: PlayerPeriodRow[];
  meta: {
    accountId: string;
    period: FinancialPeriod;
    from: string;
    to: string;
    game?: string;
    gameLabel?: string;
  };
}

export class GetPlayerPeriodTrendUseCase extends UseCase<
  GetPlayerPeriodTrendInput,
  GetPlayerPeriodTrendOutput
> {
  private readonly repo = new PlayerSettleGameDailyRepository();

  protected async execute(input: GetPlayerPeriodTrendInput): Promise<GetPlayerPeriodTrendOutput> {
    const data = await this.repo.aggregateByPeriod(input);
    return {
      data,
      meta: {
        accountId: input.accountId,
        period: input.period,
        from: input.from,
        to: input.to,
        ...(input.game === undefined
          ? {}
          : { game: input.game, gameLabel: getGameLabel(input.game as GameProduct) }),
      },
    };
  }
}
```

Export qua `use-cases/reports/index.ts` (`GetPlayerPeriodTrendUseCase` + 2 type).

### 3.4. Tool AI mới — `apps/backoffice/agent/tools/getPlayerFinancialTrend.ts`

Mirror `getFinancialTrend.ts`, đổi input thêm `accountId` bắt buộc:

```typescript
const useCase = new GetPlayerPeriodTrendUseCase();
const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];
const PERIOD_VALUES = Object.values(FinancialPeriod) as [FinancialPeriod, ...FinancialPeriod[]];

export default defineTool({
  description:
    "Tài chính ĐÃ CHỐT của 1 player ĐÃ BIẾT `accountId`, theo CHUỖI THỜI GIAN — một dòng cho MỖI " +
    "KỲ (ngày/tuần/tháng) trong khoảng from–to, có thể lọc theo 1 game. Dùng cho MỌI câu hỏi xu " +
    "hướng/biểu đồ theo thời gian của 1 player: 'tiền cược player4 mỗi tháng trong Q2', 'lợi nhuận " +
    "player X theo tuần tháng này'. GỌI ĐÚNG MỘT LẦN cho cả khoảng — `period` quyết định độ chia " +
    "(month cho nhiều tháng, week cho vài tuần, day cho trong tháng). TUYỆT ĐỐI KHÔNG gọi lặp từng " +
    "kỳ rồi tự cộng, KHÔNG dùng sandbox để tự gộp ngày thành tuần/tháng — tool này đã gộp sẵn ở " +
    "tầng DB, sandbox tự tính là đường vòng và có rủi ro sai số. " +
    "CHƯA CÓ `accountId` → gọi `getPlayerAccountInfo` trước. Cần tổng quan KHÔNG theo thời gian " +
    "(gộp cả khoảng, hoặc vé đang chờ) → `getPlayerInsight`.",
  inputSchema: z.object({
    accountId: z.string().describe("ID tài khoản player (ULID). Chưa có → gọi `getPlayerAccountInfo` trước."),
    from: z.string().describe("Ngày tài chính bắt đầu, định dạng YYYY-MM-DD."),
    to: z.string().describe("Ngày tài chính kết thúc, định dạng YYYY-MM-DD."),
    period: z
      .enum(PERIOD_VALUES)
      .describe("Độ chia mỗi dòng: day, week (khoá thứ Hai), month (khoá YYYY-MM)."),
    game: z.enum(GAME_VALUES).optional().describe("Chỉ lấy 1 game. Bỏ trống = tổng tất cả game trong mỗi kỳ."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getPlayerFinancialTrend"),
});
```

### 3.5. Wiring frontend — `registry.tsx`

- Thêm `PlayerFinancialTrend: "getPlayerFinancialTrend"` vào `AiToolName`.
- `AI_TOOL_LABELS`: `"Xu hướng tài chính player"`; `AI_TOOL_ACTIVITY_PHRASES`:
  `"đọc xu hướng tài chính player theo kỳ"`; `AI_TOOL_CARD_PLACEMENT`: `ToolCardPlacement.Reference`.
- **Không cần `ChartOverride`/`seriesType`** — field name (`totalStake`, `totalPayout`, `ggr`,
  `totalCommission`, `netProfit`) đã khớp sẵn `CURRENCY_NAME_PATTERN` trong `chart-inference.ts`
  (khác với `getFinancialTrendByGame`, nơi cột là mã game thô cần ép kiểu — xem §4 file
  `chart-inference.ts`, mục "seriesType").
- `CHART_REPORT_LABELS` (`REPORT_COLUMN_LABELS` + `GAME_LABELS`) đã có label Việt cho toàn bộ field
  (`totalStake` → "Tiền cược", `totalPayout` → "Trả thưởng", `ggr` → "Doanh thu thuần",
  `totalCommission` → "Hoa hồng đại lý", `netProfit` → "Lợi nhuận ròng", `drawCount` → "Kỳ quay",
  `entryCount` → "Phiếu cược") — **cần bổ sung 4 label còn thiếu**: `settledCount`, `winCount`,
  `lossCount`, `voidCount` vào `REPORT_COLUMN_LABELS` (`packages/game-core/src/labels/game-labels.ts`)
  vì các field này mới xuất hiện lần đầu ở 1 report có thể lên chart (trước đây chỉ nằm trong
  `PlayerOverviewResult`/`PlayerGameBreakdownRow`, không đi qua `renderChart`).
- Mở rộng `chartSourceNote()` thêm nhánh cho `AiToolName.PlayerFinancialTrend`: build note dạng
  `"Xu hướng tài chính player · <game nếu có> · 01/04/2026 – 30/06/2026"` từ `part.input` (giống
  pattern đã có cho `game`/`games`).

## 4. Cập nhật hướng dẫn model

### 4.1. `40-tool-policy.md`

Thêm dòng vào bảng "Chọn đúng tool tài chính" (đang chỉ có game-level), tách rõ 2 tầng player vs
system:

| Cần | Tool | Một dòng = |
|---|---|---|
| Xu hướng theo thời gian của **1 player** | `getPlayerFinancialTrend` | 1 kỳ (ngày/tuần/tháng) của player đó |
| Tổng quan **1 player**, KHÔNG theo thời gian (gộp cả khoảng + vé đang chờ) | `getPlayerInsight` | 1 lần gọi = overview + financials raw + outstanding |

Bổ sung cảnh báo tương tự đã viết cho `getFinancialTrend`: *"Hỏi 'tiền cược player X theo tháng' →
`getPlayerFinancialTrend`, KHÔNG gọi `getPlayerInsight` lặp theo từng tháng, KHÔNG dùng sandbox tự
gộp ngày → tháng từ field `financials` (raw theo ngày) — sự cố 24/08: hỏi tiền cược player4 theo
tháng trong Q2, AI phải trả lời không vẽ được vì thiếu tool này."*

### 4.2. `55-charts.md`

Thêm ví dụ vào mục "Khi nào gọi renderChart": *"Xu hướng tài chính 1 player theo kỳ ('tiền cược
player4 mỗi tháng trong Q2') → `getPlayerFinancialTrend`, KHÔNG tự dùng sandbox cộng dữ liệu ngày
thành tháng rồi vẽ — vi phạm nguyên tắc số liệu hệ thống phải đi thẳng DB → `renderChart`, mất khả
năng đối soát nếu sai."*

## 5. Phase 2 — "Tiền cược chờ" (outstanding) theo kỳ: bản chất khác, giải pháp khác

**Outstanding KHÔNG phải chuỗi thời gian lịch sử.** `PlayerOutstandingRepository.getPlayerOutstanding`
query realtime các entry đang ở trạng thái `scheduled` (chưa settle) — đây là ảnh chụp **NGAY LÚC
GỌI**, không lưu lại theo thời gian. Hệ thống **không có** collection ghi "player X có bao nhiêu
tiền chờ tại thời điểm T trong quá khứ" — muốn có "trend outstanding qua các tháng trước" cần xây
mới 1 pipeline snapshot định kỳ (cron ghi lại outstanding mỗi ngày vào collection riêng), tốn kém và
**ngoài phạm vi lỗi đang xử lý** (lỗi 24/08 chỉ về dữ liệu ĐÃ CHỐT).

**Điều THỰC SỰ làm được, không cần thêm DB/cron:** mỗi `PlayerOutstandingEntry` đã có sẵn
`financialDate` (ngày tài chính của kỳ quay mà entry đó thuộc về — có thể là hôm nay hoặc vài ngày
tới nếu vé mua trước). Nhóm các entry ĐANG CHỜ hiện tại theo `financialDate` của kỳ quay chúng thuộc
về (không phải theo "ngày lịch sử") cho biết: *"trong số tiền đang chờ hiện tại, bao nhiêu thuộc kỳ
quay hôm nay, bao nhiêu thuộc kỳ quay các ngày/tuần/tháng tới"* — vẫn là 1 con số tại 1 thời điểm,
chỉ chia nhỏ theo kỳ quay tương ứng. Cách này **không cần query DB thêm** vì đã có toàn bộ `entries`
trong tay (tối đa 200 bản ghi), chỉ cần group trong-memory.

### 5.1. Thiết kế nhỏ, rẻ

Thêm optional `period?: FinancialPeriod` vào `GetPlayerOutstandingInput`. Khi có, tính thêm
`byPeriod: PlayerOutstandingPeriodRow[]` từ CHÍNH `entries` đã fetch (không thêm DB call):

```typescript
export interface PlayerOutstandingPeriodRow {
  /** Khoá kỳ của financialDate — kỳ quay entries này thuộc về (không phải "quá khứ"). */
  period: string;
  entryCount: number;
  totalStake: number;
  totalCommission: number;
}
```

Tính bằng `Map` giống `financialPeriodKey`, sort theo `period` tăng dần. Thêm field optional
`byPeriod?: PlayerOutstandingPeriodRow[]` vào `PlayerOutstandingSummary` — bỏ trống khi không truyền
`period` (giữ nguyên hành vi hiện tại, không breaking).

### 5.2. Không tạo tool riêng — mở rộng `getPlayerInsight`

Vì đây là field bổ sung, rẻ, tính từ dữ liệu ĐÃ có trong tay — thêm optional `outstandingPeriod?:
FinancialPeriod` vào input `getPlayerInsight`, truyền xuống `GetPlayerOutstandingUseCase`. KHÔNG cần
tool mới (khác với financial trend — vốn cần `period` bắt buộc + input hoàn toàn khác).

### 5.3. Xác nhận với user (không tự quyết)

Trước khi code Phase 2, cần user xác nhận đây đúng là ý muốn ("tiền cược chờ, chia theo kỳ quay sắp
tới") hay thực ra user muốn "lịch sử outstanding" (đòi hỏi snapshot — effort lớn hơn nhiều, cần bàn
riêng có đáng làm không). Câu hỏi gốc bị cắt ("Tiền cược chờ của tài khoản player...") nên đặt câu
hỏi làm rõ trước khi implement Phase 2.

## 6. Ngoài phạm vi (backlog, không làm trong P1-06)

- **So sánh nhiều game của CÙNG 1 player theo thời gian** (giống `getFinancialTrendByGame` nhưng
  scope player) — chưa có yêu cầu cụ thể, để dành nếu phát sinh (pattern tái dùng: pivot theo
  `gameProduct` thay vì roll-up tổng).
- **Snapshot lịch sử outstanding** — effort lớn (cron + collection mới), chỉ làm nếu user xác nhận
  cần ở §5.3.

## 7. Testing

- **Unit test** `packages/game-core-application` (mirror `system-settle-game-daily-repo` test nếu
  có, hoặc thêm mới): `aggregateByPeriod` — roll-up ngày → tuần đúng thứ Hai ISO, → tháng đúng
  `YYYY-MM`; filter `game` đúng; kỳ ở 2 đầu khoảng không trọn vẹn vẫn tính đúng theo ngày nằm trong
  range (mirror test đã có ở game-level).
- **Unit test** `GetPlayerPeriodTrendUseCase` — output `meta.gameLabel` chỉ có khi có `game`.
- **Eval test** (`apps/backoffice/evals/tool-choice/`) mirror `financial-trend.eval.ts`: prompt
  *"Vẽ biểu đồ tiền cược player4 mỗi tháng trong Q2/2026"* → phải gọi `getPlayerFinancialTrend` ĐÚNG
  1 lần với `period: month`, KHÔNG gọi `getPlayerInsight` lặp, KHÔNG dùng sandbox; sau đó phải gọi
  `renderChart`.
- **Manual verify trên UI thật**: hỏi lại đúng câu trong ảnh chụp màn hình gốc, xác nhận ra bảng/chart
  3 dòng tháng 04/05/06 đúng số `2.720.000 / 0 / 0` (đối chiếu với số AI đã tự tính tay trong log cũ
  để đảm bảo backend cho ra đúng số).

## 8. Thứ tự triển khai

1. Type `PlayerPeriodRow` + export barrel.
2. Repo method `aggregateByPeriod` + unit test.
3. Use-case `GetPlayerPeriodTrendUseCase` + Input/Output type + export barrel + unit test.
4. Tool `getPlayerFinancialTrend.ts`.
5. `registry.tsx`: `AiToolName`, labels, placement, `chartSourceNote` nhánh mới.
6. Bổ sung 4 label thiếu (`settledCount/winCount/lossCount/voidCount`) vào
   `REPORT_COLUMN_LABELS`.
7. Cập nhật `40-tool-policy.md` + `55-charts.md`.
8. Eval test tool-choice.
9. `tsc --noEmit` + `pnpm lint` + verify UI thật với đúng prompt trong ảnh gốc.
10. (Sau khi user xác nhận §5.3) Phase 2 — outstanding `byPeriod`.

## 9. Rủi ro

- **Field `settledCount` đếm gộp cả `winCount+lossCount`** (không phải field độc lập cộng thêm) —
  nếu vẽ cả 3 field (`settledCount`, `winCount`, `lossCount`) trên cùng chart dễ gây hiểu lầm
  "tổng 3 cột = 2×settledCount". Cân nhắc: mặc định KHÔNG đưa `settledCount/lossCount` vào nhóm field
  hay được chọn tự động cho biểu đồ tài chính (ưu tiên `totalStake/totalPayout/ggr/netProfit`) — việc
  này do `chart-inference.ts` tự chọn tối đa N series ưu tiên currency, không cần xử lý đặc biệt,
  nhưng nêu ở đây để lưu ý khi review.
- **`aggregateByPeriod` không giới hạn số kỳ trả về** (giống game-level) — nếu `from`–`to` quá dài với
  `period: day`, số dòng có thể lớn; đã có tiền lệ ở game-level chấp nhận rủi ro này (không thêm
  limit), giữ nguyên nhất quán.

</contents>
