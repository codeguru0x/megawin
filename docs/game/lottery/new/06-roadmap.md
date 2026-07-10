# 06 — Package structure, Roadmap & Câu hỏi mở

> File tổng kết: cấu trúc monorepo chuẩn MegaWin cho game `lottery`, phân phase triển khai, và **các quyết định
> product còn treo** cần chốt trước khi code.
>
> **Cập nhật v3:** naming `gameType`→`region`, giữ `playType`; enum `LotteryPlayType` gộp variants (`de`/`lo`
> + `position` + `prizeSelector`); thêm file `07-risk-exposure.md`.
>
> **Cập nhật v4 `[Chốt]`:** (a) selection canonical `picks: string[]` (01 §2.3.1); (b) 2 lớp trạng thái
> `DrawStatus` × `draw.markets` (01 §5.1); (c) `MarketRulesTable` theo viewKey (02 §2.4); (d) Lô Live = market,
> LiveState đồng bộ vào `draw.markets` (05 §4.3); (e) `viewKey`/`marketKey` là trục định danh xuyên suốt
> config–market–risk–report (01 §2.5, 07 §5.1).

---

## 1. Cấu trúc package (mirror `game-bingo18` — game gần xổ số nhất)

```
packages/
  game-lottery/                      @megawin/game-lottery         (domain thuần, no I/O)
    src/
      entities/       index.ts       LotteryTicketDoc, LotteryTicketEntryDoc, LotteryDrawDoc,
                                     LotteryGlobalConfigDoc, LotteryTenantConfigDoc,
                                     LotteryLiveStateDoc, LotteryLivePriceDoc, LotteryTermDoc
      enums.ts                       LotteryRegion, LotteryPlayType, LotteryBetMode, LotteryPrizeTier,
                                     LotteryNumberPosition, LotteryParityPick, LotterySizePick,
                                     LotteryMarketStatus, LotteryCollections, LotteryLiveStatus, LotteryLiveEvents
      rules/          index.ts       validate board theo (region, playType, position, betMode); grammar picks (01 §2.3.1);
                                     buildMarketKey/buildViewKey (01 §2.5); resolve market rules (02 §2.4)
      helpers/        index.ts       getNumberFrequence, cắt số đầu/đuôi, tính payout Live, matcher per betMode (04 §3)
      schemas/        index.ts       Zod schema board input (mirror place-bet handler)
      labels/         index.ts       nhãn tiếng Việt cho playType/betMode/prizeTier + report views catalog (07 §5.1)
      indexes/        index.ts       Mongo index definitions

  game-lottery-application/          @megawin/game-lottery-application  (infra + use-cases)
    src/
      use-cases/
        place-bet/       place-bet.ts, dto/, index.ts
        draws/           create-draw, open-sales, close-sales, trigger-settle, void-draw, update-schedule,
                         **update-market-status** (đóng/mở/suspend từng market trong kỳ — 01 §5.1)
        settle/          prepare-settle, settle-entries, calculate-financials, build-settle-report, types.ts
        result/          publish-result (staff nhập tay), validate-result
        live/            open-live, close-prize, close-live, make-odds, ping   ← Lô Live
        void/            build-void-report, enqueue-dispatch-refunds
        resettle/        prepare-resettle, enqueue-reversals
        player/          list-tickets, get-ticket-entries, list-draw-results, mappers/
        feed/            build tenant feed (snapshot commissionRate/commissionAmount)
        game-config/     get/set global config
        tenant-config/   get/set tenant config + pricing overrides + numberSurcharge + market rules (02 §2.4)
        operations/      live entries, winning entries, tenant breakdown
        reports/         outstanding, settle daily, void reports
      infras/
        repos/           MongoDB repos (lottery DB)
        mappers/         Doc ↔ Entity
      services/          payout dispatch, event publish
```

```
apps/
  worker-lottery/                    @megawin/worker-lottery       (Lambda — settle SFN, payout, live)
```

> **Naming tuân thủ** `.cursor/rules` game hiện có: `*Doc` (Mongo) / `*Entity` (app), `const object as const` cho
> enum, integer VND, `drawId` = `YYYY-MM-DD.NNN`, `camelCase`, unified `boards[]`.
>
> **Không** đụng `pnpm-workspace.yaml` / `turbo.json`. Deploy per-app bằng `turbo --filter=@megawin/worker-lottery...`.

---

## 2. Roadmap theo phase

### Phase 1 — Core MB + MN + Lô Live (MVP đầy đủ)

| Hạng mục | Nội dung |
|---|---|
| Domain | 4 đài (MB 27 giải, MN 18A/B/C 18 giải); toàn bộ playType + position + betMode đã chốt ở `00`; `picks` canonical |
| Config/Pricing | GlobalConfig + TenantConfig + `pricePerPoint` + `payout` + `numberSurcharge` (3-tier) + `marketRules` theo viewKey |
| Place-bet | State machine pre-paid + multi-term; WAL crash-safe; snapshot pricing + commissionRate; check 2 lớp market status |
| Result | Staff nhập tay qua backoffice (`PublishResult`); validate cơ cấu giải |
| Settle | SFN pipeline: settle-entries → calculate-financials → dispatch payouts → finalize |
| Lô Live | `make-odds` + open/closePrize/closeLive + payout tăng theo remain (chỉ MB); LiveState đồng bộ `draw.markets` |
| Risk | AggregateRisk worker + Bảng Thao Tác Giá + report views catalog (`07`) |
| Feed | Snapshot `commissionRate`/`commissionAmount` ra tenant feed (tenant tự chia thầu) |
| Player API | list draws/results (kèm trạng thái markets), place-bet, list tickets, get entries |
| Backoffice | tạo kỳ, mở/đóng bán, **đóng/mở từng market**, nhập kết quả, vận hành Live, cấu hình giá/market rules/tenant |

### Phase 2 — Vận hành nâng cao
- Void/cancel draw + refund pipeline; resettle (đối soát sai kết quả).
- Reports: outstanding, settle daily, void reports (mirror bingo18 `reports/`).
- Auto-import kết quả (thay staff nhập tay) từ nguồn xổ số chính thức — **nếu** có nguồn đáng tin.

### Phase 3 — Player SDK & tối ưu
- `@megawin/player-sdk` module `lottery` (theo `player-sdk-jsdoc.mdc`): enums, types, `LotteryApi`, endpoints,
  CHANGELOG, README, TypeDoc.
- Realtime payout Live cho client (WebSocket/SSE) từ `LOTTERY_LO_LIVE_*` events.

---

## 3. Đã LƯỢC BỎ so với ref (tổng hợp toàn bộ)

| Ref | Lý do bỏ |
|---|---|
| Thầu đa cấp giữa đại lý (`ShareHolder`, `ancestorBookKeepingResult`) | MegaWin thuần B2B — tenant tự xử lý hoa hồng |
| Cấu hình đại lý / user-game-setting theo cấp | Không có khái niệm đại lý trong core |
| Tính tiền thanh toán **sau** (`WinLose = Result − NetAmount`) | MegaWin **pre-paid**: `payAmount` thu trước, chỉ có `winAmount`/`payoutAmount` |
| Miền Bắc 2 | Gộp 3D/4D đuôi vào Miền Bắc |
| Thần Tài, Đề đầu Thần Tài | Bỏ theo yêu cầu |
| Lô Trượt, Đề Trượt | Bỏ theo yêu cầu |
| Giá bán nhảy động theo cầu (extra-price / lo-live change-by-point) | Giá **cố định** per-tenant; chỉ payout Live tăng theo remain |
| Stop-number theo cấp đại lý | Nếu cần → giữ dạng đơn giản (giới hạn ở PlayRules), không theo cấp |

---

## 4. Câu hỏi mở còn treo (cần chốt trước khi code)

1. **Hằng số Lô Live** (`05` §3): giá trị `minProfit`, `maxProfit`, và payout mục tiêu tại `remain=1` (= payout Đề
   chính xác bao nhiêu?). Cần bảng số cụ thể để `make-odds`.
2. **`numberSurcharge` scope** (`02` §5.1): phụ giá theo số key theo `region → playType → position → number`
   (CÓ chiều `position` để khớp bảng risk 07; KHÔNG theo `betMode` — chỉ áp exact). Xác nhận có cần phân biệt
   theo đài (mỗi đài surcharge riêng) đúng như thiết kế, hay dùng chung mọi đài?
3. **Point trên multi-number board** (`02` §5.2): với Lô nhiều số / Xiên, `point` áp cho **từng số** hay cho **cả
   board**? Ảnh hưởng công thức `payAmount`.
4. **Giới hạn multi-term** (`03`): `maxDrawCount` = bao nhiêu kỳ/vé? (đã chốt cho phép mix nhiều đài + nhiều ngày;
   đã chốt chặn kỳ đã settle & kiểm số đơn pending — chỉ cần con số giới hạn cụ thể).
5. **Cơ cấu giải chính xác từng đài** (`04` §1): xác nhận số lượng vé & độ dài mỗi hạng cho MB (27 giải) và MN
   18A/B/C (18 giải) đúng chuẩn xổ số VN hiện hành (để validate `PublishResult`).
6. **Payout mặc định (odds) từng (playType, betMode)** (`02` §7): bảng odds gốc — exact (Đề, Lô, Xiên 2/3/4, 3D/4D)
   và parity/sizes (chẵn-lẻ, tài-xỉu) — cần product cung cấp số cụ thể cho GlobalConfig.
7. **"Theo giải chọn"** (`00`, `04`): `[Chốt]` player chọn **bất kỳ hạng giải nào** (từ Đặc biệt tới giải 7 MB /
   giải 8 MN) qua `prizeSelector`; mặc định Đặc biệt. `index` trong phạm vi số bộ của hạng đó (validate ở place-bet).

---

## 5. Tài liệu bộ này

| File | Nội dung |
|---|---|
| `00-tong-quan.md` | Phạm vi, vai trò RGS, region/playType/position/betMode, mô hình giá bán |
| `01-domain-model.md` | Entities, enums, `picks` canonical, marketKey/viewKey, 2 lớp DrawStatus × markets, ticket/entry docs |
| `02-config-pricing.md` | pricePerPoint vs payout, 3-tier override, numberSurcharge, MarketRulesTable theo viewKey |
| `03-placebet.md` | State machine pre-paid, multi-term, validate 2 lớp market + grammar picks, công thức tính tiền |
| `04-result-settle.md` | Kết quả MB27/MN18, dò trúng theo picks, settle SFN pipeline |
| `05-lolive.md` | Lô Live MB: payout động theo remain, LiveState ↔ draw.markets, luồng closePrize |
| `06-roadmap.md` | Package structure, phases, câu hỏi mở |
| `07-risk-exposure.md` | Bảng Thao Tác Giá: risk theo `(region, playType, position, betMode, pick)`, công thức Đề/Lô-family, report views catalog |
