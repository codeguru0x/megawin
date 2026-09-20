# P1-04 — `no-restyle` (2039 warning) — override spacing/typography/shape ngoài contract

## Status (2026-09-20) — PARTIAL (2a + contract DONE; leftover cần review ảnh)

Branch đã merge vào chuỗi visual (`2e33e8a1` → `7d4317a2`). Baseline sau P1-03: **2262**
`no-restyle` → slice-4 **~768** (−1494 tổng). **Contract/2a an toàn coi như hết.**

**Không coi leftover là "còn làm nốt trong 1 PR":** ~758 còn lại chủ yếu color raw trên
Button/Card (action tint / game palette) + compact `h-7`/`text-xs` + effect — thuộc 2b/2c,
**bắt buộc review ảnh từng khu vực**, cấm suppress hàng loạt (`00-overview.md` §3). Mở
slice mới khi user chọn khu vực UI cụ thể (VD Ops Hub Keno, jackpot cards…).

### Đã làm (2a + nới contract có giải trình)

| Việc | Loại | Ghi chú |
|---|---|---|
| Xoá `shadow-sm` / `hover:shadow-sm` trên `<Card>` | 2a | Card default đã có `shadow-sm` |
| Xoá `text-xs` thừa trên `<TooltipContent>` | 2a | Tooltip default đã `text-xs` |
| Xoá `text-xs` / `gap-1` / `px-2` / `font-medium` thừa trên `<Badge>` | 2a | `badgeVariants` đã có |
| Button `size="sm"`: xoá `gap-1.5` / `h-8` / `font-medium` thừa | 2a | khớp CVA `sm` + base |
| Button default: xoá `gap-2` / `h-9` / `px-4` / `text-sm` thừa | 2a | khớp CVA default |
| Input/SelectTrigger default: xoá `h-9` thừa | 2a | Input/`data-[size=default]:h-9` |
| Skeleton `allow: shape` | contract | Skeleton phải khớp radius UI đích |
| CardHeader/Footer `allow: shape` | contract | Config form `border-t` divider |
| TooltipContent `allow: typography` | contract | Giữ `font-mono` / `tabular-nums` |
| Table* `allow: color` | contract | semantic color trên cell |
| Title/Description + Dialog/Sheet Header/Footer `allow: spacing` | contract | icon+title `gap-*`, footer `pt-*`/`gap-*` |
| Input/SelectTrigger/Textarea/MoneyInput `allow: typography` | contract | số liệu `font-mono`/`tabular-nums`/`text-center` |
| TabsList/Trigger/Content `allow: shape` | contract | underline tabs `border-b` |
| AccordionItem xoá `border-b` thừa | 2a | default AccordionItem đã có |
| Label/SelectItem/Badge/ScrollArea/DialogContent/Table/Accordion/Collapsible | contract | spacing/typography/shape theo pattern UI |
| TableRow xoá `transition-colors` thừa | 2a | TableRow default đã có |

### Còn lại (ước lượng)

Color raw trên Button/Card (~432 — action tint / game palette, 2b/2c visual), Button compact
`h-7`/`text-xs`, effect (`shadow-2xl`, Collapsible animate). Không suppress hàng loạt — xử khi
review ảnh từng khu vực.

## 1. Contract hiện có (`.oxlintrc.json` root, dòng 174-215)

Mặc định mọi component chỉ được phép `className` loại `layout` (`flex`, `gap`, `w-*`, `mt-*`...).
Ngoại lệ theo component đã khai sẵn:

| Component pattern | Được phép thêm |
|---|---|
| `Card`, `CardContent/Header/Footer` | `layout`, `spacing` |
| `CardTitle`, `DialogTitle`, `SheetTitle`, `DrawerTitle`, `AlertTitle` | `layout`, `typography` |
| `CardDescription`, `DialogDescription`, `SheetDescription`, `AlertDescription` | `layout`, `typography` |
| `TableCell/Head/Row/Header/Body/Footer/Caption` | `layout`, `typography`, `spacing` |
| `Skeleton` | `layout`, `spacing` |
| `Label`, `FormLabel`, `SelectLabel` | `layout`, `typography`, `color` |
| `Badge` | `layout`, `color` |
| `Alert` | `layout`, `spacing`, `color` |
| `Tabs(List/Content/Trigger)` | `layout`, `spacing` |

2039 warning là những chỗ **vượt** bảng trên (VD `Button` thêm `text-lg`/`px-8`, `CardContent`
thêm màu, `Badge` thêm `text-sm` không nằm trong allow list "layout+color").

## 2. Vì sao KHÔNG thể xử máy móc toàn bộ 2039 — phải phân loại theo Ý ĐỒ override

Một override tồn tại vì 1 trong 3 lý do — mỗi lý do cần xử khác nhau:

### 2a. Override THỪA — trùng giá trị default của variant, xoá không đổi gì

VD `<Button className="px-4">` trên `Button` mặc định `variant="default"` đã có padding tương
đương → xoá override, **0 đổi pixel**. Đây là phần duy nhất của phase này có thể coi gần AN TOÀN,
nhưng vẫn cần verify từng case (đọc `packages/ui/src/components/button.tsx` variant CVA để xác
nhận default value THẬT khớp override, không suy đoán). Nếu khớp → xoá, ghi vào track an toàn nếu
số lượng đủ nhiều để tách riêng, nếu ít thì làm luôn ở đây với review nhẹ (screenshot spot-check,
không cần duyệt từng cái).

### 2b. Override CÓ CHỦ ĐÍCH, đúng nghiệp vụ — giữ lại, hợp thức hoá bằng suppression

VD `Badge` cần `text-xs` cho 1 badge đặc biệt hiển thị số liệu dày trong table hẹp — đây là quyết
định thiết kế thật, không phải lỗi. Xử theo `oxlint-lint-conventions.mdc` §d: giữ nguyên class,
thêm:
```tsx
{/* oxlint-disable-next-line shadcn/no-restyle: Badge trong bảng outstanding cần text-xs vì
    cột hẹp <80px, contract Badge chỉ cho phép color — đã xác nhận với design 19/09/2026 */}
<Badge className="text-xs bg-...">...</Badge>
```
**KHÔNG** dùng lý do rỗng ("cần thiết", "giữ nguyên UI") — phải nêu đúng constraint cụ thể (kích
thước cột, ngữ cảnh hiển thị) theo đúng yêu cầu rule d.

### 2c. Override là DƯ THỪA THIẾT KẾ — nên bỏ để đồng nhất design system, nhưng ĐỔI UI thật

VD nhiều nơi tự thêm `font-semibold text-base` cho `CardTitle` dù `CardTitle` default đã đậm vừa
đủ — có thể default KHÔNG khớp 100% override (VD override to hơn 1 step) → xoá override = đổi UI
(chữ nhỏ lại) → cần review ảnh.

## 3. Quy trình bắt buộc — audit trước khi sửa bất kỳ file nào

1. Lấy danh sách đầy đủ: `oxlint apps/backoffice -A all -W 'shadcn(no-restyle)' --format=unix`.
2. Group theo **component name** bị vi phạm (Button, CardContent, Badge, Table*, …) — xử theo
   nhóm component, không theo file, vì cùng 1 component có 1 default variant cố định để so sánh.
3. Với mỗi nhóm: đọc default variant trong `packages/ui/src/components/<component>.tsx`
   (CVA `variants`) — liệt kê rõ giá trị spacing/typography default.
4. Phân loại từng warning trong nhóm vào 2a/2b/2c theo mục 2 — lập bảng kết quả audit trước khi
   sửa bất kỳ dòng nào (không sửa song song với audit).
5. Thực thi theo phân loại:
   - 2a: xoá override, chạy `oxlint` + spot-check ảnh 2-3 page tiêu biểu của nhóm component đó.
   - 2b: giữ + suppress đúng chuẩn, không đổi UI, không cần review ảnh.
   - 2c: đưa vào rollout review-ảnh-per-nhóm-component (không phải per-game như P1-01/02 — ở đây
     chia theo component vì 1 component xuất hiện xuyên suốt nhiều trang).

## 4. Ưu tiên nhóm component xử trước (theo mức độ xuất hiện, ước lượng từ oxlint output)

Xử `Card`/`CardContent`/`CardHeader` và `Table*` trước (contract đã rộng — `layout+spacing`, hoặc
`+typography`, nên số warning "vượt contract" ở nhóm này thường là case 2b/2c rõ ràng, ít case
2a). Xử `Badge` sau (liên quan tới P1-02, làm sau khi đã xong status badge unification để không
đụng 2 lần vào cùng file). `Button` xử cuối vì variant CVA phức tạp nhất, dễ nhầm 2a/2c.

## 5. Definition of Done cho phase này (đã chốt với user 19/09/2026)

**Suppression KHÔNG phải đích đến** — chỉ dùng cho case 2b thật sự có lý do nghiệp vụ xác nhận rõ,
không dùng để "đóng" cả nhóm cho gọn. Ưu tiên tuyệt đối: xử **2a** (xoá override thừa, gần như
không rủi ro) trước, sau đó **2c** (đổi UI thật để đạt chuẩn design system, review ảnh từng khu
vực) — 2b là ngoại lệ hiếm, không phải lối tắt.

Làm dần theo từng khu vực component (§4), mỗi khu vực đi hết chu trình audit → sửa thật → review
ảnh → merge → thêm/update Playwright spec, rồi mới qua khu vực kế tiếp. Không giới hạn phải xong
trong 1 lần — chấp nhận nhiều vòng lặp trên cùng 1 khu vực nếu lần đầu review ảnh chưa đạt.
</contents>
