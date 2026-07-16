# 04 — Extra Price (Giá cược tăng cường) & Bảng thao tác giá

**Mục đích**: quản lý phần **giá tăng thêm** trên mỗi con số (ngoài giá bán gốc từ `share-holder`). Là công cụ chính để nhà cái điều tiết rủi ro theo từng con số.

Đường dẫn: `server/src/services/lottery/services/extra-price`.

**Giá tăng tổng của 1 số = `ManualPrice + AutomaticPrice + RelationshipPrice`** (của user + cộng dồn các cấp cha).

Có 3 nguồn tăng giá độc lập cộng dồn:

- **Manual** — người quản lý gõ tay ở bảng thao tác giá (công ty được phép tăng âm; cấp dưới bắt buộc ≥ 0).
- **Automatic** — worker Step Functions tự tăng theo điểm/rủi ro/điểm-trung-bình; riêng MB1-LoLive tăng qua SQS.
- **Relationship** — tăng bị động: MB1 (Đề/Lô) đổi giá thì MB2 (2D-Đuôi / 2D-27Lô) đổi theo.

---

## A. Entity `ExtraPriceEntity` — collection `extraPrices`

`infrastructure/entities/extra-price-entity.ts`

| Field                             | Kiểu   | Ý nghĩa                                                                                                                                | Line  |
| --------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `UserId, Term, GameType, BetType` |        | Khóa định danh                                                                                                                         | 15-18 |
| `Number`                          | string | Số bị đổi giá 00-99                                                                                                                    | 25    |
| `ManualPrice`                     | number | Giá tăng tay (công ty có thể âm; cấp dưới ≥ 0)                                                                                         | 56    |
| `AutomaticPrice`                  | number | Giá tăng tự động (≥ 0)                                                                                                                 | 63    |
| `RelationshipPrice`               | number | Giá tăng theo quan hệ MB1↔MB2 (≥ 0)                                                                                                    | 70    |
| `LiveAutomaticException?`         | number | Ngưỡng ngoại lệ Live: khi có kết quả về mà xoá auto, lưu AutomaticPrice hiện tại; lần tăng sau chỉ tăng nếu giá tính được > ngưỡng này | 81    |
| `CreatedAt`                       | Date   |                                                                                                                                        | 88    |
| `UpdatedAt`                       | Date   | Dùng TTL index                                                                                                                         | 96    |

`enum ExtraPriceChangeType`: `Manual=0`, `Automatic=1`, `Relationship=2`.

---

## B. Công thức giá khi tăng TAY — `updateManualExtraPrice` (`services/extra-price-service.ts:205`)

```typescript
newExtraPrice =
    nrExpr.Price -
    buyPrice -
    totalAncestorExtraPrice -
    totalUserAnotherExtraPrice;
```

- `nrExpr.Price` = giá mong muốn của số.
- `buyPrice` = giá gốc (`shareHolderService.getBuyingPrice`, hoặc `liveBasePriceService.getPriceByGameType` với LoLive).
- `totalAncestorExtraPrice` = Σ (Manual+Automatic+Relationship) của các cấp cha.
- `totalUserAnotherExtraPrice` = `AutomaticPrice + RelationshipPrice` của chính user.

### Ràng buộc theo cấp (`extra-price-service.ts:213`)

```typescript
if (param.userLevel !== UserCustomerLevel.Company) {
    if (newExtraPrice < 0 || newExtraPrice > parameter.MaxManualIncPointPerLevel) {
        Guard.throw(...);
    }
} else {
    // Tài khoản công ty: kiểm tra theo MaxExtraPrice * 3
    if (newExtraPrice < 0 || newExtraPrice > parameter.MaxExtraPrice * 3) {
        Guard.throw(...);
    }
}
```

- **Cấp dưới công ty**: `0 ≤ newExtraPrice ≤ MaxManualIncPointPerLevel`.
- **Công ty**: `0 ≤ newExtraPrice ≤ MaxExtraPrice * 3`.

---

## C. Cấu hình tăng tự động — `PriceAutoSettingEntity` — collection `priceAutoSettings`

- `Type: AutoChangePriceType` — `None=0, Point=1, Risk=2, PointAvg=3`.
- `Risks: {Start<0, End<0, Step<0, Point≥0}[]`
- `Points: {Start>0, End>0, Step>0, Point≥0}[]`
- `PointAvg: {Start, Step, Point}`
- Đóng số: `CloseAtRisk≤0`, `CloseAtPoint≥0`, `CloseAtPointAboveAvg≥0`, `TotalCompanyPointAvg`, `CloseAtPointForAll`.

Cache: `lottery:extra_price:price_auto_setting:{gt}:{bt}:{userId}`, TTL 5 phút.

---

## D. Công thức tăng giá TỰ ĐỘNG

### D.1 Theo điểm thầu — `change-by-point.ts:77`

```typescript
if (singleNumber.Point > pointSetting.End) {
    changePrice +=
        _.floor((pointSetting.End - pointSetting.Start) / pointSetting.Step) *
        pointSetting.Point;
}
if (
    singleNumber.Point >= pointSetting.Start &&
    singleNumber.Point <= pointSetting.End
) {
    changePrice +=
        _.floor((singleNumber.Point - pointSetting.Start) / pointSetting.Step) *
        pointSetting.Point;
}
```

Cộng dồn qua các khoảng → cộng ngoại lệ → kẹp `0 ≤ changePrice ≤ MaxExtraPrice`.

### D.2 Theo rủi ro — `change-by-risk.ts:96` (`riskAmount = LotteryRiskHelper.getRiskForPriceManagement`)

```typescript
if (riskAmount < riskSetting.End) {
    changePrice +=
        _.floor((riskSetting.End - riskSetting.Start) / riskSetting.Step) *
        riskSetting.Point;
}
if (riskAmount <= riskSetting.Start && riskAmount >= riskSetting.End) {
    changePrice +=
        _.floor((riskAmount - riskSetting.Start) / riskSetting.Step) *
        riskSetting.Point;
}
```

Đóng số khi `CloseAtRisk < 0 && riskAmount <= CloseAtRisk`.

### D.3 Theo điểm trung bình — `change-by-point-avg.ts:80` (`pointAvg = Σ Point / 100`)

```typescript
changePrice =
    _.floor(
        (singleNumber.Point - pointAvg - payload.PointAvg.Start) /
            payload.PointAvg.Step,
    ) * payload.PointAvg.Point;
```

### D.4 Lô Live theo điểm — `lo-live-change-by-point.ts:235` (SQS, chỉ MB1-LoLive)

```typescript
const point = _.ceil(
    companyShareHolder.SellPrice * (pointSetting.Point / 1000),
);
```

Điểm tăng `point` tính theo giá bán công ty (‰), cộng dồn qua các khoảng như D.1. Đóng số nếu `CloseAtPoint > 0 && singleNumber.Point >= CloseAtPoint`.

---

## E. Công thức RISK lõi — `common/helpers/lottery-risk-helper.ts`

```309:352:server/src/services/lottery/common/helpers/lottery-risk-helper.ts
    getRiskForDe(totalIncome, numberPoint, payouts): number {
        return totalIncome - numberPoint * payouts;
    },
    getRiskForLo(totalPoint, numberPoint, payouts): number {
        return _.round(((totalPoint - numberPoint) / 99.0 - numberPoint) * payouts);
    },
    getRiskFor3DLo(totalPoint, numberPoint, payouts): number {
        return _.round(((totalPoint - numberPoint) / 999 - numberPoint) * payouts);
    },
    getRiskFor4DLo(totalPoint, numberPoint, payouts): number {
        return _.round(((totalPoint - numberPoint) / 9999 - numberPoint) * payouts);
    },
```

**Diễn giải**:

- `numberPoint` = điểm đã cược vào số; `payouts` = tỷ lệ trả thưởng; `totalIncome`/`totalPoint` = tổng thu/tổng điểm.
- Risk > 0 = nhà cái lời nếu số về; Risk < 0 = nhà cái lỗ.
- Đề tính theo **tiền**; Lô tính theo **điểm**, chia 99/999/9999 phản ánh xác suất về của lô 2D/3D/4D (số bảng con).

**Mapping BetType → công thức** (`getRisk` line 20, `getRiskForPriceManagement` line 211):

- **MB1**: `De, DeDau, DeGiaiNhat, DeDauGiaiNhat, DeThanTai4, DeDauThanTai4` → Đề; `Lo, LoDau, Xien2/3/4` → Lô.
- **MB2**: `HaiDDuoi, BaDDau, BaDDuoi, BonDDuoi` → Đề; `HaiDDau, HaiD27Lo, Xien2/3/4` → Lô; `BaD23Lo` → 3DLo; `BonD20Lo` → 4DLo.
- **MN18A/B/C**: `HaiDDau, HaiDDuoi, BaDDau, BaDDuoi, BonDDuoi` → Đề; `HaiD18Lo, HaiD18LoDau, HaiD7Lo, Xien2/3/4` → Lô; `BaD17Lo, BaD7Lo` → 3DLo; `BonD16Lo` → 4DLo.
- **MN18Ava18B**: chỉ `Xien2/3/4` → Lô.

> `getRiskForPriceManagement` chỉ xử lý Đề/Lô cơ bản (không Xiên/3D/4D).

---

## F. Công thức quan hệ MB2 ← MB1 (`extra-price-service.ts`)

### F.1 MB1-Đề → MB2-2D-Đuôi (line 822)

```typescript
ExtraPrice: _.ceil(
    (mb2HaiDDuoiParameter.Price * mb1DeExtraPrice) / mb1DeParameter.Price,
),
```

### F.2 MB1-Lô → MB2-2D-27Lô (line 972, `mb1Price = mb1Parameter.Price + mb1LoExtraPrice`)

```typescript
const delta = 1 - mb1Parameter.Probability * (mb1Parameter.Payouts / mb1Price);
// Giá sẽ bán ra theo quan hệ
const mb2NewPrice = _.ceil(
    mb2Parameter.Payouts / ((1 - delta) / mb2Parameter.Probability),
);
```

`incPrice = mb2NewPrice − mb2CurrentPrice` → set `RelationshipPrice`.

---

## G. Price-Exception & Profile

- `PriceAutoExceptionEntity` — collection `priceAutoExceptions`: `{ UserId, Term, GameType, BetType, Number, Price(+/-) }`. `price===0` → xoá; ≠0 → upsert. Áp vào worker auto để cộng thêm ngoại lệ cho số cụ thể.
- `PriceAutoProfileEntity` — collection `priceAutoProfiles`: `{ UserId, Name, Data: PriceAutoSettingEntity[], Status(idle|running), CreatedAt, TimeApplication? }` — lưu bộ cấu hình auto tái sử dụng.

---

## H. API / Worker / Step Function / SNS

**API agent**:

- `GET /agent/automatic/{GameType}[/{BetType}]`
- `PUT /agent/automatic/{risks|points|point-avg|type}`
- `POST /agent/automatic/{start|stop}-all-workflows`
- Manual: `PUT` với `NumberPrices[]` (max 100), quyền Agent + `WriteBetting`.
- Profile, Price-exception endpoints.

**Workers SQS**: `notify-price-changed`, `update-mienbac2-by-relationship`, `lo-live-change-by-point`.

**Step Functions** `STEP_FUNCTIONS_LOTTERY_EXTRA_PRICE_AUTOMATIC_PRICE_MANAGEMENT`: `init → by-risk / by-point / by-point-avg`, loop qua `NextExecuteName`.

**SNS** `SNS_TOPIC_LOTTERY_EXTRA_PRICE` → `EXTRA_PRICE_CHANGED_EVENT`.

---

## I. Gợi ý khi xây lại

1. **Tách 3 nguồn giá (Manual/Automatic/Relationship)** giúp mỗi cơ chế điều chỉnh độc lập mà không ghi đè lẫn nhau — giữ nguyên cách này.
2. Các bảng khoảng (`Points`, `Risks`) với `Start/End/Step/Point` là mô hình linh hoạt — tăng giá bậc thang theo mức độ rủi ro.
3. **Giới hạn `MaxExtraPrice` / `MaxExtraPricePerLevel`** phải kiểm ở mọi nguồn tăng để tránh giá vượt trần gây lệch payout.
4. Công thức quan hệ MB1↔MB2 dựa trên `Probability` và `Payouts` — nếu Megawin có nhiều đài "liên kết" tương tự thì tổng quát hoá cơ chế này.
