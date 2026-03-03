# Max 3D -- Postman Manual Test Reference

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
GET http://localhost:4010/games/max3d/draws/current
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
GET http://localhost:4010/games/max3d/tickets/pending
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
GET http://localhost:4010/games/max3d/tickets/pending?size=5
```

---

## 3. Danh sách vé đã hoàn thành (completed tickets)

```
GET http://localhost:4010/games/max3d/tickets/completed
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
GET http://localhost:4010/games/max3d/tickets/completed?size=5&sortBy=betDate&from=2026-01-01&to=2026-03-01
```

---

## 4. Chi tiết entries của một vé

```
GET http://localhost:4010/games/max3d/tickets/{ticketId}/entries
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
GET http://localhost:4010/games/max3d/tickets/000000000000000000000001/entries
```

---

## 5. Danh sách lines của một entry

```
GET http://localhost:4010/games/max3d/entries/{entryId}/lines
```

| Mục    | Giá trị |
| ------ | ------- |
| Method | `GET`   |
| Body   | Không   |

### Path params

| Param     | Format                         | Ví dụ                      |
| --------- | ------------------------------ | -------------------------- |
| `entryId` | 24-char hex (MongoDB ObjectId) | `000000000000000000000001` |

### Query params

| Param    | Bắt buộc | Default | Mô tả                                    |
| -------- | -------- | ------- | ---------------------------------------- |
| `size`   | Không    | `20`    | Số lượng / trang (max 100)               |
| `cursor` | Không    | —       | Line index (integer >= 0) cho trang tiếp |

**Ví dụ:**

```
GET http://localhost:4010/games/max3d/entries/000000000000000000000001/lines?size=10&cursor=0
```

---

## 6. Đặt cược (Place Bet)

```
POST http://localhost:4010/games/max3d/bets
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `POST`  |
| Path params  | Không   |
| Query params | Không   |

### Quy tắc body

- `drawIds`: mảng 1-6 draw ID, không trùng, format `YYYY-MM-DD.NNN`
- `boards`: mảng 1-4 board, boardNo từ `"A"` đến `"D"`, không trùng boardNo
- Mỗi board gồm: `boardNo`, `playMode`, `playType`, `triplets`
- `playMode`: `"basic"` (1 bộ ba số) hoặc `"plus"` (2 bộ ba số)
- `playType`: `"straight"`, `"combo3"`, `"combo6"`, `"quickPick"`
- `triplets`: mảng string 3 chữ số `"000"` đến `"999"`

### Quy tắc theo playMode + playType

| playMode | playType    | triplets                                      |
| -------- | ----------- | --------------------------------------------- |
| `basic`  | `straight`  | Đúng 1 bộ ba                                  |
| `basic`  | `combo3`    | Đúng 1 bộ ba (2 chữ số giống → 3 hoán vị)     |
| `basic`  | `combo6`    | Đúng 1 bộ ba (3 chữ số khác nhau → 6 hoán vị) |
| `basic`  | `quickPick` | Không cần (hệ thống random)                   |
| `plus`   | `straight`  | Đúng 2 bộ ba                                  |
| `plus`   | `quickPick` | Không cần (hệ thống random)                   |

> **Lưu ý:** Plus chỉ hỗ trợ `straight` hoặc `quickPick`, không hỗ trợ `combo3`/`combo6`.

---

### 6a. Basic Straight (1 bộ ba số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["123"]
    }
  ]
}
```

### 6b. Basic Combo3 (1 bộ ba, 2 chữ số giống → 3 hoán vị)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "combo3",
      "triplets": ["112"]
    }
  ]
}
```

### 6c. Basic Combo6 (1 bộ ba, 3 chữ số khác nhau → 6 hoán vị)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "combo6",
      "triplets": ["123"]
    }
  ]
}
```

### 6d. Basic QuickPick

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "quickPick",
      "triplets": []
    }
  ]
}
```

### 6e. Plus Straight (2 bộ ba số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "plus",
      "playType": "straight",
      "triplets": ["123", "456"]
    }
  ]
}
```

### 6f. Plus QuickPick

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "plus",
      "playType": "quickPick",
      "triplets": []
    }
  ]
}
```

### 6g. Multi-board (3 boards, các playMode/playType khác nhau)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["000"]
    },
    {
      "boardNo": "B",
      "playMode": "plus",
      "playType": "straight",
      "triplets": ["555", "999"]
    },
    {
      "boardNo": "C",
      "playMode": "basic",
      "playType": "quickPick",
      "triplets": []
    }
  ]
}
```

### 6h. Multi-draw + multi-board (4 boards, 3 draws)

```json
{
  "drawIds": ["2026-02-28.001", "2026-03-02.001", "2026-03-04.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["123"]
    },
    {
      "boardNo": "B",
      "playMode": "basic",
      "playType": "combo6",
      "triplets": ["456"]
    },
    {
      "boardNo": "C",
      "playMode": "plus",
      "playType": "straight",
      "triplets": ["789", "012"]
    },
    {
      "boardNo": "D",
      "playMode": "basic",
      "playType": "quickPick",
      "triplets": []
    }
  ]
}
```

---

### Invalid cases (expect 400)

### 6i. Body rỗng

```json
{}
```

### 6j. drawIds rỗng

```json
{
  "drawIds": [],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["123"]
    }
  ]
}
```

### 6k. boards rỗng

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": []
}
```

### 6l. drawId trùng lặp

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["123"]
    }
  ]
}
```

### 6m. drawId sai format

```json
{
  "drawIds": ["invalid-draw-id"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["123"]
    }
  ]
}
```

### 6n. Triplet sai format (2 chữ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["12"]
    }
  ]
}
```

### 6o. Triplet sai format (4 chữ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["1234"]
    }
  ]
}
```

### 6p. Triplet chứa ký tự không phải số

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["abc"]
    }
  ]
}
```

### 6q. Basic straight với 2 triplets (thừa)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["123", "456"]
    }
  ]
}
```

### 6r. Plus straight với 1 triplet (thiếu)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "plus",
      "playType": "straight",
      "triplets": ["123"]
    }
  ]
}
```

### 6s. Plus combo3 (không hỗ trợ)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "plus",
      "playType": "combo3",
      "triplets": ["112", "334"]
    }
  ]
}
```

### 6t. Plus combo6 (không hỗ trợ)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "plus",
      "playType": "combo6",
      "triplets": ["123", "456"]
    }
  ]
}
```

### 6u. playType không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "invalidType",
      "triplets": ["123"]
    }
  ]
}
```

### 6v. playMode không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "invalidMode",
      "playType": "straight",
      "triplets": ["123"]
    }
  ]
}
```

### 6w. boardNo trùng lặp

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["123"]
    },
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "quickPick",
      "triplets": []
    }
  ]
}
```

### 6x. Quá 6 drawIds

```json
{
  "drawIds": [
    "2026-02-28.001",
    "2026-03-02.001",
    "2026-03-04.001",
    "2026-03-06.001",
    "2026-03-09.001",
    "2026-03-11.001",
    "2026-03-13.001"
  ],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["123"]
    }
  ]
}
```

### 6y. Quá 4 boards (5 boards)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["111"]
    },
    {
      "boardNo": "B",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["222"]
    },
    {
      "boardNo": "C",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["333"]
    },
    {
      "boardNo": "D",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["444"]
    },
    {
      "boardNo": "E",
      "playMode": "basic",
      "playType": "straight",
      "triplets": ["555"]
    }
  ]
}
```

### 6z. Triplets rỗng cho non-quickPick

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playMode": "basic",
      "playType": "straight",
      "triplets": []
    }
  ]
}
```
