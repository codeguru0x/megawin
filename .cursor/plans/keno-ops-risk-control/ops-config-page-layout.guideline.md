# Tab "Vận hành" trong trang Cấu hình (Ops Config) — Layout & Chức năng Guideline

> **Mục đích:** Chốt layout + hành vi UI cho **tab "Vận hành" trên trang Cấu hình game**
> (`/games/{game}/config/game?tab=ops`), làm khuôn cho các game sau
> (lotto535/mega645/power655/max3d/…). ĐỪNG nhầm với `operations-page-layout.guideline.md`
> — file đó là **trang Vận hành** (dashboard giám sát real-time). File này là **màn hình
> chỉnh ngưỡng cảnh báo + nhịp worker + Top-K** nằm trong trang Config.
>
> Mỗi lần chỉnh tab Vận hành của Keno → cập nhật file này.
>
> **Nguồn code tham chiếu (Keno):**
> `apps/backoffice/src/app/(main)/games/keno/config/game/_lib/ops-section.tsx`
>
> Rule liên quan: `game-config-ui.mdc` (headless card, tooltip 4 phần), `code-quality-standards.mdc`.

---

## 1. Bố cục 2 cột — headless card

Tab Vận hành là 1 **headless config card** (`game-config-ui.mdc` §1): `Card overflow-hidden py-0 gap-0`
→ `CardContent p-0` → `CardFooter border-t`. Bên trong `CardContent` chia **2 cột** (`lg:grid-cols-2`):

| Cột | Nội dung | Bản chất |
|---|---|---|
| **Trái — Ngưỡng cảnh báo rủi ro** | Các field ngưỡng worker so mỗi chu kỳ để sinh alert + khu vực **Bật / tắt loại alert** (§3) | Điều khiển *khi nào* bắn alert |
| **Phải — Nhịp worker & Top-K** | `tickSeconds` + `topCombosK`/`topPotentialK`/`topAccountsK` | Điều khiển *chi phí worker* + độ tươi dashboard |

Mỗi cột mở đầu bằng cụm `h3 title + p description` (mô tả tác động: "đổi có hiệu lực trong ~1 chu kỳ
worker, không cần deploy" / "ảnh hưởng chi phí worker và độ tươi dashboard").

Footer: 1 nút submit `disabled={isPending || !form.formState.isDirty}` — chỉ bật khi có thay đổi.

---

## 2. Field ngưỡng — tooltip 4 phần BẮT BUỘC

Mọi ô nhập ngưỡng dùng `IntField` (label + `MoneyInput` + suffix `VND`/`%`/`người`/`giây`) kèm
`LabelWithTooltip` (icon `HelpCircle`). **Tooltip 4 phần** (`game-config-ui.mdc` §16), phân tách bằng ` · `:

> **Ý nghĩa:** … điều kiện bắn alert. · **Hợp lệ:** khoảng số (khớp Zod server). · **Mặc định:** giá trị. · **Tác động:** hạ/tăng ngưỡng → hệ quả.

Range trong Zod client (`opsFormSchema`) **PHẢI khớp** Zod server (`api/{game}/config/_lib/schema.ts` §ops).

---

## 3. Khu vực "Bật / tắt loại alert" — KHÔNG dùng list phẳng label + switch

Đây là **quyết định quan trọng** (rút kinh nghiệm Keno 29/07): thiết kế đầu tiên chỉ là danh sách
`<span>{label}</span>` + `<Switch>` phẳng — không đồng nhất với các field ngưỡng (vốn có tooltip),
người vận hành không hiểu mỗi alert nghĩa là gì, dựa ngưỡng nào, tắt đi thì mất giám sát rủi ro gì.

**Thiết kế chuẩn: mỗi loại alert là 1 hàng giàu thông tin** (`AlertToggleRow`). Bắt buộc có đủ:

### 3.1. Metadata gom 1 mảng duy nhất (`ALERT_META`)
Mỗi alert khai 1 object `{ type, label, icon, severity, summary, tip }` — thêm/sửa alert đổi **1 chỗ**.
- `type`: `KenoOpsAlertType` (const-as-const). Record `enabled` vẫn được compiler check khoá đúng.
- `severity`: `OpsAlertSeverity` (Critical/Warning/Info) — **dùng lại enum game-core**, KHÔNG string trần (§5.3).
- Danh sách **sắp xếp theo severity giảm dần** — loại nghiêm trọng lên đầu để quét từ trên xuống.
- CHỈ liệt kê loại bật/tắt được ở P0 (Keno bỏ `RevenueAnomaly`/`SettleStuck` để dành).

### 3.2. Mỗi hàng (`AlertToggleRow`) hiển thị
- **Icon severity + badge màu** (đỏ=Critical, amber=Warning, sky=Info) — quét nhanh mức độ. Palette
  gom trong `SEVERITY_STYLES` (1 nơi), KHÔNG rải màu inline.
- **Tên alert + badge severity chữ** ("Nghiêm trọng"/"Cảnh báo"/"Thông tin").
- **Tooltip `HelpCircle`** — đồng nhất với field ngưỡng. Nội dung 3 phần: *Ý nghĩa · Ngưỡng liên quan
  (trỏ đúng tên field ở cột trái) · **Tác động khi TẮT*** (mất giám sát rủi ro gì).
- **Mô tả 1 dòng inline** (`summary`) dưới tên — giải thích nhanh + nhắc field ngưỡng liên quan.
- **Switch** cập nhật `form.setValue("enabled", {...}, { shouldDirty: true })`.
- **Cả hàng click được**: dùng `<label htmlFor={rowId}>` bọc + `<Switch id={rowId}>` → tăng vùng bấm.

### 3.3. Trạng thái tắt phải nhìn thấy rõ
Hàng bị tắt: `border-dashed` + nền `bg-muted/30` + icon `opacity-40` + chữ `text-muted-foreground`.
Hàng bật: `border-border/60 bg-card` + chữ `text-foreground`. Tắt ≠ ẩn — vẫn thấy nhưng "ngủ".

### 3.4. Header khu vực có summary + cảnh báo tắt-hết
- Header: nhãn "Bật / tắt loại alert" + **tooltip giải thích chung** ("chọn loại rủi ro worker giám
  sát; tắt = ngưng theo dõi, không nên tắt loại Nghiêm trọng") + **badge đếm** `N/M đang bật`.
- Nếu `enabledCount === 0` → banner amber (`BellOff`): "Tất cả alert đang tắt — worker sẽ không sinh
  cảnh báo rủi ro nào." (người vận hành dễ vô tình tắt hết → phải cảnh báo).

---

## 4. Nhãn & thuật ngữ

- Việt hoá đồng nhất trang Vận hành: "Exposure vượt ngưỡng" → **"Rủi ro chi trả"**, "Số bộ gần cap"
  → **"Gần chạm cap"**, "Dồn cược 1 bộ số" → **"Dồn bộ số"** (khớp `KENO_OPS_ALERT_TYPE_LABELS`
  trong `operations/_lib/ops-constants.ts` — 2 trang phải cùng nhãn cho cùng alert type).
- Tooltip luôn trỏ **tên field ngưỡng chính xác** ở cột trái để người dùng biết đổi ở đâu.

---

## 5. Checklist khi rollout tab Vận hành sang game mới

- [ ] Headless card 2 cột: trái = ngưỡng + toggle alert, phải = nhịp + Top-K.
- [ ] Mọi field ngưỡng có tooltip 4 phần; Zod client range khớp Zod server.
- [ ] Khu vực toggle: **KHÔNG** list phẳng label+switch. Dùng `AlertToggleRow` giàu thông tin.
- [ ] Metadata alert gom 1 mảng `ALERT_META` (type/label/icon/severity/summary/tip), sort severity giảm dần.
- [ ] `severity` dùng `OpsAlertSeverity` (game-core), palette gom `SEVERITY_STYLES` — không màu inline/string trần.
- [ ] Mỗi hàng: icon+badge severity, tên, tooltip (ý nghĩa · ngưỡng liên quan · tác động khi TẮT), summary, switch, cả hàng click được.
- [ ] Hàng tắt: border-dashed + mờ; header có badge `N/M đang bật` + banner amber khi tắt hết.
- [ ] Nhãn alert type khớp `{GAME}_OPS_ALERT_TYPE_LABELS` của trang Vận hành (cùng label 2 nơi).
