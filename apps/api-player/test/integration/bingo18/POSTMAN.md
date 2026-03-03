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
- `boards`: mảng 0-6 board (boardNo `"A"` đến `"F"`), không trùng boardNo
- `sideBets`: mảng side bets
- Phải có ít nhất 1 board hoặc 1 side bet
- Bingo 18 quay 3 viên xúc xắc (1-6), mỗi 6 phút

### Cách chơi cơ bản (boards)

| playType      | Mô tả                                       | Fields cần thiết                       |
| ------------- | ------------------------------------------- | -------------------------------------- |
| `singleNum`   | Một số (1-6), thắng theo số lần xuất hiện   | `number` (1-6)                         |
| `doubleMatch` | Hai số trùng (1-6), 2 trong 3 xúc xắc giống | `number` (1-6)                         |
| `tripleMatch` | Ba số trùng                                 | `tripleKind` + `number` (nếu specific) |

### TripleMatch tripleKind

| tripleKind | Mô tả              | number         |
| ---------- | ------------------ | -------------- |
| `specific` | Ba số trùng cụ thể | Bắt buộc (1-6) |
| `any`      | Ba số trùng bất kỳ | Không cần      |

### Cách chơi bổ sung (sideBets)

| playType       | Mô tả               | Fields cần thiết                       |
| -------------- | ------------------- | -------------------------------------- |
| `sumTotal`     | Đoán tổng 3 xúc xắc | `sum` (3-18)                           |
| `bigSmallDraw` | Lớn/Hòa/Nhỏ         | `bet` (`"big"` / `"draw"` / `"small"`) |

> **Big:** tổng 12-18, **Draw:** tổng 10-11, **Small:** tổng 3-9

---

### 5a. SingleNum (chọn số 3)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3
    }
  ]
}
```

### 5b. DoubleMatch (chọn số 5)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "doubleMatch",
      "number": 5
    }
  ]
}
```

### 5c. TripleMatch Specific (chọn số 6)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "tripleMatch",
      "tripleKind": "specific",
      "number": 6
    }
  ]
}
```

### 5d. TripleMatch Any (bất kỳ bộ ba)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "tripleMatch",
      "tripleKind": "any"
    }
  ]
}
```

### 5e. Side bet -- SumTotal (tổng = 10)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "sumTotal", "sum": 10 }]
}
```

### 5f. Side bet -- BigSmallDraw (big)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "bigSmallDraw", "bet": "big" }]
}
```

### 5g. Side bet -- BigSmallDraw (small)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "bigSmallDraw", "bet": "small" }]
}
```

### 5h. Side bet -- BigSmallDraw (draw)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "bigSmallDraw", "bet": "draw" }]
}
```

### 5i. Combo: 3 boards + 2 side bets

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 1
    },
    {
      "boardNo": "B",
      "playType": "doubleMatch",
      "number": 4
    },
    {
      "boardNo": "C",
      "playType": "tripleMatch",
      "tripleKind": "any"
    }
  ],
  "sideBets": [
    { "playType": "sumTotal", "sum": 12 },
    { "playType": "bigSmallDraw", "bet": "big" }
  ]
}
```

### 5j. Multi-draw + combo (6 boards + 2 side bets, 3 draws)

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.002", "2026-02-28.003"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 1
    },
    {
      "boardNo": "B",
      "playType": "singleNum",
      "number": 6
    },
    {
      "boardNo": "C",
      "playType": "doubleMatch",
      "number": 3
    },
    {
      "boardNo": "D",
      "playType": "doubleMatch",
      "number": 5
    },
    {
      "boardNo": "E",
      "playType": "tripleMatch",
      "tripleKind": "specific",
      "number": 2
    },
    {
      "boardNo": "F",
      "playType": "tripleMatch",
      "tripleKind": "any"
    }
  ],
  "sideBets": [
    { "playType": "sumTotal", "sum": 7 },
    { "playType": "bigSmallDraw", "bet": "small" }
  ]
}
```

### 5k. Chỉ side bets (không board)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [
    { "playType": "sumTotal", "sum": 18 },
    { "playType": "bigSmallDraw", "bet": "draw" }
  ]
}
```

---

### Invalid cases (expect 400)

### 5l. Body rỗng

```json
{}
```

### 5m. drawIds rỗng

```json
{
  "drawIds": [],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3
    }
  ]
}
```

### 5n. Không có board lẫn sideBet

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [],
  "sideBets": []
}
```

### 5o. drawId trùng lặp

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3
    }
  ]
}
```

### 5p. drawId sai format

```json
{
  "drawIds": ["invalid-draw-id"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3
    }
  ]
}
```

### 5q. SingleNum thiếu number

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum"
    }
  ]
}
```

### 5r. Number ngoài phạm vi (7 > 6)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 7
    }
  ]
}
```

### 5s. Number = 0 (dưới phạm vi)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 0
    }
  ]
}
```

### 5t. TripleMatch thiếu tripleKind

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "tripleMatch"
    }
  ]
}
```

### 5u. TripleMatch specific thiếu number

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "tripleMatch",
      "tripleKind": "specific"
    }
  ]
}
```

### 5v. TripleKind không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "tripleMatch",
      "tripleKind": "invalid"
    }
  ]
}
```

### 5w. SumTotal thiếu sum

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "sumTotal" }]
}
```

### 5x. SumTotal sum ngoài phạm vi (19 > 18)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "sumTotal", "sum": 19 }]
}
```

### 5y. SumTotal sum dưới phạm vi (2 < 3)

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "sumTotal", "sum": 2 }]
}
```

### 5z. BigSmallDraw thiếu bet

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "bigSmallDraw" }]
}
```

### 5aa. BigSmallDraw bet không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "bigSmallDraw", "bet": "invalidBet" }]
}
```

### 5ab. Side bet playType không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "sideBets": [{ "playType": "invalidType", "sum": 10 }]
}
```

### 5ac. playType board không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "invalidType",
      "number": 3
    }
  ]
}
```

### 5ad. boardNo trùng lặp

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 1
    },
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 2
    }
  ]
}
```

### 5ae. Quá 20 drawIds

```json
{
  "drawIds": [
    "2026-02-28.001",
    "2026-02-28.002",
    "2026-02-28.003",
    "2026-02-28.004",
    "2026-02-28.005",
    "2026-02-28.006",
    "2026-02-28.007",
    "2026-02-28.008",
    "2026-02-28.009",
    "2026-02-28.010",
    "2026-02-28.011",
    "2026-02-28.012",
    "2026-02-28.013",
    "2026-02-28.014",
    "2026-02-28.015",
    "2026-02-28.016",
    "2026-02-28.017",
    "2026-02-28.018",
    "2026-02-28.019",
    "2026-02-28.020",
    "2026-02-28.021"
  ],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": 3
    }
  ]
}
```

### 5af. Quá 6 boards (7 boards)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    { "boardNo": "A", "playType": "singleNum", "number": 1 },
    { "boardNo": "B", "playType": "singleNum", "number": 2 },
    { "boardNo": "C", "playType": "singleNum", "number": 3 },
    { "boardNo": "D", "playType": "singleNum", "number": 4 },
    { "boardNo": "E", "playType": "singleNum", "number": 5 },
    { "boardNo": "F", "playType": "singleNum", "number": 6 },
    { "boardNo": "G", "playType": "singleNum", "number": 1 }
  ]
}
```

### 5ag. Number là string thay vì integer

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "singleNum",
      "number": "3"
    }
  ]
}
```
