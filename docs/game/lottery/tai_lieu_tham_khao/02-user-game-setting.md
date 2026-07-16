# 02 — User Game Setting (Giới hạn cược theo tài khoản) & Game Limit

**Mục đích**: kiểm soát giới hạn điểm cược cho từng tài khoản trong cây phân cấp, và cơ chế "danh sách giới hạn" (game-limit) để bóp giới hạn các tài khoản nghi gian lận.

Đường dẫn: `server/src/services/lottery/services/user-game-setting`.

Gồm **2 nhóm cấu hình độc lập**:

1. **User Game Setting** (`userGameSettings`): giới hạn điểm cược của từng tài khoản, kế thừa từ cha khi tạo tài khoản mới.
2. **Game Limit** (`gameLimits` + `gameLimitSettings` + `gameLimitUsers`): "danh sách giới hạn" gắn thêm `MaxPointForNoShare`/`MaxPointForMaxShare` liên quan tới % thầu công ty.

---

## A. User Game Setting

### A.1 Entity `UserGameSettingEntity` — collection `userGameSettings`

`entities/user-game-setting-entity.ts:8`

| Field                 | Kiểu              | Ý nghĩa                                                                               |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `UserId`              | string            | ID tài khoản                                                                          |
| `GameType`            | GameType          | Đài                                                                                   |
| `BetType`             | BetType           | Kiểu cược                                                                             |
| `ParentId`            | string            | ID tài khoản cha                                                                      |
| `Level`               | UserCustomerLevel | Cấp tài khoản                                                                         |
| `Path`                | string            | Ancestor path (dùng regex cập nhật cây con)                                           |
| `MaxPointPerNumber`   | number            | Điểm tối đa cược vào 1 số/1 dãy (xiên) trong **1 lần** — chủ yếu áp dụng cho Hội Viên |
| `TotalPointPerNumber` | number            | Tổng điểm tối đa cho mỗi số trong **1 kỳ**                                            |

> Điểm số lưu bằng **`Long.fromNumber`** (BSON Long) tránh tràn số. Field MongoDB: `MaxPointPerNumber`→`max_point_per_nr`, `TotalPointPerNumber`→`total_point_per_nr`.

### A.2 Khởi tạo tài khoản mới — `initializeNewUserGameSetting` (`services/user-game-setting-service.ts:43`)

Copy nguyên cấu hình từ cha:

```typescript
// Lấy tất cả setting của parentId, map sang user con giữ nguyên Max/TotalPointPerNumber
{ UserId, GameType, BetType, ParentId, Level, Path,
  MaxPointPerNumber: obj.MaxPointPerNumber,
  TotalPointPerNumber: obj.TotalPointPerNumber }
```

→ `insertSettings` (upsert `$setOnInsert`).

Được trigger bởi worker SQS `initialize-new-user-trigger.ts` (queue `SQS_QUEUE_LOTTERY_USER_GAME_SETTING_INITIALIZE`, reservedConcurrency 10, timeout 300s). Chỉ xử lý `user.Type === Customer`.

### A.3 Cập nhật giới hạn — `updateGameSetting` (`user-game-setting-service.ts:98`)

Guard nghiệp vụ:

- `checkPermission(adminId, userId)` — admin phải có quyền trên user.
- `parentSetting.TotalPointPerNumber < param.totalPointPerNumber` → throw (con không vượt tổng của cha).
- `parentSetting.MaxPointPerNumber < param.maxPointPerNumber` → throw.
- `param.maxPointPerNumber > param.totalPointPerNumber` → throw (max/lần ≤ tổng/kỳ).
- Update + ghi activity log (old/new values).

### A.4 Cascade update xuống cây con — `updateSetting` (`repositories/user-game-setting-repository.ts:121`)

**Rất quan trọng để tái tạo tính đúng đắn phân cấp**:

```typescript
// (1) Update chính tài khoản
updateOne: filter {UserId, GameType, BetType} $set {Max, Total}
// (2) Bóp TotalPointPerNumber các con nếu con > cha mới
updateMany: filter {GameType, BetType, Path: /^buildUserPath(UserId,Path)/,
                    TotalPointPerNumber: {$gt: newTotal}} $set {Total: newTotal}
// (3) Tương tự cho MaxPointPerNumber
updateMany: filter {..., MaxPointPerNumber: {$gt: newMax}} $set {Max: newMax}
```

→ Khi cha giảm giới hạn, mọi con đang cao hơn bị kéo xuống bằng regex `^path`.

### A.5 Đọc cấu hình

- `adminGetUserGameSettings` (line 259): trả cấu hình con kèm cấu hình cha (`Parent.{Max,Total}PointPerNumber`) để UI validate.
- `getGameBetTypeSettings` (line 346): list `{GameType, BetType, MaxPointPerNumber, TotalPointPerNumber}` cho chính user.

---

## B. Game Limit (danh sách giới hạn)

### B.1 Entities

**`GameLimitEntity`** — collection `gameLimits` (`entities/game-limit-entity.ts:6`): `{ Title, Code, Description, CreatedAt, UpdatedAt }`. Code ví dụ `"default"`.

**`GameLimitSettingEntity`** — collection `gameLimitSettings` (`entities/game-limit-setting-entity.ts:8`):

| Field                           | Kiểu   | Ý nghĩa                                  |
| ------------------------------- | ------ | ---------------------------------------- |
| `GameLimitId` / `GameLimitCode` | string | Thuộc giới hạn nào                       |
| `GameType` / `BetType`          | enum   | Game + kiểu cược                         |
| `MaxPointPerNumber`             | number | Điểm tối đa/số/lần (Hội Viên)            |
| `TotalPointPerNumber`           | number | Tổng điểm/số/kỳ                          |
| `MaxPointForNoShare`            | number | Điểm tối đa/số nếu **công ty thầu 100%** |
| `MaxPointForMaxShare`           | number | Điểm tối đa/số nếu **công ty thầu 0%**   |
| `CreatedAt`/`UpdatedAt`         | Date   |                                          |

**`GameLimitUserEntity`** — collection `gameLimitUsers` (`entities/game-limit-user-entity.ts:7`): `{ GameLimitId, GameLimitCode, UserId, Username, FullName, ParentId, Level, Path, CreatedAt }` — ánh xạ tài khoản → giới hạn.

### B.2 Resolve giới hạn theo cây — `getPlayerGameLimitId` (`services/game-limit-user-service.ts:129`)

```typescript
const userIdList = [...UserHelper.splitUserPath(path), userId]; // toàn bộ nhánh Player→Company
const gameLimitUsers = getGameLimitUsersByUserList(userIdList);
if (empty) return null; // không giới hạn
// Sắp xếp theo Level giảm dần (Player level=9 cao nhất → Company)
const sorted = _.orderBy(gameLimitUsers, [(o) => o.Level], "desc");
return sorted[0].GameLimitId; // ưu tiên giới hạn gần Player nhất
```

### B.3 Cache

- `GameLimitSettingCachedService.getSettingCached`: key `lottery:...:game_limit_setting:{limitId}:{gt}:{bt}`, TTL 10 phút.
- `GameLimitUserCachedService.getUserGameLimit`: key `...:player_limit_setting:{userId}:{gt}:{bt}`, TTL 10 phút. **Cache cả trường hợp "không bị giới hạn"** bằng chuỗi `"null"` để giảm tải DB.
- `getUserGameLimitSettingFromMongoDB`: gọi `getPlayerGameLimitId` → nếu có → `getSettingCached` → trả `{MaxPointForMaxShare, MaxPointForNoShare, MaxPointPerNumber, TotalPointPerNumber}`.

---

## C. API endpoints

**Agent** (`ag-endpoint.yml`, `ag-endpoint.admin.yml`):

| Method | Path              | Handler                      | Quyền                  |
| ------ | ----------------- | ---------------------------- | ---------------------- |
| GET    | `/agent`          | `get-my-settings`            | Agent                  |
| GET    | `/agent/{UserId}` | `admin-get-user-settings`    | Agent + `ReadAccount`  |
| PUT    | `/agent/{UserId}` | `admin-update-user-settings` | Agent + `WriteAccount` |

**Game Limit — chỉ Company** (`ag-game-limit-endpoint.admin.yml`):

| GET | `/agent/game-limit/settings` | `list-settings` |
| PUT | `/agent/game-limit/settings` | `update-settings` |
| GET | `/agent/game-limit/users` | `list-users-in-limit` |
| PUT | `/agent/game-limit/users` | `add-users-to-limit` |
| DELETE | `/agent/game-limit/users` | `remove-users-to-limit` |

**Player** (`pl-endpoint.yml`): `GET /player` (provisionedConcurrency 2).

- `admin-update-user-settings`: body **mảng** `[{GameType, BetType, MaxPointPerNumber≥0, TotalPointPerNumber≥0}]`.
- `game-limits/update-settings`: body mảng `[{Id, MaxPointPerNumber, TotalPointPerNumber, MaxPointForNoShare, MaxPointForMaxShare}]`.
- `game-limits/add-users-to-limit`: `{GameLimitCode, Usernames[≤100]}`.

---

## D. Cách dùng khi đặt cược

Khi validate cược (state `validate-game-setting`), hệ thống:

1. Lấy `userGameLimitSetting` (giới hạn riêng nếu user trong game-limit) — nếu có thì **ưu tiên** dùng nó.
2. Nếu không → dùng `userGameSetting` + `parameter`.
3. Tính `maxPointCanBetPerNumber` (xem file 07) dựa trên `MaxPointForNoShare/MaxPointForMaxShare` + % thầu công ty.

---

## E. Gợi ý khi xây lại

1. **Cascade `^path` + `$gt`** khi cha giảm giới hạn là logic then chốt — phải test kỹ với cây sâu nhiều tầng.
2. **Kế thừa từ cha khi tạo user** (qua queue) giúp mọi tài khoản mới có sẵn cấu hình hợp lệ, không cần seed thủ công.
3. **Cache negative (`"null"`)** giảm tải DB đáng kể vì đa số user không bị giới hạn.
4. Game-limit "default" ban đầu = snapshot của parameter + user setting gốc (xem test `init-game-limit.spec.ts`).
