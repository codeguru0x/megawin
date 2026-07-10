# 01 — Domain Model & Entities (`game-lottery`)

> Tất cả entity theo **chuẩn MegaWin hiện có**: `*Doc` (MongoDB layer) + `*Entity` (application layer sau mapper,
> `_id` → `id`, `version: Long` → `version: string`). Enum dùng `const object as const`. Tiền = **integer VND**.
> `drawId` format `YYYY-MM-DD.NNN`. Field `camelCase`. Nguồn tham chiếu: `game-bingo18/src/entities/*`.
>
> **Cập nhật quan trọng (v3):**
> 1. **Naming:** `gameType` → **`region`** (đài); giữ **`playType`** (kiểu cược, prefix `Lottery`) (`[Chốt]`).
> 2. **Mỗi đài chỉ có 1 kỳ mở thưởng / ngày** → format draw đơn giản hoá (`[Chốt]`).
> 3. **3 trục trực giao** trên board: `playType` + **`position`** (`last`/`first`) + **`betMode`**
>    (`exact`/`parity`/`sizes`) + `prizeSelector?` (chỉ `de`). Bỏ playType `deDau`/`deGiaiChon`/`deDauGiaiChon`/`loDau`
>    và enum `LotteryParity` — thay bằng tổ hợp trục (`[Chốt]`).
>
> **Cập nhật quan trọng (v4) `[Chốt]`:**
> 4. **Selection chuẩn hoá `picks: string[]`** — thay `numbers`/`parityPick`/`sizePick` bằng 1 field canonical duy
>    nhất, grammar token theo `betMode` (§2.3.1). Index multikey → tra cứu/risk nhanh; betMode mới KHÔNG đổi schema.
> 5. **2 lớp đóng/mở:** `DrawStatus` (lifecycle chuẩn game-core) + **`markets`** trên draw — mỗi
>    `(playType, position, betMode)` có trạng thái open/suspended/closed riêng (§5.1). Mở draw ≠ mở mọi playType.
>    Lô Live là 1 market điều khiển tay qua LiveState (xem `05`).
> 6. **`viewKey` / `marketKey`** là định danh xuyên suốt: config (`02`), market (§5.1), risk & report (`07`).

---

## 1. Collections

```
lottery_tickets            — 1 doc = 1 vé (purchase intent), nhiều board, nhiều kỳ (nhiều ngày)
lottery_ticket_entries     — 1 doc = 1 (vé × 1 kỳ × 1 region) — đơn vị settle
lottery_draws              — 1 doc = 1 kỳ mở thưởng của 1 region (đài). Mỗi (region, ngày) = 1 kỳ duy nhất
lottery_draw_counters      — sinh drawNo tuần tự
lottery_game_configs       — global + per-tenant (scope field)
lottery_live_states        — trạng thái Lô Live per (drawId) — Phase 1 (xem 05)
lottery_live_prices        — bảng payout Lô Live theo số giải còn lại — Phase 1 (xem 05)
```

> **Quyết định khoá kỳ quay (`[Chốt]`):** mỗi đài **1 kỳ/ngày**. Không có nhiều lần quay trong ngày. `drawId` =
> `YYYY-MM-DD.NNN` trong đó **`.NNN` là số thứ tự kỳ theo NGÀY của đài đó**, thực tế luôn `.001` (1 kỳ/ngày) —
> giữ `.NNN` để đồng bộ format chung MegaWin và phòng trường hợp cần kỳ đặc biệt. Đài được mã hoá ở field `region`
> riêng, **unique index `{region, drawDate}`** (1 đài + 1 ngày = 1 kỳ). Không nhồi 4 đài vào 1 draw doc — dò trúng
> & settle mỗi đài độc lập.

---

## 2. Enums đặc thù (`packages/game-lottery/src/entities/enums.ts`)

### 2.1 Region (đài) — đổi tên từ `gameType`

```ts
/**
 * Đài xổ số (region). Đổi tên từ "gameType" để không nhầm với gameKey cấp hệ thống MegaWin.
 * Mỗi đài có cơ cấu giải + tập playType riêng. Mỗi đài mở thưởng 1 kỳ/ngày.
 */
export const LotteryRegion = {
  MienBac: "mienBac",       // 27 bộ số, có Lô Live
  MienNam18A: "mienNam18A", // 18 bộ số
  MienNam18B: "mienNam18B", // 18 bộ số
  MienNam18C: "mienNam18C", // 18 bộ số
} as const;
export type LotteryRegion = (typeof LotteryRegion)[keyof typeof LotteryRegion];

/** Đài Miền Nam (18 bộ số) — dùng để chọn nhánh settle/pricing. */
export const LOTTERY_SOUTHERN_REGIONS: readonly LotteryRegion[] = [
  LotteryRegion.MienNam18A,
  LotteryRegion.MienNam18B,
  LotteryRegion.MienNam18C,
];
```

### 2.2 PlayType (kiểu cược) — GỘP variants qua `position` + `prizeSelector`

> **Nguyên tắc `[Chốt: merge]`:** "Đề đầu / theo giải chọn / Lô đầu / chẵn-lẻ / tài-xỉu" KHÔNG phải playType riêng.
> Chúng là **tổ hợp trục** trên playType gốc:
> - "Đề đầu" = `de` + `position=first`; "Đề theo giải chọn" = `de` + `prizeSelector`; "Lô đầu" = `lo` + `position=first`.
> - "Chẵn/lẻ" = `betMode=parity`; "Tài/Xỉu" = `betMode=sizes`.
>
> Lý do: `de` chính là `de@special,last,exact` → giữ playType riêng cho từng biến thể sẽ **trùng lặp state**.

> **Ý nghĩa keyword (chi tiết `00` §4 & `04`):**
> - **"Đề"** (`de`) = so **1 kết quả** (theo `prizeSelector`, mặc định giải Đặc Biệt) → **KHÔNG nháy**.
> - **"Lô"** (`lo`) = so **nhiều kết quả** (toàn bộ giải của đài) → **CÓ nháy**.
> - **`position=first`** ("Đầu") = lấy chữ số ĐẦU; **`position=last`** (mặc định) = lấy chữ số CUỐI.
> - **"2D/3D/4D"** = so 2/3/4 chữ số. **Xiên** = chọn nhiều bộ số, thắng khi TẤT CẢ đều về.

```ts
/**
 * Kiểu cược (play type). Giữ tên "playType"; prefix Lottery tránh nhầm game khác.
 * Tập hợp lệ khác nhau theo region (xem LOTTERY_PLAY_TYPES_BY_REGION).
 *
 * "Đề đầu / theo giải chọn / Lô đầu / chẵn-lẻ / tài-xỉu" KHÔNG có ở đây —
 * là tổ hợp trục position/prizeSelector/betMode trên de/lo (xem LotteryNumberPosition, LotteryBetMode).
 */
export const LotteryPlayType = {
  // Chung cả MB & MN
  De: "de",       // Đề — so 1 giải (mặc định ĐB). position=last→"Đề", first→"Đề đầu". prizeSelector→"theo giải chọn". KHÔNG nháy.
  Lo: "lo",       // Lô 2D — so MỌI giải (MB 27 / MN 18). position=last→"Lô", first→"Lô đầu". CÓ nháy.
  Xien2: "xien2", // Xiên 2 — 2 bộ số cùng về
  Xien3: "xien3",
  Xien4: "xien4",

  // Chỉ Miền Bắc
  Ba3D: "ba3D",   // 3D đuôi — 3 số cuối các giải ≥3 số, CÓ nháy
  Bon4D: "bon4D", // 4D đuôi — 4 số cuối các giải ≥4 số, CÓ nháy
  LoLive: "loLive", // Lô Live — chỉ MB, chơi trong lúc quay. Xem 05

  // Chỉ Miền Nam (cơ cấu 18 bộ số)
  Lo2D7: "lo2D7",   // 2D 7 Lô — 2 số cuối 7 bộ giải tư, CÓ nháy
  Ba3D17: "ba3D17", // 3D 17 Lô — 3 số cuối 17 bộ ≥3 số, CÓ nháy
  Ba3D7: "ba3D7",   // 3D 7 Lô — 3 số cuối 7 bộ giải tư, CÓ nháy
  Bon4D16: "bon4D16", // 4D 16 Lô — 4 số cuối 16 bộ ≥4 số, CÓ nháy
} as const;
export type LotteryPlayType = (typeof LotteryPlayType)[keyof typeof LotteryPlayType];

/** playType hợp lệ theo từng đài. Validate lúc place-bet. */
export const LOTTERY_PLAY_TYPES_BY_REGION: Record<LotteryRegion, readonly LotteryPlayType[]> = {
  mienBac: ["de", "lo", "xien2", "xien3", "xien4", "ba3D", "bon4D", "loLive"],
  mienNam18A: ["de", "lo", "lo2D7", "ba3D17", "ba3D7", "bon4D16", "xien2", "xien3", "xien4"],
  mienNam18B: [ /* = 18A */ ],
  mienNam18C: [ /* = 18A */ ],
};

/**
 * playType hỗ trợ position=first ("đầu").
 * de (Đề đầu) & lo (Lô đầu) — chỉ MB cho lo (MN chưa mở, xem 00 §4.2).
 * Còn lại chỉ position=last.
 */
export const LOTTERY_POSITION_FIRST_PLAY_TYPES: readonly LotteryPlayType[] = ["de", "lo"];

/** playType có "nháy" (nhân frequence) khi betMode=exact (so nhiều kết quả). */
export const LOTTERY_MULTIPAY_PLAY_TYPES: readonly LotteryPlayType[] = [
  "lo", "ba3D", "bon4D", "loLive", "lo2D7", "ba3D17", "ba3D7", "bon4D16",
];

/** playType cho phép prizeSelector (chọn giải cụ thể). Chỉ "de". */
export const LOTTERY_PRIZE_SELECTOR_PLAY_TYPES: readonly LotteryPlayType[] = ["de"];
```

### 2.3 BetMode — cách chơi (thay `LotteryParity` cũ)

```ts
/**
 * Cách chơi trên một board. Áp cho de, lo, lo2D7, loLive.
 * - exact  : chọn CHÍNH XÁC số (mặc định, cách truyền thống). Trả thưởng cao nhất.
 * - parity : đoán kết quả là CHẴN hay LẺ. Trả thưởng thấp hơn exact.
 * - sizes  : đoán TÀI hay XỈU (Xỉu 00–49, Tài 50–99). Trả thưởng thấp hơn exact.
 *
 * Với "Đề" (1 kết quả): parity/sizes xét đúng kết quả đã chọn.
 * Với "Lô" (nhiều kết quả) betMode=exact có nháy; parity/sizes xét kết quả tương ứng (xem 04).
 * Với "Lô Live" (xem 05): exact = so các giải còn lại; parity/sizes = đoán giải mở KẾ TIẾP.
 */
export const LotteryBetMode = {
  Exact: "exact",
  Parity: "parity",
  Sizes: "sizes",
} as const;
export type LotteryBetMode = (typeof LotteryBetMode)[keyof typeof LotteryBetMode];

/** Giá trị chọn khi betMode=parity. */
export const LotteryParityPick = { Even: "even", Odd: "odd" } as const;
export type LotteryParityPick = (typeof LotteryParityPick)[keyof typeof LotteryParityPick];

/** Giá trị chọn khi betMode=sizes. Xỉu = 00–49, Tài = 50–99. (`[Chốt]`) */
export const LotterySizePick = { Xiu: "xiu", Tai: "tai" } as const;
export type LotterySizePick = (typeof LotterySizePick)[keyof typeof LotterySizePick];

/** betMode hợp lệ theo playType. Xiên & 3D/4D chỉ exact. */
export const LOTTERY_BET_MODES_BY_PLAY_TYPE: Partial<Record<LotteryPlayType, readonly LotteryBetMode[]>> = {
  de: ["exact", "parity", "sizes"],
  lo: ["exact", "parity", "sizes"],
  loLive: ["exact", "parity", "sizes"],
  lo2D7: ["exact", "parity", "sizes"],
  // Xiên & 3D/4D: chỉ exact (mặc định nếu không liệt kê)
};
```

### 2.3.1 Pick token grammar — selection canonical `[Chốt: v4]`

> **Vấn đề:** nếu mỗi betMode 1 field riêng (`numbers` / `parityPick` / `sizePick`), thêm betMode mới = đổi schema
> board + entry + mọi query. Nếu dùng discriminated union object thì khó index/truy vấn nhanh trong phiên
> (risk aggregation, tìm entries theo con số).
>
> **Giải pháp:** mọi lựa chọn quy về **`picks: string[]`** — một field canonical duy nhất, token string theo
> grammar cố định per betMode. MongoDB **multikey index** trên `picks` → tra "ai đang cược con `27`?" hay
> "tổng điểm pick `even`?" đều 1 IXSCAN. Risk pipeline (07) fold thẳng theo `picks[i]` — không cần rẽ nhánh field.

| betMode | Token grammar | Ví dụ `picks` | Số token |
|---|---|---|---|
| `exact` 2D | `"00"–"99"` zero-padded | `["05","27"]` (Lô 2 số) | ≥1 |
| `exact` 3D | `"000"–"999"` | `["123"]` | ≥1 |
| `exact` 4D | `"0000"–"9999"` | `["1234"]` | ≥1 |
| `exact` xiên | 2/3/4 token 2-chữ-số distinct | `["05","27","81"]` (xiên 3) | =2/3/4 |
| `parity` | `LotteryParityPick` | `["even"]` | =1 |
| `sizes` | `LotterySizePick` | `["xiu"]` | =1 |
| *(tương lai)* betMode mới | token mới tự định nghĩa | VD `["sum-13"]` | theo mode |

Quy tắc bất biến:
1. Token là **string thuần**, không object — so sánh bằng `===`, index multikey, dùng làm key `$inc` risk.
2. **Grammar validate theo `betMode`** tại place-bet (03 §3) — token space của mỗi mode tách rời, không đụng nhau
   (token exact luôn là chữ số; token mode khác luôn có chữ cái) → không thể nhầm lẫn giữa các mode.
3. Thêm betMode mới = thêm enum value + grammar validator + công thức dò trúng — **schema board/entry/risk giữ nguyên**.
4. `LotteryRiskDoc.number` (07) dùng **chính token này** → risk/report/entries chung 1 vocabulary.

### 2.4 Vị trí lấy số & hạng giải

```ts
/**
 * Vị trí lấy chữ số trên bộ số — TRỤC CHÍNH trên board (thay cho playType deDau/loDau).
 * - last  : lấy các chữ số CUỐI (mặc định) → "Đề", "Lô".
 * - first : lấy các chữ số ĐẦU → "Đề đầu", "Lô đầu".
 * Chỉ de/lo hỗ trợ first (xem LOTTERY_POSITION_FIRST_PLAY_TYPES).
 */
export const LotteryNumberPosition = { First: "first", Last: "last" } as const;
export type LotteryNumberPosition = (typeof LotteryNumberPosition)[keyof typeof LotteryNumberPosition];

/** Hạng giải — dùng cho prizeSelector ("theo giải chọn") & flatten kết quả. */
export const LotteryPrizeTier = {
  Special: "special", First: "first", Second: "second", Third: "third",
  Fourth: "fourth", Fifth: "fifth", Sixth: "sixth", Seventh: "seventh",
  Eighth: "eighth", // chỉ Miền Nam
} as const;
export type LotteryPrizeTier = (typeof LotteryPrizeTier)[keyof typeof LotteryPrizeTier];
```

### 2.5 Market key — định danh "bảng cược" xuyên suốt `[Chốt: v4]`

> **Market** = 1 bảng cược vận hành được = 1 tổ hợp `(playType, position, betMode)` trong 1 region.
> Đây chính là grain của risk (07), của Bảng Thao Tác Giá, và của lớp đóng/mở thứ 2 trên draw (§5.1).

```ts
/**
 * Key định danh market TRONG 1 draw (draw đã mang region): `${playType}.${position}.${betMode}`.
 * VD "lo.first.exact" (Lô đầu), "de.last.parity" (Đề chẵn/lẻ), "loLive.last.exact".
 */
export type LotteryMarketKey = string;

/**
 * viewKey ĐẦY ĐỦ (cross-draw, dùng cho config/report): `${region}.${marketKey}`.
 * VD "mienBac.lo.first.exact". Xem 07 §5.1 (Report View Catalog).
 */
export type LotteryViewKey = string;

export function buildMarketKey(playType: LotteryPlayType, position: LotteryNumberPosition, betMode: LotteryBetMode): LotteryMarketKey;
export function buildViewKey(region: LotteryRegion, marketKey: LotteryMarketKey): LotteryViewKey;

/** Danh sách market hợp lệ per region — derive từ LOTTERY_PLAY_TYPES_BY_REGION × position × betMode. */
export function listMarkets(region: LotteryRegion): LotteryMarketKey[];
```

Ứng dụng `viewKey`/`marketKey` (một vocabulary, nhiều nơi dùng):

| Nơi dùng | Cách dùng |
|---|---|
| **Draw markets** (§5.1) | key của map `draw.markets` — đóng/mở từng bảng |
| **Config** (02 §2.4) | `marketRules[viewKey]` — payout/min/max/trần nhận cược per bảng |
| **Risk & Bảng Thao Tác Giá** (07) | filter 4 chiều = filter theo viewKey; label từ Report View Catalog |
| **Report/Alert** | mỗi viewKey 1 section; alert message dùng label |
| **Player API** | trả danh sách market đang mở kèm payout để client render menu cược |

### 2.6 Collections const

```ts
export const LotteryCollections = {
  Tickets: "lottery_tickets",
  TicketEntries: "lottery_ticket_entries",
  Draws: "lottery_draws",
  DrawCounters: "lottery_draw_counters",
  GameConfigs: "lottery_game_configs",
  LiveStates: "lottery_live_states",
  LivePrices: "lottery_live_prices",
  Risks: "lottery_risks",               // rủi ro theo con số mỗi bảng cược (07)
  RiskTables: "lottery_risk_tables",    // tổng cấp bảng — mẫu số công thức risk (07)
} as const;
```

---

## 3. Board schema (unified) — `packages/game-lottery/src/entities/ticket.ts`

Theo pattern Bingo 18: **mọi playType nằm chung mảng `boards[]`**, phân biệt qua `playType`. Với lottery, mỗi board
mang thêm `region` (đài), `position` (đầu/đuôi), `betMode` (cách chơi) và trường tuỳ playType.

```ts
/** 1 lựa chọn cược trên vé. Unified cho mọi playType, region, position, betMode. */
export interface LotteryBoard {
  /** Mã board, unique trong ticket (VD "A", "B"...). */
  boardNo: string;
  /** Đài. */
  region: LotteryRegion;
  /** Kiểu cược. */
  playType: LotteryPlayType;
  /**
   * Vị trí lấy số: last (đuôi, mặc định) | first (đầu).
   * de+first = "Đề đầu"; lo+first = "Lô đầu". Chỉ de/lo cho first.
   */
  position: LotteryNumberPosition;
  /** Cách chơi: exact (mặc định) | parity | sizes. */
  betMode: LotteryBetMode;

  /**
   * Selection CANONICAL — token string theo grammar của betMode (§2.3.1):
   * - exact  : con số zero-padded. de/lo/loLive/lo2D7 → 2 số ["05","27"];
   *            ba3D* → 3 số ["123"]; bon4D* → 4 số ["1234"]; xien2/3/4 → đúng 2/3/4 token 2-số distinct.
   * - parity : ["even"] | ["odd"] (đúng 1 token).
   * - sizes  : ["xiu"] | ["tai"] (đúng 1 token).
   * betMode tương lai chỉ thêm grammar token mới — field này KHÔNG đổi.
   * Multikey index trên entry snapshot → tra cứu theo con số/pick 1 IXSCAN (risk 07, backoffice).
   */
  picks: string[];

  /**
   * Giải player chọn — chỉ playType=de ("theo giải chọn"). Mặc định giải Đặc Biệt nếu bỏ trống.
   * index phân biệt khi 1 hạng giải có nhiều bộ số (VD third MB có 6 bộ).
   */
  prizeSelector?: { tier: LotteryPrizeTier; index: number };

  /** Số điểm cược cho board này. Tiền board = pricePerPoint × point. */
  point: number;
  /** Giá bán mỗi điểm (VND) đã resolve tại place-bet. Snapshot. */
  pricePerPoint: number;
  /** Tỉ lệ trả thưởng (odds) snapshot tại place-bet. VD Đề "1 ăn 99" → 99. */
  payout: number;
}
```

> **Bỏ `numbers`/`parityPick`/`sizePick` (v3) → gộp thành `picks` (v4) `[Chốt]`:** 1 field cho mọi betMode hiện tại
> và tương lai. Grammar tách rời per mode (token exact toàn chữ số, mode khác có chữ cái) nên không nhầm lẫn;
> validator ở place-bet đảm bảo đúng grammar trước khi ghi.
>
> **Tên field `[Chốt]`: giữ `picks`, không dùng `bets`/`selections`.** Lý do: (1) trong schema này "bet" đã là
> chính cái **board** (board = 1 lệnh cược có point/price/payout) — đặt `bets` bên trong board thành "bet trong
> bet", gây nhầm; (2) "picks" là thuật ngữ lottery chuẩn cho *con số người chơi chọn* (Pick 3/Pick 4); (3) ngắn,
> số nhiều tự nhiên với array. Ví dụ cụ thể: cược Đề chọn con `27` → `picks: ["27"]` (token 2 chữ số `"00"–"99"`,
> zero-padded); Đề chẵn → `picks: ["even"]`.

> **Vì sao snapshot `pricePerPoint` + `payout` vào board:** giống Keno snapshot `commissionRate`/prize — kết sổ đọc
> lại nguyên vẹn giá trị lúc cược, không phụ thuộc config hiện tại (tránh lệch tiền khi công ty đổi giá sau đó).
> **Lô Live:** `payout` snapshot = payout tại `remainPrizeCount` lúc cược (xem `05`).

### 3.1 Ticket doc (cấu trúc bao ngoài như Bingo18)

```ts
export interface LotteryTicketDoc {
  _id: unknown;
  tenantId: string;
  accountId: string;
  username: string;
  ticketNo: string;          // LOT-YYYYMMDD-NNNNN
  channel: TicketChannel;
  ipAddress?: string;

  /**
   * Kế hoạch kỳ: mua trước nhiều NGÀY (mỗi đài 1 kỳ/ngày).
   * drawIds có thể trộn nhiều đài (mỗi board mang region riêng). (`[Chốt]` multi_day)
   */
  drawPlan: { drawIds: string[]; drawCount: number };

  /** Tổng tiền, breakdown xem 03. */
  pricing: LotteryTicketPricing;

  /** Tất cả board (mọi playType/đài/position/mode). */
  boards: LotteryBoard[];

  progress: { totalDraws: number; settledDraws: number };
  settlement?: { totalWinAmount: number; lastSettledAt?: Date };
  voidSummary?: LotteryTicketVoidSummary;

  financialDate: ISODateString;
  status: TicketStatus;
  version: number;
  tx: string;                // UUIDv7 link WAL
  createdAt: Date;
  updatedAt: Date;
}
```

> **Multi-term semantics (`[Chốt]`):** mỗi đài **1 kỳ/ngày** → "mua nhiều kỳ" = mua trước cho **nhiều ngày tới**.
> `drawIds` là danh sách kỳ (mỗi ngày × mỗi đài 1 kỳ). Mỗi board mang `region`; **mỗi (board × draw cùng region)
> → 1 entry**. Board region A không sinh entry cho draw region B. Kiểm tra kỳ đã kết sổ / đơn cược còn lại như game
> hiện có — xem `03`.

---

## 4. Entry doc — `packages/game-lottery/src/entities/entry.ts`

1 entry = 1 (vé × 1 kỳ × 1 region). Đơn vị settle & feed. Copy pattern Bingo18 (`EntryTenantSnapshot`,
`EntryPayout` với `payoutTx`, `EntryReversal`, `EntryVoidInfo`).

```ts
export interface LotteryTicketEntryDoc {
  _id: unknown;
  tenantId: string;
  accountId: string;
  username: string;
  ipAddress?: string;
  ticketId: string;

  drawId: string;
  region: LotteryRegion;
  financialDate: ISODateString;

  /** Hoa hồng snapshot — tenant tự chia (RGS). */
  tenant: EntryTenantSnapshot; // { commissionRate, commissionAmount }

  status: EntryStatus;         // pending → settled | voided

  // ── Stake ──
  selectionCount: number;      // số board của entry
  totalPoint: number;          // Σ board.point
  amount: number;              // Σ (board.pricePerPoint × board.point)

  entrySummary: { ticketNo: string; boards: LotteryEntryBoardSnapshot[] };

  /** Kết quả kỳ (snapshot khi settle) — xem 04. */
  result?: LotteryEntryResult;

  outcome?: EntryOutcome;      // win | lose | partial_win
  payout?: LotteryEntryPayout;
  voidInfo?: EntryVoidInfo;
  reversal?: EntryReversal;

  createdAt: Date;
  updatedAt: Date;
  version: Long;
}
```

### 4.1 Board snapshot & payout per-board

```ts
export interface LotteryEntryBoardSnapshot {
  boardNo: string;
  region: LotteryRegion;
  playType: LotteryPlayType;
  position: LotteryNumberPosition;
  betMode: LotteryBetMode;
  /** Selection canonical (token grammar §2.3.1). Multikey index phục vụ tra cứu theo con số/pick. */
  picks: string[];
  prizeSelector?: { tier: LotteryPrizeTier; index: number };
  point: number;
  pricePerPoint: number;
  payout: number;
}
```

> **Index phục vụ vận hành trong phiên (`[Chốt: v4]`):**
> `{ tenantId, drawId, "entrySummary.boards.picks": 1 }` (multikey) — "ai đang cược con `27`?" / "liệt kê entries
> pick `even`" = 1 IXSCAN, không scan toàn kỳ. Risk pipeline (07) cũng đọc theo index này khi drill-down.

```ts
export interface LotteryEntryBoardPayout {
  boardNo: string;
  playType: LotteryPlayType;
  position: LotteryNumberPosition;
  betMode: LotteryBetMode;
  /** Số nháy trúng (frequence). Không nháy: 0 hoặc 1. */
  multiPay: number;
  isWin: boolean;
  point: number;
  payout: number;
  /**
   * Tiền thắng board (VND):
   *  - CÓ nháy (betMode=exact & playType multipay): payout × point × multiPay
   *  - KHÔNG nháy: payout × point (khi isWin), else 0
   */
  winAmount: number;
}

export interface LotteryEntryPayout {
  winAmount: number;      // Σ boardPayouts.winAmount
  payoutAmount: number;   // tiền trả player (lottery không cap kiểu Keno — xác nhận 06)
  boardPayouts: LotteryEntryBoardPayout[];
  settledAt: Date;
  payoutTx?: string;      // idempotency UUIDv7
}
```

> **`WinLose` của ref không lưu trực tiếp:** MegaWin tách `amount` (đã trừ ví lúc place-bet) và `payoutAmount`
> (tiền trả khi thắng). `profit = revenue − prizes − commission` suy ở `DrawFinancial` (như Keno/Bingo18).

---

## 5. Draw doc — `packages/game-lottery/src/entities/draw.ts`

Bao ngoài giống Bingo18, khác ở **`result`** (MB≠MN) và **`markets`** (lớp đóng/mở thứ 2). Chi tiết `result` &
`settleSummary` ở `04`.

```ts
export interface LotteryDrawDoc {
  _id: unknown;
  drawId: string;              // YYYY-MM-DD.NNN (.NNN thường .001 — 1 kỳ/ngày)
  region: LotteryRegion;       // đài — unique {region, drawDate}
  drawDate: ISODateString;
  drawNo: number;
  drawTime: Date;
  status: DrawStatus;          // lớp 1 — lifecycle (game-core): scheduled → salesOpen → salesClosed → published → settling → settled | voiding → void
  sales: DrawSales;            // { openAt?, closeAt } — game-core
  financialDate: ISODateString;

  /**
   * Lớp 2 — trạng thái từng BẢNG CƯỢC (market) trong kỳ. Key = marketKey `${playType}.${position}.${betMode}`.
   * Mở draw KHÔNG có nghĩa mở mọi market — staff đóng/mở từng bảng độc lập. Xem §5.1.
   */
  markets: Record<LotteryMarketKey, LotteryDrawMarket>;

  /** Kết quả — union theo đài (LotteryNorthernResult | LotterySouthernResult). Xem 04. */
  result?: LotteryDrawResult;

  financial?: DrawFinancial;
  stats?: DrawStats;
  settleSummary?: LotteryDrawSettleSummary;
  voidInfo?: DrawVoidInfo;
  voidSummary?: DrawVoidSummary;
  settledAt?: Date;            // high-water mark
  createdAt: Date;
  updatedAt: Date;
}
```

### 5.1 Hai lớp đóng/mở — `DrawStatus` × `markets` `[Chốt: v4]`

> **Lớp 1 (`status`)** = lifecycle kỳ quay, tái dùng **nguyên vẹn `DrawStatus` của game-core**
> (`scheduled → salesOpen → salesClosed → published → settling → settled`, nhánh `voiding → void`) — vì lifecycle
> settle/publish/resettle/void là chuyện CỦA KỲ, không phải của từng kiểu cược.
>
> **Lớp 2 (`markets`)** = đóng/mở NHẬN CƯỢC từng bảng trong khi kỳ đang bán. Grain = `(playType, position, betMode)`
> — đúng grain risk/Bảng Thao Tác Giá (07): bảng nào nóng đóng bảng đó ("Lô đầu exact" nóng → đóng
> `lo.first.exact`, "Lô" và "Lô chẵn/lẻ" vẫn bán).

```ts
/** Trạng thái 1 market (bảng cược) trong kỳ. */
export const LotteryMarketStatus = {
  Open: "open",           // đang nhận cược
  Suspended: "suspended", // tạm dừng (staff pause / auto-throttle risk 07 §4.1 / mất ping Lô Live)
  Closed: "closed",       // đóng hẳn trong kỳ này (không mở lại)
} as const;
export type LotteryMarketStatus = (typeof LotteryMarketStatus)[keyof typeof LotteryMarketStatus];

export interface LotteryDrawMarket {
  status: LotteryMarketStatus;
  /** Lý do đổi trạng thái gần nhất (audit): "manual" | "risk_throttle" | "live_ping_lost" | ... */
  reason?: string;
  /** Staff thao tác gần nhất (audit). */
  updatedBy?: string;
  updatedAt?: Date;
}
```

**Điều kiện nhận cược 1 board (place-bet, 03 §3):**

```
acceptBet(board, draw) =
     draw.status === "salesOpen"                                   // lớp 1
  && now < draw.sales.closeAt
  && draw.markets[marketKey(board)].status === "open"              // lớp 2
```

Quy tắc phối hợp 2 lớp:

| Tình huống | Lớp 1 | Lớp 2 | Kết quả |
|---|---|---|---|
| Kỳ mở bán bình thường | `salesOpen` | market `open` | nhận cược |
| Bảng nóng (risk 07) | `salesOpen` | market đó `suspended` | chặn đúng bảng, bảng khác vẫn bán |
| Kỳ đóng bán chờ quay | `salesClosed` | (bất kể) | chặn tất cả — lớp 1 thắng |
| Lô Live đang quay | `salesClosed` (kỳ thường đã đóng) | `loLive.last.*` = `open` | **ngoại lệ duy nhất**: market `loLive.*` được nhận cược khi `salesClosed`, điều khiển bởi LiveState (05). Các market khác không bao giờ vượt lớp 1. |

- **Khởi tạo `[Chốt]`:** `createDraw` sinh `markets` từ `listMarkets(region)` (§2.5), **seed từ config**:
  `marketRules[viewKey].isEnabled === false` (resolve tenant→global) → khởi tạo `closed`; ngược lại `open`.
  Riêng `loLive.*` luôn khởi tạo `closed` (chỉ mở khi staff `openLive` — 05 §4). Sau khởi tạo, `markets` sống
  độc lập với config — đổi config không lan ngược vào kỳ đã tạo.
- **Suspend hàng loạt:** đóng cả playType = đóng mọi marketKey có prefix `${playType}.` — thao tác UI 1 nút,
  DB vẫn per-market (giữ audit từng bảng).
- **Đóng/mở dài hạn (mọi kỳ)** không nằm ở đây — dùng config `marketRules[viewKey].isEnabled` (02 §2.4);
  `markets` chỉ là trạng thái **runtime trong 1 kỳ**.

---

## 6. Config docs — chi tiết ở `02-config-pricing.md`

- `GlobalConfigDoc` (`scope: "global"`): giá mặc định + payout table + play rules, per (region, playType, betMode).
- `TenantConfigDoc` (`scope: "tenant"`): `commissionRate`, `isEnabled`, override giá + payout + **number surcharge**.

---

## 7. Bảng `picks` grammar theo playType × position × betMode (validate place-bet)

| playType | position | betMode=exact (`picks`) | betMode=parity | betMode=sizes | prizeSelector |
|---|---|---|---|---|:---:|
| `de` | last/first | 1 token 2-số | `["even"\|"odd"]` | `["xiu"\|"tai"]` | ✅ (mặc định special) |
| `lo` | last/first (MB) | ≥1 token 2-số | `["even"\|"odd"]` | `["xiu"\|"tai"]` | — |
| `lo2D7` | last | ≥1 token 2-số | `["even"\|"odd"]` | `["xiu"\|"tai"]` | — |
| `loLive` | last | ≥1 token 2-số | `["even"\|"odd"]` | `["xiu"\|"tai"]` | — (xem 05) |
| `ba3D`, `ba3D17`, `ba3D7` | last | 1 token 3-số | — | — | — |
| `bon4D`, `bon4D16` | last | 1 token 4-số | — | — | — |
| `xien2/3/4` | last | đúng 2/3/4 token 2-số distinct | — | — | — |

> - `position=first` chỉ hợp lệ cho `de`/`lo` (`LOTTERY_POSITION_FIRST_PLAY_TYPES`); MN `lo` chỉ `last`.
> - `prizeSelector` chỉ hợp lệ cho `de` (`LOTTERY_PRIZE_SELECTOR_PLAY_TYPES`); mặc định `{tier:"special",index:0}`.
> - `picks` validate theo grammar §2.3.1 — token exact toàn chữ số, token parity/sizes là từ khoá; parity/sizes đúng 1 token.
> - `ba3D*/bon4D*/xien*` chỉ hỗ trợ `betMode=exact` (theo `LOTTERY_BET_MODES_BY_PLAY_TYPE`).

---

## 8. Type-safety cho embedded documents `[Chốt: v4]`

Doc này định nghĩa nhiều embedded document (`payout`, `entrySummary.boards`, `markets`, `financial`...).
Rủi ro đã nhận diện: **đổi tên field trong entity mà string dot-path trong repo không đổi theo** → MongoDB
âm thầm tạo field mới / filter không match, không có lỗi runtime. Phòng ngừa bằng 4 lớp (theo chuẩn đã có
+ bổ sung mới):

| Lớp | Cơ chế | Nguồn |
|---|---|---|
| 1 | **Named interface** cho mọi embedded doc + repo param dùng named type (compiler bắt thiếu field khi `$set` full) | `entity-typesafe-mongodb.mdc` §1–2 (đã có) |
| 2 | **Typed dot-path**: mọi path lồng cấp trong filter/`$set`/`$inc` **và** aggregate value ref (prefix `$`) đều đi qua `docPath<TDoc>()` từ `@megawin/data/mongo` — 1 helper nhận cả `"path"` lẫn `"$path"`, rename field → compile error ngay tại repo | `mongodb.mdc` §1 + helper `packages/data/src/mongo/dot-path.ts` |
| 3 | **Thiết kế giảm surface**: field hot cho query đặt cấp 1 (`drawId`, `region`, `status`, `financialDate`); embedded doc chỉ ghi-1-lần hoặc ghi trọn (`payout`, `result`, `voidInfo`) → ít partial update lồng cấp | thiết kế 01 (doc này) |
| 4 | **Test 2 tầng**: runtime (`test/**/*.test.ts`, vitest — kiểm identity cả `"path"` lẫn `"$path"`) + compile-time (`test/**/*.type-test.ts`, `@ts-expect-error` cho path sai, kiểm bởi `check-types`) | `packages/data/test/mongo/dot-path.test.ts` + `dot-path.type-test.ts` |

```ts
// Ví dụ trong LotteryEntryRepository:
import { docPath } from "@megawin/data/mongo";
const f = docPath<LotteryTicketEntryDoc>();

// Update path lồng — không $
await this.updateOne(
  { _id: entryId },
  {
    $set: {
      [f("payout.payoutTx")]: tx,        // ✅ compiler validate theo LotteryTicketEntryDoc
      [f("payout.settledAt")]: now,
      updatedAt: now,
    },
  },
);

// Aggregate value ref — cùng helper, truyền chuỗi có sẵn $
await this.aggregate([
  {
    $group: {
      _id: null,
      totalPayout: { $sum: f("$payout.payoutAmount") }, // ✅ khớp 1:1 chuỗi Mongo
      // totalPayout: { $sum: f("payout.payoutAmount") },  // hợp lệ path, nhưng thiếu $ → Mongo hiểu là chuỗi tĩnh (người viết tự đặt $ đúng chỗ)
      // totalPayout: { $sum: f("$payout.payoutAmoun") },  // ❌ typo field
    },
  },
]);
```

> **Vì sao 1 helper cho cả 2 dạng:** `$` không phải thứ helper cần "quyết định" — nó đã nằm sẵn trong
> string người viết gõ, và là ngữ pháp của chính Mongo (aggregate value ref bắt buộc `$`; update key cấm `$`).
> Helper chỉ có 1 việc: validate **phần path** theo `DotPath<TDoc>`. Gộp về `docPath` (biến quy ước `f`) cho gọn,
> không phải nhớ 2 tên.

> **Dynamic key (`markets`)**: `markets` là `Record<LotteryMarketKey, ...>` — segment key không type tĩnh được.
> Build path bằng template literal từ **typed value**: `` `markets.${marketKey}.status` `` với
> `marketKey: LotteryMarketKey` (không nhận string trần).
