# 02 — Config & Pricing (`game-lottery`)

> Mô hình cấu hình **kế thừa pattern Keno** (`GlobalConfigDoc` + `TenantConfigDoc` với `PrizeOverrides`), mở rộng
> cho lottery: **giá bán mỗi điểm** (`pricePerPoint`) + **payout (odds)** + **number surcharge** (tăng giá theo con số).
> Nguồn: `packages/game-keno/src/entities/types.ts` (`KenoPrizeOverrides`, `FinancialRates`, `PlayRules`).
>
> **Cập nhật v3:** naming `gameType`→`region`, giữ `playType`; bảng giá/payout thêm chiều **`betMode`**
> (exact/parity/sizes có odds khác nhau — chẵn/lẻ, tài/xỉu trả thấp hơn exact). Position (đầu/đuôi) **không** tách
> giá base/payout riêng (Đề đầu = Đề, Lô đầu = Lô về giá/odds) — riêng **`numberSurcharge` CÓ chiều position**
> để khớp bảng risk (07) — xem §5, §7.
>
> **Cập nhật v4 `[Chốt]`:** thêm **`MarketRulesTable`** index theo **`viewKey`** (`${region}.${playType}.${position}.${betMode}`
> — 01 §2.5): override payout per-market, min/max point per market, **trần nhận cược 1 con số** (`maxPointPerNumber`),
> flag `isEnabled` (đóng dài hạn), và chỗ để sẵn cho auto-surcharge (Phase 2). Xem §2.4.

---

## 1. Hai khái niệm tách bạch: GIÁ BÁN vs PAYOUT

| | Giá bán (`pricePerPoint`) | Payout (odds) |
|---|---|---|
| Ý nghĩa | Tiền player trả cho **1 điểm** (VND) | Tỉ lệ trả thưởng khi trúng (VD Đề "1 ăn 99") |
| Ảnh hưởng | `payAmount = pricePerPoint × point` (tổng qua các kỳ) | `winAmount = payout × point × [nháy nếu exact+Lô]` |
| Ai chỉnh | Công ty (global + per-tenant + per-number) | Công ty (global + per-tenant, theo betMode) |
| `[Chốt]` | Cố định, không nhảy tự động | Cố định (trừ Lô Live tăng theo giải còn lại — xem 05) |

> **Cực kỳ quan trọng — không lẫn lộn:** ref gọi "giá bán" là `NewPrice`/`Price` (tiền/điểm), và "tỉ lệ" là `Payouts`.
> MegaWin giữ đúng 2 khái niệm này: `pricePerPoint` và `payout`.

---

## 2. Shared pricing types (`packages/game-lottery/src/entities/types.ts`)

```ts
/**
 * Giá bán mỗi điểm (VND) theo (region, playType).
 * Key ngoài = region, key trong = playType → giá/điểm.
 * Giá KHÔNG phụ thuộc betMode/position (chẵn/lẻ, tài/xỉu, đầu/đuôi vẫn trả tiền/điểm như exact — chỉ payout theo betMode).
 * MongoDB/JSON serialize key là string.
 *
 * @example { "mienBac": { "de": 700, "lo": 700, "ba3D": 700 } }
 */
export type PricePerPointTable = Record<string, Record<string, number>>;

/**
 * Bảng payout (odds) theo (region, playType, betMode).
 * Value = hệ số trả thưởng trên 1 điểm. exact cao nhất; parity/sizes thấp hơn.
 * KHÔNG index theo position: "Lô đầu"/"Đề đầu" dùng chung odds với "Lô"/"Đề" (xác suất trúng như nhau).
 *
 * @example
 * {
 *   "mienBac": {
 *     "de":  { "exact": 99, "parity": 1.9, "sizes": 1.9 },
 *     "lo":  { "exact": 99, "parity": 1.9, "sizes": 1.9 },
 *     "ba3D":{ "exact": 960 },
 *     "bon4D":{ "exact": 9600 }
 *   }
 * }
 */
export type PayoutTable = Record<string, Record<string, Record<string, number>>>;

/**
 * Phụ phí theo CON SỐ cụ thể — tăng giá bán cho 1 số trong 1 bảng (region, playType, position).
 * Cộng THÊM vào pricePerPoint đã resolve. Không phụ thuộc betMode (chỉ áp betMode=exact).
 *
 * CÓ chiều position — khớp 1-1 với bảng risk/Bảng Thao Tác Giá (07): staff thấy bảng nào nóng
 * thì tăng giá đúng bảng đó ("Lô đầu 27" nóng → chỉ tăng lo/first/27, không đụng "Lô 27").
 *
 * Key path: region → playType → position → number(string) → phụ phí (VND, có thể âm để giảm).
 *
 * @example { "mienBac": { "lo": { "last": { "00": 5, "99": 10 }, "first": { "27": 5 } } } }
 */
export type NumberSurchargeTable = Record<string, Record<string, Record<string, Record<string, number>>>>;

/** Tỉ lệ tài chính — như Keno. */
export interface FinancialRates {
  /** Hoa hồng mặc định [0,1] cho tenant chưa có TenantConfig. */
  defaultCommissionRate: number;
}

/**
 * Quy tắc riêng cho 1 market (bảng cược) — index theo viewKey (01 §2.5).
 * Field nào không set → fallback quy tắc chung (LotteryPlayRules / PayoutTable).
 * Đây là chỗ mở rộng config theo market mà KHÔNG phình schema từng bảng riêng lẻ.
 */
export interface LotteryMarketRules {
  /** Đóng market DÀI HẠN (mọi kỳ). Khác markets runtime trên draw (01 §5.1). Mặc định true. */
  isEnabled?: boolean;
  /** Override payout riêng cho market này (ưu tiên trên PayoutTable). VD Lô đầu muốn odds khác Lô. */
  payout?: number;
  /** Điểm min/max mỗi board của market này (override LotteryPlayRules.min/maxPointPerBoard). */
  minPointPerBoard?: number;
  maxPointPerBoard?: number;
  /**
   * TRẦN nhận cược trên 1 con số/pick (Σ point toàn kỳ, per tenant) — chặn dồn cược 1 con.
   * Vượt trần → từ chối bet mới cho con đó (soft-stop, liên kết risk 07 §4.1). Không set = không trần.
   */
  maxPointPerNumber?: number;
  /**
   * Cấu hình tăng/giảm giá TỰ ĐỘNG theo risk (Phase 2 — flag để sẵn, mặc định tắt `[Chốt]`).
   * Khi bật: worker risk (07 §4) tự đề xuất/áp surcharge khi expectedRisk vượt ngưỡng.
   */
  autoSurcharge?: { enabled: boolean; stepVnd: number; maxSurchargeVnd: number };
}

/** Bảng quy tắc market — key = viewKey `${region}.${playType}.${position}.${betMode}`. */
export type MarketRulesTable = Record<string, LotteryMarketRules>;

/**
 * Override cấu hình giá/payout cho tenant — subset cần ghi đè.
 * Dùng chung Global (default) & Tenant (override). Field không set → fallback global.
 */
export interface LotteryPricingOverrides {
  /** Giá bán/điểm theo (region, playType). */
  pricePerPoint?: PricePerPointTable;
  /** Payout (odds) theo (region, playType, betMode). */
  payouts?: PayoutTable;
  /** Phụ phí theo con số. */
  numberSurcharge?: NumberSurchargeTable;
  /** Quy tắc riêng từng market (viewKey) — payout override, min/max, trần 1 con, auto-surcharge. §2.4 */
  marketRules?: MarketRulesTable;
}

/** Quy tắc chơi — subset PlayRules của Keno, bỏ field không hợp lottery. */
export interface LotteryPlayRules {
  /** Số board tối đa trên 1 vé. */
  maxBoardsPerTicket: number;
  /** Điểm tối thiểu / tối đa mỗi board. */
  minPointPerBoard: number;
  maxPointPerBoard: number;
  /** Số kỳ tối đa mua cùng lúc (multi-term). */
  maxDrawCount: number;
  /** Đóng bán trước giờ quay (giây). */
  salesCloseBeforeSeconds: number;
  timezone: string;
}
```

### 2.4 `MarketRulesTable` — config mở rộng theo market (viewKey) `[Chốt: v4]`

**Phân tầng rõ ràng — config CỐ ĐỊNH vs công tắc RUNTIME:**

| Tầng | Sống ở đâu | Bản chất | Ai đổi, khi nào |
|---|---|---|---|
| 1. `GlobalConfigDoc.pricing` | config collection | **Chuẩn chung của game**: giá bán, payout, market rules mặc định cho MỌI tenant | MegaWin, ít khi |
| 2. `TenantConfigDoc.pricing` | config collection | **Override theo tenant**, cùng shape — tenant nào có set thì dùng, không set → fallback global | MegaWin per hợp đồng tenant |
| 3. `draw.markets` | trên TỪNG draw doc | **Công tắc runtime trong 1 kỳ** — KHÔNG phải config. Khởi tạo từ tầng 1-2 khi `createDraw`, sau đó staff đóng/mở tay theo diễn biến phiên | Staff vận hành, trong phiên |

> Trả lời câu hỏi "config riêng mỗi draw?": **KHÔNG.** Giá bán/payout/quy tắc KHÔNG cấu hình per-draw — chúng cố định
> ở Global và override per-tenant theo viewKey. `draw.markets` chỉ là **trạng thái đóng/mở nhận cược runtime**
> (như breaker), snapshot từ config lúc `createDraw` (01 §5.1); đổi config KHÔNG ảnh hưởng kỳ đã tạo.

Ba nhóm config bổ trợ nhau, không giẫm chân:

| Tầng | Grain | Đổi khi nào | Ví dụ |
|---|---|---|---|
| `PricePerPointTable` / `PayoutTable` | (region, playType[, betMode]) | ít khi | giá Lô MB 700đ, Đề exact ăn 99 |
| **`MarketRulesTable`** | **viewKey** (region.playType.position.betMode) | theo chính sách | Lô đầu payout riêng, trần 1 con 5000 điểm, đóng dài hạn `de.last.sizes` |
| `NumberSurchargeTable` | (region, playType, position, number) | theo phiên/risk | tăng con `00` Lô đuôi +10đ |

Thứ tự resolve payout (chi tiết ở §5): marketRules tenant → marketRules global → payouts tenant → payouts global.

> `isEnabled=false` trong marketRules = **đóng dài hạn** (mọi kỳ, VD chưa muốn mở "Đề tài/xỉu"). Khác với
> `draw.markets[key].status` = đóng/mở **runtime trong 1 kỳ** (01 §5.1). Place-bet check cả hai.
> `maxPointPerNumber` enforcement dùng số liệu `LotteryRiskDoc.numberPoint` (07) — xem 03 §3.

---

## 3. GlobalConfigDoc (`scope: "global"`)

```ts
export interface GlobalConfigDoc {
  _id: unknown;
  scope: typeof GameConfigScope.Global;
  tenantId: null;

  rates: FinancialRates;

  /** Giá + payout + surcharge MẶC ĐỊNH (dùng LotteryPricingOverrides để đồng nhất shape). */
  pricing: LotteryPricingOverrides; // ở global, các field coi như bắt buộc đầy đủ

  play: LotteryPlayRules;

  version: number;
  createdAt: Date;
  updatedAt: Date;
}
```

> Global là **source of truth** cho mọi (region, playType, betMode). Backoffice MegaWin quản lý.

---

## 4. TenantConfigDoc (`scope: "tenant"`)

```ts
export interface TenantConfigDoc {
  _id: unknown;
  scope: typeof GameConfigScope.Tenant;
  tenantId: string;

  /** Hoa hồng đại lý (snapshot vào entry.tenant.commissionRate). */
  commissionRate: number;
  /** Tenant có được chơi lottery không. */
  isEnabled: boolean;

  /** Override giá/payout/surcharge — chỉ field muốn khác global. */
  pricingOverrides?: LotteryPricingOverrides;

  version: number;
  createdAt: Date;
  updatedAt: Date;
}
```

> **Bám sát pattern Keno:** Keno để `commissionRate` + `isEnabled` + `prizeOverrides` ở TenantConfig. Ta thay
> `prizeOverrides` bằng `pricingOverrides` (giá + payout + surcharge).

---

## 5. Thuật toán RESOLVE giá cuối cùng (place-bet)

Cho 1 board `(region, playType, position, betMode, number, point)` của tenant `T`:

```
1. base       = tenant.pricingOverrides?.pricePerPoint?[region]?[playType]
                ?? global.pricing.pricePerPoint[region][playType]

2. surcharge  = resolveSurcharge(region, playType, position, number)   // xem §5.1 (chỉ khi betMode=exact có number)

3. pricePerPoint = base + surcharge

4. payAmount  = pricePerPoint × point   (tổng vé cộng qua các kỳ)
```

> Giá **base** và **payout** index theo `playType` — KHÔNG theo `position` ("Lô đầu" cùng giá base/odds với "Lô",
> vì xác suất trúng như nhau). Riêng **surcharge** CÓ chiều `position` (§5.1) — công cụ tinh chỉnh theo đúng
> bảng risk đang nóng.

Payout resolve theo **viewKey → betMode** (4 tầng, ưu tiên marketRules — xem §2.4):

```
viewKey = `${region}.${playType}.${position}.${betMode}`

payout = tenant.pricingOverrides?.marketRules?[viewKey]?.payout      // 1. market override tenant
       ?? global.pricing.marketRules?[viewKey]?.payout               // 2. market override global
       ?? tenant.pricingOverrides?.payouts?[region]?[playType]?[betMode]  // 3. bảng payout tenant
       ?? global.pricing.payouts[region][playType][betMode]          // 4. bảng payout global
```

Min/max point per board resolve tương tự: `marketRules[viewKey].min/maxPointPerBoard` → `LotteryPlayRules.min/maxPointPerBoard`.

### 5.1 Resolve number surcharge (ưu tiên tenant → global)

```
tenantSur = tenant.pricingOverrides?.numberSurcharge?[region]?[playType]?[position]?[number]
globalSur = global.pricing.numberSurcharge?[region]?[playType]?[position]?[number]
surcharge = tenantSur ?? globalSur ?? 0
```

> Surcharge chỉ áp khi `betMode=exact` (có số cụ thể). `parity`/`sizes` không có `number` → surcharge = 0.

> **`[Chốt]` ví dụ:** Lô MB giá global 700đ. Công ty tăng số `00` (Lô đuôi) toàn hệ thống +5đ →
> `globalSur["mienBac"]["lo"]["last"]["00"] = 5`. Riêng tenant `t1` muốn số `00` +10đ →
> `tenant.pricingOverrides.numberSurcharge["mienBac"]["lo"]["last"]["00"] = 10`.
> Player của `t1` cược Lô `00`: `pricePerPoint = 700 + 10 = 710`. Player tenant khác: `700 + 5 = 705`.
> "Lô đầu 00" (`lo`/`first`) KHÔNG bị ảnh hưởng — muốn tăng phải set key `["first"]["00"]` riêng.

### 5.2 Với multi-number board (Lô nhiều số / Xiên)

- **Lô** có nhiều số trong 1 board: mỗi số resolve giá riêng (vì surcharge theo từng số) →
  `payAmount = Σ_number (pricePerPoint(number) × point)`. **Cần chốt** point áp cho từng số hay cả board (xem `06`).
- **Xiên**: 1 tổ hợp = 1 đơn vị cược; surcharge (nếu có) tính theo quy tắc riêng — **cần chốt**.

---

## 6. Snapshot vào board lúc place-bet (bất biến khi settle)

Sau resolve, ghi vào `LotteryBoard`:

```ts
board.pricePerPoint = <resolved>;  // gồm cả surcharge
board.payout        = <resolved payout>;
```

→ Kết sổ đọc `board.payout` + `board.point`, KHÔNG đọc config hiện tại. An toàn khi công ty đổi giá về sau.

---

## 7. Payout table gợi ý (căn cứ ref — cần product xác nhận số cụ thể)

> Đây là **khung**; giá trị chính xác lấy từ bảng tỉ lệ hiện hành của công ty. Liệt kê để làm rõ cần config gì.

| playType | betMode | Đơn vị payout | Ghi chú |
|---|---|---|---|
| `de` (mọi position + prizeSelector) | exact | ~1 ăn 99 | trúng 2 số 1 giải |
| (như trên) | parity / sizes | ~1 ăn 1.9x | nhị phân 50/50, thấp hơn exact |
| `lo`, `lo2D7` | exact | ~1 ăn 99 (×nháy) | có nháy |
| `lo`, `lo2D7` | parity / sizes | ~1 ăn 1.9x | so giải chuẩn, không nháy |
| `ba3D`, `ba3D17`, `ba3D7` | exact | cao hơn (3 số) | |
| `bon4D`, `bon4D16` | exact | cao nhất (4 số) | |
| `xien2/3/4` | exact | tăng theo số phần tử | |
| `loLive` | exact / parity / sizes | biến thiên theo remain | xem `05` |

> Payout Lô Live **không cố định** — biến thiên theo số giải còn lại (xem `05-lolive.md`).
> **Giá bán Lô Live không cấu hình riêng** — kế thừa giá Lô MB (gồm surcharge) tại `makeOdds` (xem `05` §3.1).

---

## 8. Những field config của ref đã LƯỢC BỎ

| Field ref | Xử lý |
|---|---|
| `AutomaticPrice`, `RelationshipPrice`, `PriceAutoSetting` | Bỏ — giá cố định |
| `ExtraPrice` động theo cầu | Thay bằng `numberSurcharge` tĩnh |
| `ShareHolder`, `Percent`, `Income` (thầu) | Bỏ khỏi core |
| Dealer config đa cấp | Bỏ — chỉ `commissionRate` phẳng |
| `UserGameSetting` (max/total point per user) | **Cân nhắc giữ** dạng đơn giản per-tenant (limit) — xem `06` |
