# 03 — Share Holder (Đồng sở hữu / Chia thầu) & Number Share

**Mục đích**: đây là **lõi tài chính** của sản phẩm. Quyết định:

1. **Giá mua vào gốc** của mỗi cấp = `BasePrice + Σ ExtraPrice`.
2. **% chia rủi ro (thầu)** giữa các cấp đại lý — tổng các cấp = 100% (chia hết rủi ro của Player).

`number-share` bổ sung: giới hạn thầu tối đa theo từng con số (chỉ áp dụng cho thầu mềm).

Đường dẫn: `server/src/services/lottery/services/share-holder`.

---

## A. Khái niệm nền tảng

- **Player** luôn "mua" cược ở một giá; toàn bộ rủi ro của Player được các cấp đại lý (Owner→Agent) "ôm" theo %.
- **Thầu cứng (Fixed=true)**: % thầu cố định, cha buộc phải khớp đúng tổng % con.
- **Thầu mềm (Fixed=false)**: % thầu linh hoạt, cha có thể ôm ít hơn, phần dư đẩy lên cấp trên (`remainPercent`).
- **Telescoping**: giá bán cấp dưới = giá cấp trên cộng dồn ExtraPrice; % thầu thực của mỗi cấp = hiệu giữa % của nó và % cấp con.

---

## B. Entity `ShareHolderEntity` — collection `shareHolders`

`infrastructure/entities/share-holder-entity.ts:8`

| Field                           | Kiểu    | Ý nghĩa                                                | Line  |
| ------------------------------- | ------- | ------------------------------------------------------ | ----- |
| `UserId, ParentId, Level, Path` |         | Định danh & cây                                        | 10-13 |
| `GameType, BetType`             | enum    | Đài/kiểu cược                                          | 15-16 |
| `Percent`                       | number  | % tài khoản này được thầu tối đa                       | 23    |
| `ParentPercent`                 | number  | % cha thầu đối với tài khoản này                       | 30    |
| `TotalPercent`                  | number  | `= Percent + ParentPercent`                            | 38    |
| `Fixed`                         | boolean | Thầu **cứng** (true) / **mềm** (false)                 | 45    |
| `BasePrice`                     | number  | Giá mua vào cơ bản theo chuẩn trả thưởng               | 52    |
| `ExtraPrice`                    | number  | Giá cha ngay trên cài thêm (KHÔNG cộng dồn, chỉ 1 cấp) | 60    |
| `Payouts`                       | number  | Tỷ lệ trả thưởng                                       | 67    |
| `PayoutsTypeId`                 | string  | ID chuẩn trả thưởng                                    | 74    |

**View phái sinh `ShareHolderDetail`** (% thầu thực tính ra):

- `Percent` (% thầu thực của cấp, ≤ 100%)
- `ChildrenPercent` (tổng % thầu của các cấp con)
- `Price` (`= BasePrice + Σ ExtraPrice các cấp`)
- `Payouts`

---

## C. Công thức giá mua vào — `getBuyingPrice` (`services/share-holder-service.ts:991`)

```typescript
// Giá bán chính xác cho 1 tài khoản
//   = Giá cơ bản (theo chuẩn trả thưởng) của tk cần tìm + Tổng extra price (cài thêm) của tk đó và các cấp trên
return (
    userShareHolder.BasePrice +
    _.sumBy(shareHolders, (sh) => {
        return sh.ExtraPrice;
    })
);
```

---

## D. Cập nhật thầu — `updateShareHolder` (`share-holder-service.ts`)

Handler `admin-update-user-share-holder.ts` nhận **mảng** cấu hình theo (GameType, BetType); mỗi phần tử:
`{ GameType, BetType, Percent(0-100, làm tròn 1 chữ số), ParentPercent(0-100), Fixed, Price(≥0) }`. Path `UserId` là tài khoản con cần chỉnh. Quyền: Agent-level + `ReadAccount`.

### D.1 Tính `extraPrice` từ giá bán mong muốn (`share-holder-service.ts:868`)

```typescript
const extraPrice =
    param.betType === BetType.LoLive
        ? 0
        : param.price - userShareHolder.BasePrice - ancestorExtraPrice;
```

- Với LoLive: extraPrice luôn 0 (giá lấy từ bảng liveBasePrices theo giải).
- `ancestorExtraPrice` = tổng ExtraPrice các cấp trên.

### D.2 Ràng buộc giá cài thêm

```typescript
// 0 <= extraPrice <= MaxExtraPricePerLevel
// extraPrice + ancestorExtraPrice <= MaxExtraPrice
```

(`share-holder-service.ts:877`)

### D.3 Ràng buộc % thầu cứng / mềm

`TotalPercent = round(Percent + ParentPercent, 4)` (`share-holder-repository.ts:106`).

- **Cha cứng (Fixed)**: `ParentPercent(cha) === round(percent + parentPercent, 4)` — buộc bằng đúng.
- **Cha mềm**: `ParentPercent(cha) >= round(percent + parentPercent, 4)` — cho phép nhỏ hơn.
- **Player**: buộc `Fixed=true`, `Percent=0`.
- `updateChildren=true` → hạ tỷ lệ tài khoản con tương ứng.

---

## E. Chia % thầu thực (telescoping) — `adminGetAncestorsShareHolderOverview` / `getAncestorsShareHolderDetails`

Sort theo Level giảm dần, lặp từ cấp thấp nhất (Player) lên Owner:

- **Thầu cứng**: `percent[i] = Percent[i] − Percent[i-1]` (cộng thêm `remainPercent` dồn lên nếu có).
- **Thầu mềm**: `percent[i] = ParentPercent[i-1]`; phần dư `remainPercent += Percent[i] − ParentPercent[i-1] − Percent[i-1]`.
- **Giá cấp i**: `BasePrice[i] + Σ ExtraPrice (các cấp Level ≤ Level[i])`.
- **ChildrenPercent** = tổng % thầu của tk con + con-của-con (đệ quy cộng dồn).

> Tổng % của tất cả các cấp = **100%** (rủi ro của Player được chia hết).

Hàm này (nằm ở place-betting-helper trong luồng cược, `place-betting-helper.ts:569`) trả cấu trúc `ShareHolderDetail[]` được dùng để tính Income/Commission mỗi cấp — xem file 07.

---

## F. Number Share — thầu tối đa theo con số

**Mục đích**: cho phép đại lý giới hạn % thầu tối đa cho từng con số cụ thể (chỉ khi thầu mềm).

### F.1 Entity `NumberShareEntity` — collection `numberShares`

`{ UserId, Term, GameType, BetType, Number(00-99), MaxPercent, CreatedAt, UpdatedAt }`.

### F.2 Logic (`services/number-share-service.ts`)

- `updateNumberShare` (line 40): chỉ khi `Fixed === false` (thầu mềm), `0 <= maxPercent <= shareHolder.Percent`.
- `userGetNumberShares`: `Allow = (Fixed === false)`, `Limit = Percent`.

> **Lưu ý**: trong luồng cược hiện tại, Number Share **đã bị tắt** (`place-betting-cached-service.ts:133` luôn trả `NumberShares: []`). Đây là tính năng có thể bật lại; khi xây mới cần cân nhắc có cần hay không.

---

## G. Khởi tạo khi tạo user mới

Worker SQS (`new-user-worker.yml`) → `initializeNewUserShareHolder`: con mới có `Fixed=true, Percent=0, ParentPercent=Percent(cha), ExtraPrice=0`.

---

## H. API endpoints

- `ag-endpoint.yml` / `ag-endpoint.admin.yml`: get/update share holder của tài khoản con, get ancestors overview, get my share holder.
- `pl-endpoint.yml`: player xem number-share của mình.
- Worker: init khi tạo user.

---

## I. Gợi ý khi xây lại

1. **Thầu cứng vs mềm + `remainPercent`** là phần khó nhất; nên viết test case cụ thể theo cây thực tế (Owner→Company→...→Agent→Player) để đảm bảo tổng = 100%.
2. **`ExtraPrice` chỉ lưu phần cấp cha ngay trên cài thêm** (không cộng dồn) — cộng dồn được tính lúc đọc (`getBuyingPrice`). Đây là cách lưu chuẩn hoá tránh cập nhật lan truyền.
3. Ràng buộc `SellPrice cấp con ≥ cấp cha` phải kiểm ở cả bước cập nhật lẫn bước đặt cược (file 07) để chống lỗi cấu hình gây thất thoát.
4. Number-share nếu không dùng ngay thì vẫn nên thiết kế field sẵn (như code hiện tại) để bật sau mà không phải migrate.
