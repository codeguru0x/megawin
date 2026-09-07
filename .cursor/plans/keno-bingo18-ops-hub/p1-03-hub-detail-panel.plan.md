---
name: ""
overview: ""
todos: []
isProject: false
---

# p1-03 — Chi tiết kỳ: inline expand (0 query) + mở tab mới

> **Phase:** P1 · **Status:** ⏳ pending · **Phụ thuộc:** p1-02 · **Chặn:** p1-04
> **UI chuẩn:** [`ops-hub-page-layout.guideline.md`](./ops-hub-page-layout.guideline.md) §7
> **Plan này ĐÃ VIẾT LẠI HOÀN TOÀN** — bản trước làm Detail Sheet + query snapshot lẻ theo kỳ; cả hai
> đều bị bỏ.

## 0. Vì sao bỏ Detail Sheet — quyết định thay đổi hướng

Bản trước lập luận: *"điều hướng sang trang Operations sẽ mất selection/filter/scroll → dùng Sheet để
giữ Hub sống phía sau"*. Lập luận đó đúng về **vấn đề** nhưng chọn **sai giải pháp**.

| Tiêu chí | Detail Sheet (bản cũ) | Tab mới + inline expand (bản này) |
|---|---|---|
| Giữ được ngữ cảnh hub | Có, nhưng **che mất** hub phía sau | **Không che gì** — hub vẫn chạy ở tab kia, xem được song song 2 màn hình |
| Query thêm | **1 query/kỳ** (`GetOpsSnapshot`), poll riêng | **0 query.** Inline expand dùng dữ liệu đã có trong `rows` |
| Code mới phía trang chi tiết | Không, nhưng phải xử lý `useDrawContext` (§4.1 bản cũ nêu 3 nhánh, có nhánh phải **refactor trang đang chạy**) | **Không có gì** — trang Operations đã đọc `drawId` từ URL |
| Trạng thái loading | Có (skeleton trong Sheet) | **Không có** |
| Rủi ro nhân bản `DrawCommandCenter` | 🔴 Cao — bản cũ dành cả §4.1 để chống | **Không tồn tại** |
| Workflow phòng vận hành thật | 1 màn hình, phải đóng Sheet để nhìn hub | 2 tab / 2 màn hình — theo dõi hub **liên tục** khi xử lý 1 kỳ |

Điểm quyết định là dòng **"query thêm"**: Sheet buộc thêm 1 endpoint + 1 timer + 1 vòng invalidate, phá
nguyên tắc *"1 endpoint, 1 timer"* của cả hub. Và §4.1 bản cũ đã tự nhận rằng nhánh xấu nhất là **phải
refactor `DrawCommandCenter` — component của trang đang chạy production** — chỉ để nhúng nó vào Sheet.

Bỏ Sheet xoá luôn cả rủi ro đó. Plan này vì vậy là plan **rẻ nhất** của P1, không phải plan phức tạp
nhất như bản cũ.

## 1. Mục tiêu

Hai lối xem chi tiết, phục vụ hai câu hỏi khác nhau:

| Câu hỏi của người trực | Lối | Chi phí |
|---|---|---|
| *"Vì sao dòng này bị gắn `stuck`? Doanh thu tách theo cái gì? Có alert gì?"* | **Inline expand** (chevron trên dòng) | **0 query** |
| *"Tôi cần thao tác sâu / xem heatmap 80 số / live feed"* | **Tab mới** → `/games/keno/operations?drawId=…` | 0 code mới |

Nguyên tắc phân chia: **inline expand chỉ hiện thứ đã có trong `rows`**. Cần một field không có trong
snapshot hub → đó là dấu hiệu phải mở tab mới, **không** phải dấu hiệu cần thêm field vào hub.

## 2. Mở tab mới

### 2.1 Helper dựng href — theo tiền lệ có sẵn

Repo đã có đúng pattern này: [`vietlott-config-link.ts`](../../../apps/backoffice/src/app/(main)/games/_lib/operations/vietlott-config-link.ts)
dựng href qua registry, throw sớm nếu registry đổi, dùng chung cho 7 game. Làm y hệt:

```typescript
// apps/backoffice/src/app/(main)/games/_lib/operations/draw-operations-link.ts

/**
 * Href tới trang vận hành 1 kỳ cụ thể — dùng ở Ops Hub để mở chi tiết kỳ trong tab mới.
 *
 * Build qua `nav-registry` (nguồn chân lý DUY NHẤT cho path + urlKey của param kỳ), KHÔNG nội suy
 * `/games/${gameKey}/operations?drawId=${drawId}`. Registry khai `urlKey: "drawId"`
 * (`nav-registry.ts:213`); nội suy tay là chỗ dễ viết `?draw=` — trang chi tiết sẽ mở đúng nhưng
 * KHÔNG chọn kỳ nào, staff tưởng kỳ biến mất.
 *
 * Dùng chung cho Keno + Bingo18 (và 5 game còn lại nếu port tiếp).
 */
export function drawOperationsHref(gameKey: GameProduct, drawId: string): Route {
  const result = buildNavHref(NavPage.GameOperations, {
    segments: { gameKey },
    params: { drawId },
  });
  if (!result.ok) {
    throw new Error(
      `drawOperationsHref: buildNavHref thất bại cho gameKey="${gameKey}" drawId="${drawId}" (lý do: ${result.reason}).`,
    );
  }
  return result.href as Route;
}
```

`buildNavHref` **không throw** — trả `{ ok: false, reason, hint }` (`nav-registry.ts:635`). Phải check
`result.ok`; dùng thẳng `result.href` không check là lỗi type.

### 2.2 Dùng trong dòng bảng

```tsx
<Button asChild variant="ghost" size="sm">
  <Link href={drawOperationsHref("keno", drawId)} target="_blank" rel="noopener" prefetch={false}>
    Chi tiết <ExternalLinkIcon />
  </Link>
</Button>
```

Bốn điểm bắt buộc:

1. **Param là `drawId`, KHÔNG phải `draw`.** Đã verify `nav-registry.ts:213` khai
   `DRAW_ID_PARAM = { urlKey: "drawId", … }` và `NavPage.GameOperations` (dòng 417-425) dùng nó.
   Guideline §7 viết `?draw=${drawId}` — **đó là lỗi trong guideline**, sửa theo đây.
2. **Path dựng từ registry** qua helper §2.1, không nội suy string.
3. **`<Link target="_blank" rel="noopener">`**, **không** `window.open()`. Giữ được Cmd/Ctrl+click,
   middle-click, "mở trong cửa sổ mới" — những thứ người dùng thành thạo luôn dùng, và `window.open`
   phá hết.
4. **`prefetch={false}`.** Mặc định Next prefetch mọi `<Link>` trong viewport; với ~30 dòng × 1 link =
   30 lần prefetch một trang **nặng** (heatmap, live feed) mà phần lớn không ai bấm. Repo đã có tiền lệ
   đúng ở **6 chỗ** trong chính trang Operations Keno, gồm
   `draw-command-center.tsx:308` và `draw-selector.tsx:318`.

**Trang Operations không cần sửa gì** — nó đã đọc `drawId` từ URL. Lưu ý registry ghi rõ:
*"URL tự xoá `?drawId=` khi kỳ đang xem là kỳ active (giữ URL gọn) — KHÔNG phải bug"* (`nav-registry.ts:429`).
Nên nếu mở tab cho **kỳ đang active**, URL sẽ rụng param — đúng thiết kế, đừng "sửa".

## 3. Inline expand — 0 query

Click vào **dòng** (không phải nút, không phải checkbox) → mở panel dưới dòng đó.

### 3.1 Nội dung — chỉ thứ đã có trong `rows` + `derived`

| Khối | Nguồn | Vì sao đáng hiện |
|---|---|---|
| **Lý do trạng thái** | `derived.reason` (p1-01 §5.1) | Trả lời trực tiếp *"vì sao gắn `stuck`"* — thứ badge không đủ chỗ nói |
| **Mốc thời gian** | `openAt` · `closeAt` · `drawTime` · `publishedAt` · `settledAt` · `updatedAt` | Toàn bộ dòng thời gian của kỳ trong 1 chỗ. Đây là thứ staff phải mở 3 tab mới đối chiếu được |
| **Chỉ số tiền** | `revenue` · `entries` · `sets` · `largeBetCount` · `exposureRaw` | Đã có ở cột nhưng expand cho **nhãn đầy đủ** + đơn vị + so với median cùng gate |
| **Alerts** | `alertsOpen` · `alertsCritical` | Chỉ **số**, kèm link mở tab mới để xem nội dung |
| **Action khả dụng của kỳ** | `partitionByAction` 1 phần tử (p1-02 §8.1) | Thao tác 1 kỳ ngay tại chỗ, không cần chọn checkbox |

**Ba thứ CẤM đưa vào expand** (đều cần query mới):

1. **Nội dung alert** (`payload`, `topEntries`) — cần `useAlerts`. Chỉ hiện **số** + link tab mới.
2. **Exposure theo playType** — cần `worstCaseByPlayType`, projection hub cố ý **không** lấy vì nặng
   (p0-03 §6.3). Đây là lý do chính khiến bản cũ cần Sheet; giờ nó thuộc tab mới.
3. **Heatmap 80 số / live feed / topCombos / topAccounts** — thuộc trang Operations.

Nếu ai đề nghị "thêm `worstCaseByPlayType` vào hub snapshot cho expand dùng": **không**. Đó là thêm
dữ liệu chi tiết cho **160 kỳ** để phục vụ **1 kỳ** đang mở — chính cái p0-03 §1.1 gọi là doc 33KB × N.

### 3.2 Kỹ thuật

```tsx
/**
 * Dòng nào đang expand — `drawId` hoặc `null`. CHỈ MỘT dòng mở tại một thời điểm.
 *
 * Vì sao 1 dòng: mở nhiều dòng làm bảng cao lên nhanh, mất khả năng quét cột dọc — mục đích
 * duy nhất của bảng 5A. Và "so sánh 2 kỳ" là việc của 2 tab, không phải 2 panel chồng nhau.
 *
 * KHÔNG vào URL: expand là view tạm thời, không phải ngữ cảnh cần chia sẻ (khác `focus`/`gate`
 * ở p1-02 §5.1 — hai thứ đó là ngữ cảnh sự cố). Muốn share 1 kỳ thì share link tab mới.
 */
const [expandedDrawId, setExpandedDrawId] = useState<string | null>(null);
```

1. **Chỉ mount panel của dòng đang mở** — không render 30 panel rồi `hidden`. Render rồi ẩn là trả full
   giá mà không được gì (cùng nguyên tắc 5B Lớp 3, p1-02 §2.2).
2. **Click dòng toggle**; click **lại** dòng đang mở thì đóng. `Esc` đóng.
3. **`stopPropagation`** trên checkbox và mọi nút trong cột Actions — đã nêu ở p1-02 §7.1, nhắc lại vì
   đây là nơi hậu quả xảy ra.
4. **Expand KHÔNG đổi selection** — hai thao tác độc lập.
5. Panel dùng `colSpan` full width trong `<tr>` phụ, **không** absolute/portal (phá layout table và
   phá `content-visibility`).
6. **Không animate chiều cao** (`height: auto` transition buộc reflow mỗi frame — `vercel-react-best-practices`
   §7.1). Hiện/ẩn thẳng, hoặc chỉ fade `opacity`.
7. Kỳ đang expand mà **rời `rows`** (settle xong) → panel đóng, hiện toast nhẹ
   `"Kỳ 1042 đã kết sổ xong"`. **Không** giữ panel với dữ liệu chết.

## 4. Action đơn kỳ trong expand

Panel có các nút action của **đúng kỳ đó**, dùng lại `partitionByAction` (p1-02 §8.1) với mảng 1 phần
tử. Cùng một hàm quyết định khả dụng cho cả bulk và đơn — hai cách tính là hai chỗ sẽ lệch.

**Gọi API nào:** dùng **bulk endpoint với `drawIds` 1 phần tử**, không gọi route action đơn.

Lý do: route đơn của trang Operations có shape response khác (`{ ok }` thay vì `{ results, successCount }`)
và cơ chế lỗi khác (4xx thay vì 200 + `results`). Dùng bulk cho cả hai làm UI hub có **một** đường xử lý
kết quả duy nhất (p1-02 §8.5). Chi phí: 0 — `runBulkDrawAction` (p0-04 §2.3) gọi thẳng use-case đơn bên
trong.

Void trong expand vẫn **bắt buộc `reason`** + confirm dialog. Không có ngoại lệ "1 kỳ thì nhẹ hơn": 1 kỳ
Keno cũng là tiền thật.

Sau mutation: `invalidateQueries({ queryKey: kenoKeys.opsHub() })` — **1** query duy nhất cần invalidate
(khác bản cũ phải invalidate 2). Đây là lợi ích trực tiếp của việc bỏ endpoint lẻ.

## 5. Nút "Chọn kỳ này"

Panel có nút thêm kỳ đang xem vào selection — tiện khi staff xem xong thấy cần xử lý theo lô cùng vài
kỳ khác. Chỉ hiện khi kỳ **chưa** được chọn và **có** ít nhất 1 action khả dụng.

## 6. Test

| Case | Kỳ vọng |
|---|---|
| Click dòng | Panel mở đúng kỳ, **0 request** (DevTools Network trống) |
| Click dòng khác khi đang mở | Panel cũ đóng, panel mới mở (chỉ 1 mở) |
| Click lại dòng đang mở | Đóng |
| `Esc` | Đóng |
| Click checkbox | **Không** mở panel |
| Click nút `Chi tiết ↗` | **Không** mở panel, mở tab mới |
| Mở panel | Selection **không** đổi |
| Panel đóng | **0** dòng panel trong DOM (không `hidden`) |
| Kỳ đang expand settle xong, rời `rows` | Panel đóng + toast; **không** panel dữ liệu chết |
| Poll trong lúc panel mở | Số trong panel cập nhật, panel **không** đóng, **không** nháy |
| Nút `Chi tiết ↗` | URL có **`?drawId=`** (không `?draw=`), `target="_blank"`, `rel="noopener"` |
| Cmd/Ctrl+click trên nút | Mở tab mới (chứng minh dùng `<Link>` không `window.open`) |
| 30 dòng có link | **0** prefetch request (`prefetch={false}`) |
| Void 1 kỳ trong panel | Bắt nhập `reason`, gọi **bulk** endpoint với 1 `drawId` |
| Void thành công | Panel đóng, bảng cập nhật, **1** invalidate |
| Void lỗi (200 + `results[0].ok=false`) | Badge lỗi tại dòng, toast warning, panel **vẫn mở** |
| Kỳ `Settling` | Panel mở được (xem thông tin), **0** nút action enable |

Ba dòng quan trọng nhất: **"0 request"**, **"0 prefetch"**, và **"`?drawId=`"**. Cả ba là những thứ trông
vẫn "chạy được" khi làm sai.

## 7. Review checklist

- [ ] **Không** có `Sheet`/`Dialog` chi tiết kỳ trong `operations-hub/`. Grep `Sheet` — 0 match.
- [ ] **Không** query mới nào. Grep `useQuery` trong `operations-hub/` — vẫn đúng **1** match (của p1-01).
- [ ] **Không** dùng `GetOpsSnapshotUseCase` / `kenoKeys.opsSnapshot` trong hub.
- [ ] Expand chỉ hiện field có trong `OpsHubDrawRow` + `DrawOpsState`. Đối chiếu từng field với DTO p0-03.
- [ ] **Không** nội dung alert, **không** exposure theo playType, **không** heatmap trong expand.
- [ ] Link dùng **`drawId`** (verify `nav-registry.ts:213`), dựng qua `drawOperationsHref` (registry),
      **không** nội suy string. Có check `result.ok`.
- [ ] `<Link target="_blank" rel="noopener" prefetch={false}>`; **không** `window.open`.
- [ ] Chỉ **1** panel mở; chỉ **mount** panel đang mở.
- [ ] `stopPropagation` trên checkbox + nút Actions.
- [ ] Expand **không** vào URL, **không** đổi selection.
- [ ] **Không** animate `height`.
- [ ] Action đơn gọi **bulk endpoint** với 1 `drawId`; dùng lại `partitionByAction`.
- [ ] Void 1 kỳ vẫn bắt `reason` + confirm.
- [ ] Sau mutation invalidate **đúng 1** query (`kenoKeys.opsHub`).
- [ ] Kỳ rời `rows` → panel đóng + toast.
- [ ] `PlayerName`/`PlayerOutstandingLink` từ `@/components/player-name` **nếu** có hiện tên người chơi
      (`player-display-username.mdc`) — nhưng expand hub **không** có top người chơi (cần query).
- [ ] Exposure trong panel ghi rõ `(chưa cap)`, khớp p0-03 §6.3.
- [ ] `tabular-nums` mọi số trong panel.
- [ ] `pnpm check-types` + `pnpm lint` xanh.
- [ ] Trang `/games/keno/operations` **không** bị sửa dòng nào. `git diff --stat` xác nhận.

## 8. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Ai đó thêm query vào expand ("chỉ 1 field nữa thôi") | 🔴 | §3.1 liệt kê **3 thứ cấm** + checklist grep `useQuery` = 1 |
| Thêm `worstCaseByPlayType` vào hub snapshot cho expand | 🔴 | §3.1 giải thích: dữ liệu chi tiết cho 160 kỳ để phục vụ 1 kỳ |
| Link dùng `?draw=` (theo guideline sai) → trang chi tiết không nhận kỳ | 🟡 | §2 điểm 1 đã verify registry; test §6 |
| 30 link prefetch trang nặng | 🟡 | `prefetch={false}` + test đếm request |
| Nhiều panel mở → bảng cao, mất khả năng quét | 🟡 | 1 panel duy nhất |
| Panel giữ dữ liệu chết sau khi kỳ settle | 🟡 | Đóng + toast |
| Click checkbox mở cả panel | 🟢 | `stopPropagation` + test |
| Quay lại làm Sheet ở P2 | 🟢 | §0 ghi rõ lý do bỏ; ai muốn làm lại phải bác được bảng đó |

## 9. Rollback

Revert commit. Bảng 5A/5B (p1-02) vẫn hoạt động đầy đủ, chỉ mất inline expand và nút `Chi tiết ↗` —
staff vào trang Operations qua sidebar như trước.

**Không** có endpoint, use-case, index nào bị chạm → không backend footprint. File mới duy nhất ngoài
`operations-hub/` là `_lib/operations/draw-operations-link.ts` — **file mới, chưa ai import**, nên xoá
nó không phá gì. Trang Operations không bị sửa 1 dòng (`git diff --stat` xác nhận).

Đây là plan duy nhất của P1 có thể revert mà không cần nghĩ.

## 10. Ghi chú cho p1-04 (Bingo18)

`drawOperationsHref(gameKey, drawId)` nhận `gameKey` làm tham số → Bingo18 **dùng lại nguyên hàm**,
không tạo bản thứ hai. Đặt ở `games/_lib/operations/` chính vì vậy (cùng chỗ với `vietlott-config-link.ts`
— file đã dùng chung cho 7 game).

Đây là **ngoại lệ hợp lệ** so với quy tắc "không tạo base class chung Keno/Bingo18" ở p1-04: helper này
là hàm thuần dựng URL, không chứa logic nghiệp vụ game nào.