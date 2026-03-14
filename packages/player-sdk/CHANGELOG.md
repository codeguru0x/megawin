# Changelog

Tất cả thay đổi đáng chú ý của `@megawin/player-sdk` được ghi tại đây.

---

## [1.0.9] - 2026-03-13

### Added

- **Power 6/55**: `Power655PlayType.Bao5` (`"bao5"`) — loại hình chơi mới: chọn 5 số, hệ thống ghép từng số trong 50 số còn lại (55-5=50) → 50 bộ số dự thưởng. Giá vé = 500.000đ / kỳ.

### Fixed

- **Power 6/55**: Đã bổ sung `Bao5` vào `Power655PlayType` enum (thiếu trong 1.0.8). Backend đã hỗ trợ Bao 5 từ trước, SDK nay đồng bộ lại.

---

## [1.0.8] - 2026-03-13

### Added

- **Power 6/55**: `client.power655.listDrawResults(params?)` — lấy danh sách kết quả kỳ quay đã công bố (`GET /games/power655/draw-results`)
- **Power 6/55**: `client.power655.getDrawResult(drawId)` — lấy chi tiết kết quả 1 kỳ quay (`GET /games/power655/draw-results/{drawId}`)
- **Max 3D**: `client.max3d.listDrawResults(params?)` — lấy danh sách kết quả kỳ quay đã công bố (`GET /games/max3d/draw-results`)
- **Max 3D**: `client.max3d.getDrawResult(drawId)` — lấy chi tiết kết quả 1 kỳ quay (`GET /games/max3d/draw-results/{drawId}`)
- **Max 3D Pro**: `client.max3dpro.listDrawResults(params?)` — lấy danh sách kết quả kỳ quay đã công bố (`GET /games/max3dpro/draw-results`)
- **Max 3D Pro**: `client.max3dpro.getDrawResult(drawId)` — lấy chi tiết kết quả 1 kỳ quay (`GET /games/max3dpro/draw-results/{drawId}`)
- **Bingo 18**: `client.bingo18.listDrawResults(params?)` — lấy danh sách kết quả kỳ quay đã công bố (`GET /games/bingo18/draw-results`)
- **Bingo 18**: `client.bingo18.getDrawResult(drawId)` — lấy chi tiết kết quả 1 kỳ quay, bao gồm `basicPrizes` và `sideBetPrizes` (`GET /games/bingo18/draw-results/{drawId}`)
- **Power 6/55**: New types `Power655DrawResultSummary`, `Power655DrawResultInfo`, `Power655DrawTierPrize`, `Power655LineInfo`, `Power655ListDrawResultsParams`, `Power655ListDrawResultsResponse`
- **Max 3D**: New types `Max3dDrawResultSummary`, `Max3dDrawResultInfo`, `Max3dDrawTierPrize`, `Max3dLineInfo`, `Max3dListDrawResultsParams`, `Max3dListDrawResultsResponse`
- **Max 3D Pro**: New types `Max3dproDrawResultSummary`, `Max3dproDrawResultInfo`, `Max3dproDrawTierPrize`, `Max3dproLineInfo`, `Max3dproListDrawResultsParams`, `Max3dproListDrawResultsResponse`
- **Bingo 18**: New types `Bingo18DrawResultSummary`, `Bingo18DrawResultInfo`, `Bingo18DrawBasicPrize`, `Bingo18DrawSideBetPrize`, `Bingo18ListDrawResultsParams`, `Bingo18ListDrawResultsResponse`

### Changed

- **BREAKING — Power 6/55**: `Power655EntryLinesResponse` đã được cập nhật để khớp chính xác với API response:
  - Thêm `drawId: string` — ID kỳ quay
  - Thêm `nextCursor: number | null` — cursor phân trang (integer line index)
  - Thêm `size: number` — số lines thực tế trả về trong trang
  - `lines[]` đổi từ `Array<{ mainNumbers: number[] }>` sang `Array<Power655LineInfo>`:
    - `main: string[]` thay vì `mainNumbers: number[]` — mảng string zero-padded (VD: `"01"-"55"`) thay vì number
    - Thêm `boardNo: string` — board mà line này thuộc về
    - Thêm `lineIndex: number` — vị trí line trong entry (0-based)
    - Thêm `matchResult` — kết quả đối chiếu sau khi kỳ quay kết thúc (gồm `mainMatchCount`, `bonusMatched`, `tier`, `prizeAmount`)

- **BREAKING — Max 3D**: `Max3dEntryLinesResponse` đã được cập nhật để khớp chính xác với API response:
  - Thêm `drawId: string`, `nextCursor: number | null`, `size: number`
  - `lines[]` đổi từ `Array<{ triplet: string }>` sang `Array<Max3dLineInfo>`:
    - `triplets: string[]` thay vì `triplet: string` — mảng bộ ba số
    - Thêm `boardNo`, `lineIndex`, `playMode`, `playType`, `matchResult`

- **BREAKING — Max 3D Pro**: `Max3dproEntryLinesResponse` đã được cập nhật tương tự Max 3D:
  - Thêm `drawId: string`, `nextCursor: number | null`, `size: number`
  - `lines[]` đổi từ `Array<{ first: string; second: string }>` sang `Array<Max3dproLineInfo>`

- **BREAKING — Max 3D**: `Max3dTicketEntriesResponse.entries[].result` đã sửa để khớp với kết quả quay số thực tế:
  - Cũ: `{ firstPrize: string; secondPrize: string; publishedAt: string }`
  - Mới: `{ special: string[]; first: string[]; second: string[]; third: string[]; publishedAt: string }` — khớp với 20 bộ ba chia 4 hạng giải (đặc biệt, nhất, nhì, ba)

- **BREAKING — Max 3D Pro**: `Max3dproTicketEntriesResponse.entries[].result` đã sửa tương tự Max 3D:
  - Cũ: `{ firstPrize: string; secondPrize: string; publishedAt: string }`
  - Mới: `{ special: string[]; first: string[]; second: string[]; third: string[]; publishedAt: string }`

### Removed

- **BREAKING — Mega 6/45**: `Mega645PlayType.QuickPick` (`"quickPick"`) đã bị xóa. API handler không còn chấp nhận giá trị này, mọi request với `playType: "quickPick"` sẽ bị từ chối (`VALIDATION_ERROR`). Thay bằng: chọn số thủ công với `Standard` hoặc `Bao*` play types.
- **BREAKING — Power 6/55**: `Power655PlayType.QuickPick` (`"quickPick"`) đã bị xóa. Lý do giống Mega 6/45.
- **BREAKING — Lotto 5/35**: `Lotto535PlayType.QuickPick` (`"quickPick"`) đã bị xóa. Lý do giống trên.
- **BREAKING — Max 3D**: `Max3dPlayType.QuickPick` (`"quickPick"`) đã bị xóa. API handler chỉ chấp nhận `straight`, `combo3`, `combo6`.

### Migration Guide

#### QuickPick đã bị loại bỏ

```ts
// TRƯỚC (sẽ bị VALIDATION_ERROR):
await client.mega645.placeBet({
  drawIds: ["2026-03-07.001"],
  boards: [{ boardNo: "A", playType: "quickPick", selection: { mainNumbers: [] } }],
});

// SAU — chọn số thủ công:
await client.mega645.placeBet({
  drawIds: ["2026-03-07.001"],
  boards: [
    {
      boardNo: "A",
      playType: "standard",
      selection: { mainNumbers: ["05", "12", "23", "34", "40", "45"] },
    },
  ],
});
```

#### Power 6/55 `getEntryLines` response đã đổi

```ts
// TRƯỚC:
const { lines } = await client.power655.getEntryLines(entryId);
for (const line of lines) {
  console.log(line.mainNumbers); // number[] — SAI
}

// SAU (v1.0.8):
const { lines, nextCursor } = await client.power655.getEntryLines(entryId, { size: 50 });
for (const line of lines) {
  console.log(line.main); // string[] — VD: ["03", "11", "25"]
  console.log(line.boardNo); // "A"
  console.log(line.matchResult?.tier); // "jackpot1" | "tier1" | null
}
```

#### Max 3D `getTicketEntries` entry result đã đổi

```ts
// TRƯỚC:
entry.result?.firstPrize; // string — SAI, không tồn tại
entry.result?.secondPrize; // string — SAI, không tồn tại

// SAU (v1.0.8):
entry.result?.special; // string[] — VD: ["123", "456", ...]  (bộ ba hạng Đặc Biệt)
entry.result?.first; // string[] — VD: ["789", ...]         (bộ ba hạng Nhất)
entry.result?.second; // string[] — ...                      (bộ ba hạng Nhì)
entry.result?.third; // string[] — ...                      (bộ ba hạng Ba)
```

---

## [1.0.7] - 2026-03-01

Initial tracked release.
