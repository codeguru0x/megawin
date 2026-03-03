# Mega 6/45 -- Postman Manual Test Reference

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
GET http://localhost:4010/games/mega645/draws/current
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `GET`   |
| Path params  | Không   |
| Query params | Không   |
| Body         | Không   |

---

## 2. Lấy thông tin Jackpot

```
GET http://localhost:4010/games/mega645/jackpot
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `GET`   |
| Path params  | Không   |
| Query params | Không   |
| Body         | Không   |

---

## 3. Danh sách vé đang chờ (pending tickets)

```
GET http://localhost:4010/games/mega645/tickets/pending
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
GET http://localhost:4010/games/mega645/tickets/pending?size=5
```

---

## 4. Danh sách vé đã hoàn thành (completed tickets)

```
GET http://localhost:4010/games/mega645/tickets/completed
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
GET http://localhost:4010/games/mega645/tickets/completed?size=5&sortBy=betDate&from=2026-01-01&to=2026-03-01
```

---

## 5. Chi tiết entries của một vé

```
GET http://localhost:4010/games/mega645/tickets/{ticketId}/entries
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
GET http://localhost:4010/games/mega645/tickets/000000000000000000000001/entries
```

---

## 6. Danh sách lines của một entry

```
GET http://localhost:4010/games/mega645/entries/{entryId}/lines
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
GET http://localhost:4010/games/mega645/entries/000000000000000000000001/lines?size=10&cursor=0
```

---

## 7. Đặt cược (Place Bet)

```
POST http://localhost:4010/games/mega645/bets
```

| Mục          | Giá trị |
| ------------ | ------- |
| Method       | `POST`  |
| Path params  | Không   |
| Query params | Không   |

### Quy tắc body

- `drawIds`: mảng 1-6 draw ID, không trùng, format `YYYY-MM-DD.NNN`
- `boards`: mảng 1-6 board, boardNo từ `"A"` đến `"F"`, không trùng boardNo
- Mỗi board gồm: `boardNo`, `playType`, `selection` (`mainNumbers`)
- Số chính (`mainNumbers`): `"01"` đến `"45"`, không trùng
- Mega 6/45 **không có** `specialNumbers` (khác Lotto 5/35)

### Quy tắc theo playType

| playType    | mainNumbers                              |
| ----------- | ---------------------------------------- |
| `standard`  | Đúng 6 số                                |
| `bao5`      | Đúng 5 số                                |
| `bao7`      | Đúng 7 số                                |
| `bao8`      | Đúng 8 số                                |
| `bao9`      | Đúng 9 số                                |
| `bao10`     | Đúng 10 số                               |
| `bao11`     | Đúng 11 số                               |
| `bao12`     | Đúng 12 số                               |
| `bao13`     | Đúng 13 số                               |
| `bao14`     | Đúng 14 số                               |
| `bao15`     | Đúng 15 số                               |
| `bao18`     | Đúng 18 số (lưu ý: không có Bao16/Bao17) |
| `quickPick` | Không cần (hệ thống random 6 số)         |

---

### 7a. Standard (6 số chính)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "45"]
      }
    }
  ]
}
```

### 7b. Bao 5 (5 số → C(5,6) -- hệ thống xử lý)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao5",
      "selection": {
        "mainNumbers": ["03", "12", "25", "30", "42"]
      }
    }
  ]
}
```

### 7c. Bao 7 (7 số → C(7,6) = 7 bộ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao7",
      "selection": {
        "mainNumbers": ["03", "12", "25", "30", "42", "44", "45"]
      }
    }
  ]
}
```

### 7d. Bao 8 (8 số → C(8,6) = 28 bộ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao8",
      "selection": {
        "mainNumbers": ["02", "09", "15", "21", "28", "34", "41", "45"]
      }
    }
  ]
}
```

### 7e. Bao 9 (9 số → C(9,6) = 84 bộ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao9",
      "selection": {
        "mainNumbers": ["01", "05", "10", "18", "27", "33", "38", "42", "45"]
      }
    }
  ]
}
```

### 7f. Bao 10 (10 số → C(10,6) = 210 bộ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao10",
      "selection": {
        "mainNumbers": [
          "01",
          "06",
          "11",
          "16",
          "21",
          "26",
          "31",
          "36",
          "41",
          "45"
        ]
      }
    }
  ]
}
```

### 7g. Bao 11 (11 số → C(11,6) = 462 bộ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao11",
      "selection": {
        "mainNumbers": [
          "01",
          "05",
          "10",
          "15",
          "20",
          "25",
          "30",
          "33",
          "37",
          "41",
          "45"
        ]
      }
    }
  ]
}
```

### 7h. Bao 12 (12 số → C(12,6) = 924 bộ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao12",
      "selection": {
        "mainNumbers": [
          "01",
          "05",
          "10",
          "15",
          "20",
          "25",
          "30",
          "33",
          "37",
          "41",
          "44",
          "45"
        ]
      }
    }
  ]
}
```

### 7i. Bao 13 (13 số → C(13,6) = 1.716 bộ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao13",
      "selection": {
        "mainNumbers": [
          "01",
          "04",
          "08",
          "12",
          "16",
          "20",
          "24",
          "28",
          "32",
          "36",
          "40",
          "43",
          "45"
        ]
      }
    }
  ]
}
```

### 7j. Bao 14 (14 số → C(14,6) = 3.003 bộ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao14",
      "selection": {
        "mainNumbers": [
          "01",
          "04",
          "07",
          "10",
          "13",
          "16",
          "19",
          "22",
          "25",
          "28",
          "33",
          "38",
          "42",
          "45"
        ]
      }
    }
  ]
}
```

### 7k. Bao 15 (15 số → C(15,6) = 5.005 bộ số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao15",
      "selection": {
        "mainNumbers": [
          "01",
          "04",
          "07",
          "10",
          "13",
          "16",
          "19",
          "22",
          "25",
          "28",
          "31",
          "35",
          "39",
          "42",
          "45"
        ]
      }
    }
  ]
}
```

### 7l. Bao 18 (18 số → C(18,6) = 18.564 bộ số, lưu ý: không có Bao16/Bao17)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao18",
      "selection": {
        "mainNumbers": [
          "01",
          "03",
          "06",
          "09",
          "12",
          "15",
          "18",
          "21",
          "24",
          "27",
          "30",
          "33",
          "36",
          "38",
          "40",
          "42",
          "44",
          "45"
        ]
      }
    }
  ]
}
```

### 7m. QuickPick (hệ thống random 6 số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "quickPick",
      "selection": {
        "mainNumbers": []
      }
    }
  ]
}
```

### 7n. Multi-board (3 boards, các playType khác nhau)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "45"]
      }
    },
    {
      "boardNo": "B",
      "playType": "bao7",
      "selection": {
        "mainNumbers": ["03", "12", "25", "30", "38", "42", "45"]
      }
    },
    {
      "boardNo": "C",
      "playType": "quickPick",
      "selection": {
        "mainNumbers": []
      }
    }
  ]
}
```

### 7o. Multi-draw + multi-board (6 boards, 3 draws)

```json
{
  "drawIds": ["2026-02-28.001", "2026-03-02.001", "2026-03-04.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "45"]
      }
    },
    {
      "boardNo": "B",
      "playType": "bao8",
      "selection": {
        "mainNumbers": ["02", "09", "15", "21", "28", "34", "41", "45"]
      }
    },
    {
      "boardNo": "C",
      "playType": "bao12",
      "selection": {
        "mainNumbers": [
          "01",
          "05",
          "10",
          "15",
          "20",
          "25",
          "30",
          "33",
          "37",
          "41",
          "44",
          "45"
        ]
      }
    },
    {
      "boardNo": "D",
      "playType": "bao5",
      "selection": {
        "mainNumbers": ["08", "16", "24", "31", "39"]
      }
    },
    {
      "boardNo": "E",
      "playType": "quickPick",
      "selection": {
        "mainNumbers": []
      }
    },
    {
      "boardNo": "F",
      "playType": "bao7",
      "selection": {
        "mainNumbers": ["03", "11", "19", "27", "33", "40", "45"]
      }
    }
  ]
}
```

---

### Invalid cases (expect 400)

### 7p. Body rỗng

```json
{}
```

### 7q. drawIds rỗng

```json
{
  "drawIds": [],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "45"]
      }
    }
  ]
}
```

### 7r. boards rỗng

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": []
}
```

### 7s. drawId trùng lặp

```json
{
  "drawIds": ["2026-02-28.001", "2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "45"]
      }
    }
  ]
}
```

### 7t. drawId sai format

```json
{
  "drawIds": ["invalid-draw-id"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "45"]
      }
    }
  ]
}
```

### 7u. mainNumber ngoài phạm vi (46 > 45)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "46"]
      }
    }
  ]
}
```

### 7v. mainNumber = "00" (dưới phạm vi)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["00", "07", "14", "22", "35", "45"]
      }
    }
  ]
}
```

### 7w. Số không zero-pad

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["1", "7", "14", "22", "35", "45"]
      }
    }
  ]
}
```

### 7x. Standard sai số lượng mainNumbers (5 thay vì 6)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35"]
      }
    }
  ]
}
```

### 7y. Standard sai số lượng mainNumbers (7 thay vì 6)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "40", "45"]
      }
    }
  ]
}
```

### 7z. Số trùng lặp trong mainNumbers

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "35"]
      }
    }
  ]
}
```

### 7aa. playType không hợp lệ

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "invalidType",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "45"]
      }
    }
  ]
}
```

### 7ab. boardNo trùng lặp

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "45"]
      }
    },
    {
      "boardNo": "A",
      "playType": "quickPick",
      "selection": {
        "mainNumbers": []
      }
    }
  ]
}
```

### 7ac. Quá 6 drawIds

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
      "playType": "standard",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "45"]
      }
    }
  ]
}
```

### 7ad. Bao7 với chỉ 6 số (thiếu 1 số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao7",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "45"]
      }
    }
  ]
}
```

### 7ae. Bao18 với chỉ 17 số (thiếu 1 số)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "bao18",
      "selection": {
        "mainNumbers": [
          "01",
          "03",
          "06",
          "09",
          "12",
          "15",
          "18",
          "21",
          "24",
          "27",
          "30",
          "33",
          "36",
          "38",
          "40",
          "42",
          "44"
        ]
      }
    }
  ]
}
```

### 7af. mainNumbers chứa số integer thay vì string

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {
        "mainNumbers": [1, 7, 14, 22, 35, 45]
      }
    }
  ]
}
```

### 7ag. Thiếu mainNumbers trong selection

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": {}
    }
  ]
}
```

### 7ah. Board thiếu playType

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "selection": {
        "mainNumbers": ["01", "07", "14", "22", "35", "45"]
      }
    }
  ]
}
```

### 7ai. Quá 6 boards (7 boards)

```json
{
  "drawIds": ["2026-02-28.001"],
  "boards": [
    {
      "boardNo": "A",
      "playType": "standard",
      "selection": { "mainNumbers": ["01", "07", "14", "22", "35", "45"] }
    },
    {
      "boardNo": "B",
      "playType": "standard",
      "selection": { "mainNumbers": ["02", "08", "15", "23", "36", "44"] }
    },
    {
      "boardNo": "C",
      "playType": "standard",
      "selection": { "mainNumbers": ["03", "09", "16", "24", "37", "43"] }
    },
    {
      "boardNo": "D",
      "playType": "standard",
      "selection": { "mainNumbers": ["04", "10", "17", "25", "38", "42"] }
    },
    {
      "boardNo": "E",
      "playType": "standard",
      "selection": { "mainNumbers": ["05", "11", "18", "26", "39", "41"] }
    },
    {
      "boardNo": "F",
      "playType": "standard",
      "selection": { "mainNumbers": ["06", "12", "19", "27", "40", "45"] }
    },
    {
      "boardNo": "G",
      "playType": "standard",
      "selection": { "mainNumbers": ["01", "13", "20", "28", "34", "44"] }
    }
  ]
}
```
