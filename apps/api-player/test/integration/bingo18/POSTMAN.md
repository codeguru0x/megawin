# Bingo 18 -- Postman Manual Test Reference

> File này chỉ để copy URL, headers, body vào Postman. Không chạy trực tiếp.

---

## Base URL

```
http://localhost:4010
```

---

## Authentication

Tất cả endpoint yêu cầu header:

```
Authorization: Bearer <token>
Content-Type: application/json
```

### Tạo token

Token là fake JWT dùng cho serverless-offline (local). Cấu trúc: `base64url(header).base64url(payload).integ`

**Payload mẫu** (cập nhật `exp` = Unix timestamp tương lai trước khi dùng):

```json
{
  "sub": "integ-test-sub-001",
  "iss": "https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_LOCAL",
  "aud": "local-test-client",
  "exp": 1740800000,
  "cognito:username": "integ_player",
  "custom:account_type": "player",
  "custom:account_status": "active",
  "custom:account_id": "acc-integ-001",
  "custom:tenant_id": "tenant-integ-001",
  "custom:roles": "player"
}
```

**Tạo nhanh bằng Node.js** (chạy trong terminal):

```bash
node -e "
const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const p = Buffer.from(JSON.stringify({
  sub:'integ-test-sub-001',
  iss:'https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_LOCAL',
  aud:'local-test-client',
  exp:Math.floor(Date.now()/1000)+3600,
  'cognito:username':'integ_player',
  'custom:account_type':'player',
  'custom:account_status':'active',
  'custom:account_id':'acc-integ-001',
  'custom:tenant_id':'tenant-integ-001',
  'custom:roles':'player'
})).toString('base64url');
console.log(h+'.'+p+'.integ');
"
```

---

## 1. Lấy draw hiện tại

```
GET http://localhost:4010/games/bingo18/draws/current
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `GET`   |
| Path params  | Không   |
| Query params | Không   |
| Body         | Không   |

---

## 2. Danh sách vé đang chờ (pending tickets)

```
GET http://localhost:4010/games/bingo18/tickets/pending
```

| Mục         | Giá trị |
| ----------- | ------- |
| Method      | `GET`   |
| Path params | Không   |
| Body        | Không   |

### Query params

| Param    | Bắt buộc | Default | Mô tả                          |
| -------- | -------- | ------- | ------------------------------ |
| `size`   | Không    | `20`    | Số lượng / trang (max 100)     |
| `cursor` | Không    | —       | ObjectId cursor cho trang tiếp |

**Ví dụ với cursor pagination:**

```
GET http://localhost:4010/games/bingo18/tickets/pending?size=5
```

---

## 3. Danh sách vé đã hoàn thành (completed tickets)

```
GET http://localhost:4010/games/bingo18/tickets/completed
```

| Mục         | Giá trị |
| ----------- | ------- |
| Method      | `GET`   |
| Path params | Không   |
| Body        | Không   |

### Query params

| Param    | Bắt buộc | Default   | Mô tả                          |
| -------- | -------- | --------- | ------------------------------ |
| `size`   | Không    | `20`      | Số lượng / trang (max 100)     |
| `cursor` | Không    | —         | ObjectId cursor cho trang tiếp |
| `sortBy` | Không    | `betDate` | Field sort                     |
| `from`   | Không    | —         | Ngày bắt đầu (YYYY-MM-DD)      |
| `to`     | Không    | —         | Ngày kết thúc (YYYY-MM-DD)     |

**Ví dụ:**

```
GET http://localhost:4010/games/bingo18/tickets/completed?size=5&sortBy=betDate&from=2026-01-01&to=2026-03-01
```

---

## 4. Chi tiết entries của một vé

```
GET http://localhost:4010/games/bingo18/tickets/{ticketId}/entries
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `GET`   |
| Query params | Không   |
| Body         | Không   |

### Path params

| Param      | Format                         | Ví dụ                      |
| ---------- | ------------------------------ | -------------------------- |
| `ticketId` | 24-char hex (MongoDB ObjectId) | `000000000000000000000001` |

**Ví dụ:**

```
GET http://localhost:4010/games/bingo18/tickets/000000000000000000000001/entries
```

---

## 5. Đặt cược (Place Bet)

```
POST http://localhost:4010/games/bingo18/bets
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `POST`  |
| Path params  | Không   |
| Query params | Không   |

### Quy tắc body

- `drawIds`: mảng 1-20 draw ID, không trùng, format `YYYY-MM-DD.NNN`
- `boards`: mảng 1-6 board (boardNo `"A"` đến `"F"`), không trùng boardNo
- **TẤT CẢ loại chơi** (cơ bản và bổ sung) đều nằm trong `boards[]`
- **Không còn** mảng `sideBets` riêng — bỏ hoàn toàn từ v1.0.13
- `boardNo`: **bắt buộc** cho mọi board, kể cả cược bổ sung
- Bingo 18 quay 3 viên xúc xắc (1-6), mỗi 6 phút
- `betCount`: **optional** (integer ≥ 1, mặc định `1`)

### Tất cả loại chơi (đều dùng trong boards[])

| playType       | Loại    | Mô tả                                       | Fields cần thiết                                    |
| -------------- | ------- | ------------------------------------------- | --------------------------------------------------- |
| `singleNum`    | Cơ bản  | Đoán 1 số (1-6), thắng theo số lần xuất hiện | `number` (1-6)                                     |
| `doubleMatch`  | Cơ bản  | 2 trong 3 xúc xắc trùng số đã chọn          | `number` (1-6)                                      |
| `tripleMatch`  | Cơ bản  | Cả 3 xúc xắc trùng nhau                    | `tripleKind` + `number` (nếu specific)              |
| `sumTotal`     | Bổ sung | Đoán tổng 3 xúc xắc bằng đúng 1 giá trị    | `sum` (3-18)                                        |
| `bigSmallDraw` | Bổ sung | Đoán Tài/Xỉu/Hòa theo tổng                  | `bet` (`"big"` / `"draw"` / `"small"`)              |

### TripleMatch tripleKind

| tripleKind | Mô tả              | number         |
| ---------- | ------------------ | -------------- |
| `specific` | Ba số trùng cụ thể | Bắt buộc (1-6) |
| `any`      | Ba số trùng bất kỳ | Không cần      |

> **bigSmallDraw:** `big` = tổng 12-18, `draw` = tổng 10-11, `small` = tổng 3-9

---

### 5a. SingleNum (betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3,
      "betCount": 1
    }
  ]
}
```

### 5b. SingleNum (betCount = 5 -- nhân 5 lần)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3,
      "betCount": 5
    }
  ]
}
```

### 5c. DoubleMatch (betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "doubleMatch",
      "number": 5,
      "betCount": 1
    }
  ]
}
```

### 5d. TripleMatch Specific (betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "tripleMatch",
      "tripleKind": "specific",
      "number": 6,
      "betCount": 1
    }
  ]
}
```

### 5e. TripleMatch Any (betCount = 3)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "tripleMatch",
      "tripleKind": "any",
      "betCount": 3
    }
  ]
}
```

### 5f. Cược bổ sung -- SumTotal (tổng = 10, betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "sumTotal", "sum": 10, "betCount": 1 }
  ]
}
```

### 5g. Cược bổ sung -- SumTotal (betCount = 10)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "sumTotal", "sum": 10, "betCount": 10 }
  ]
}
```

### 5h. Cược bổ sung -- BigSmallDraw (big, betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "bigSmallDraw", "bet": "big", "betCount": 1 }
  ]
}
```

### 5i. Cược bổ sung -- BigSmallDraw (small, betCount = 2)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "bigSmallDraw", "bet": "small", "betCount": 2 }
  ]
}
```

### 5j. Cược bổ sung -- BigSmallDraw (draw, betCount = 1)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "bigSmallDraw", "bet": "draw", "betCount": 1 }
  ]
}
```

### 5k. Combo: 3 boards cơ bản + 2 boards bổ sung (betCount đa dạng)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 1,
      "betCount": 1
    },
    {
      "boardNo": "B",
      "playType": "doubleMatch",
      "number": 4,
      "betCount": 2
    },
    {
      "boardNo": "C",
      "playType": "tripleMatch",
      "tripleKind": "any",
      "betCount": 1
    },
    {
      "boardNo": "D",
      "playType": "sumTotal",
      "sum": 12,
      "betCount": 3
    },
    {
      "boardNo": "E",
      "playType": "bigSmallDraw",
      "bet": "big",
      "betCount": 1
    }
  ]
}
```

### 5l. Multi-draw + combo đầy đủ 6 boards (4 cơ bản + 2 bổ sung, 3 draws)

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.002", "2026-02-28.003"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 1,
      "betCount": 1
    },
    {
      "boardNo": "B",
      "playType": "singleNum",
      "number": 6,
      "betCount": 5
    },
    {
      "boardNo": "C",
      "playType": "doubleMatch",
      "number": 3,
      "betCount": 1
    },
    {
      "boardNo": "D",
      "playType": "tripleMatch",
      "tripleKind": "specific",
      "number": 2,
      "betCount": 1
    },
    {
      "boardNo": "E",
      "playType": "sumTotal",
      "sum": 7,
      "betCount": 3
    },
    {
      "boardNo": "F",
      "playType": "bigSmallDraw",
      "bet": "small",
      "betCount": 1
    }
  ]
}
```

### 5m. Chỉ cược bổ sung (không board cơ bản)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "sumTotal", "sum": 18, "betCount": 5 },
    { "boardNo": "B", "playType": "bigSmallDraw", "bet": "draw", "betCount": 1 }
  ]
}
```

---

### Invalid cases (expect 400)

### 5n. Body rỗng

```json
{}
```

### 5o. drawIds rỗng

```json
{
  "drawIds": [],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3,
      "betCount": 1
    }
  ]
}
```

### 5p. Không có board nào (boards rỗng)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": []
}
```

### 5q. drawId trùng lặp

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3,
      "betCount": 1
    }
  ]
}
```

### 5r. drawId sai format

```json
{
  "drawIds": ["invalid-draw-id"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3,
      "betCount": 1
    }
  ]
}
```

### 5s. SingleNum thiếu number

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "betCount": 1
    }
  ]
}
```

### 5t. Number ngoài phạm vi (7 > 6)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 7,
      "betCount": 1
    }
  ]
}
```

### 5u. Number = 0 (dưới phạm vi)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 0,
      "betCount": 1
    }
  ]
}
```

### 5v. TripleMatch thiếu tripleKind

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "tripleMatch",
      "betCount": 1
    }
  ]
}
```

### 5w. TripleMatch specific thiếu number

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "tripleMatch",
      "tripleKind": "specific",
      "betCount": 1
    }
  ]
}
```

### 5x. TripleKind không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "tripleMatch",
      "tripleKind": "invalid",
      "betCount": 1
    }
  ]
}
```

### 5y. SumTotal thiếu sum

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "sumTotal", "betCount": 1 }
  ]
}
```

### 5z. SumTotal sum ngoài phạm vi (19 > 18)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "sumTotal", "sum": 19, "betCount": 1 }
  ]
}
```

### 5aa. SumTotal sum dưới phạm vi (2 < 3)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "sumTotal", "sum": 2, "betCount": 1 }
  ]
}
```

### 5ab. BigSmallDraw thiếu bet

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "bigSmallDraw", "betCount": 1 }
  ]
}
```

### 5ac. BigSmallDraw bet không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "bigSmallDraw", "bet": "invalidBet", "betCount": 1 }
  ]
}
```

### 5ad. playType không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "invalidType",
      "number": 3,
      "betCount": 1
    }
  ]
}
```

### 5ae. boardNo trùng lặp

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 1,
      "betCount": 1
    },
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 2,
      "betCount": 1
    }
  ]
}
```

### 5af. boardNo vượt quá "F" (không hợp lệ)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "G", "playType": "singleNum", "number": 3, "betCount": 1 }
  ]
}
```

### 5ag. boardNo thiếu (bắt buộc)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "playType": "singleNum", "number": 3, "betCount": 1 }
  ]
}
```

### 5ah. betCount = 0 (dưới phạm vi)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3,
      "betCount": 0
    }
  ]
}
```

### 5ai. betCount âm

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3,
      "betCount": -1
    }
  ]
}
```

### 5aj. betCount là float (không phải integer)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3,
      "betCount": 1.5
    }
  ]
}
```

### 5ak. Quá 20 drawIds

```json
{
  "drawIds": [
    "2026-02-28.001", "2026-02-28.002", "2026-02-28.003", "2026-02-28.004",
    "2026-02-28.005", "2026-02-28.006", "2026-02-28.007", "2026-02-28.008",
    "2026-02-28.009", "2026-02-28.010", "2026-02-28.011", "2026-02-28.012",
    "2026-02-28.013", "2026-02-28.014", "2026-02-28.015", "2026-02-28.016",
    "2026-02-28.017", "2026-02-28.018", "2026-02-28.019", "2026-02-28.020",
    "2026-02-28.021"
  ],
  "boards": [
    { "boardNo": "A", "playType": "singleNum", "number": 3, "betCount": 1 }
  ]
}
```

### 5al. Quá 6 boards (7 boards)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "singleNum", "number": 1, "betCount": 1 },
    { "boardNo": "B", "playType": "singleNum", "number": 2, "betCount": 1 },
    { "boardNo": "C", "playType": "singleNum", "number": 3, "betCount": 1 },
    { "boardNo": "D", "playType": "singleNum", "number": 4, "betCount": 1 },
    { "boardNo": "E", "playType": "singleNum", "number": 5, "betCount": 1 },
    { "boardNo": "F", "playType": "singleNum", "number": 6, "betCount": 1 },
    { "boardNo": "G", "playType": "singleNum", "number": 1, "betCount": 1 }
  ]
}
```

### 5am. Gửi sideBets (không còn hỗ trợ — expect 400)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "singleNum", "number": 3, "betCount": 1 }
  ],
  "sideBets": [
    { "playType": "sumTotal", "sum": 10, "betCount": 1 }
  ]
}
```

### 5an. Number là string thay vì integer

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": "3",
      "betCount": 1
    }
  ]
}
```
