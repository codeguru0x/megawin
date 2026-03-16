# Dashboard Backend — API, Use Cases, Repos

## 1. Query Key Factory

**File:** `apps/backoffice/src/lib/query-keys/dashboard.ts`

```typescript
import { MODULES } from "./modules";

const MODULE = MODULES.dashboard; // Thêm "dashboard" vào modules.ts

export const dashboardKeys = {
  all: [MODULE] as const,

  kpis: (fd: string) => [MODULE, "kpis", fd] as const,

  trend: (params: { from: string; to: string }) => [MODULE, "trend", params] as const,

  jackpots: [MODULE, "jackpots"] as const,

  outstanding: [MODULE, "outstanding"] as const,
} as const;
```

**Cập nhật** `modules.ts`: thêm `dashboard: "dashboard"`.

---

## 2. DTO Types (trong repos/types/)

**File:** `packages/game-core-application/src/infras/repos/types/system-settle-game-daily.types.ts`

Thêm interface mới (KHÔNG viết trong file repo):

```typescript
/**
 * KPI tổng hợp cross-game cho 1 ngày tài chính.
 * Aggregate SUM từ system_settle_game_daily WHERE financialDate.
 */
export interface DashboardDailyKpi {
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
  /** GGR = totalStake - totalPayout (VND). Có thể ÂM. */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). Có thể ÂM. */
  netProfit: number;
  /** Tổng số entry đã settle. */
  entryCount: number;
  /** Tổng số kỳ quay đã settle. */
  drawCount: number;
}
```

Re-export từ `types/index.ts`.

---

## 3. Repo Method Mới

**File:** `packages/game-core-application/src/infras/repos/system-settle-game-daily-repo.ts`

Thêm method:

```typescript
/**
 * Lấy per-game data cho 1 hoặc 2 ngày tài chính (dashboard).
 *
 * Dùng $in filter — trả raw docs, client tách theo financialDate.
 * Query này phục vụ 5 zones: KPI, Game Table, Game Mix, Payout Ratio, Trend %.
 * Index: { financialDate: 1, gameProduct: 1 }
 */
async findByFinancialDates(
  financialDates: string[],
): Promise<SystemSettleGameDaily[]> {
  return (await this.findMany({
    financialDate: { $in: financialDates },
  })) as SystemSettleGameDaily[];
}
```

Không cần aggregate mới — Q1 trả raw 7-14 docs, client-side compute KPI totals.

---

## 4. Use Cases

### 4.1 GetDashboardKpisUseCase

**File:** `packages/game-core-application/src/use-cases/reports/get-dashboard-kpis.ts`

```typescript
/**
 * Lấy dữ liệu settle cho dashboard KPIs + Game Performance.
 *
 * Input: financialDate (ngày đang xem) + compareDate (optional, cùng thứ tuần trước).
 * Output: per-game raw data cho cả 2 ngày.
 * Client-side compute totals, trend %, game breakdown.
 *
 * Query: 1 query duy nhất với $in [fd, compareDate].
 */
export class GetDashboardKpisUseCase extends NextApiUseCase<
  GetDashboardKpisInput,
  GetDashboardKpisOutput
> {
  private readonly repo = new SystemSettleGameDailyRepository();

  protected async execute(input: GetDashboardKpisInput): Promise<GetDashboardKpisOutput> {
    const dates = [input.financialDate];
    if (input.compareDate) dates.push(input.compareDate);

    const data = await this.repo.findByFinancialDates(dates);

    return { data };
  }
}
```

**Input/Output types** (trong `use-cases/reports/types.ts`):

```typescript
export interface GetDashboardKpisInput {
  /** Ngày tài chính đang xem. */
  financialDate: string;
  /** Ngày so sánh (cùng thứ tuần trước). Optional — chỉ truyền khi fd < today. */
  compareDate?: string;
}

export interface GetDashboardKpisOutput {
  /** Raw per-game daily data. Client tách theo financialDate để compute. */
  data: SystemSettleGameDaily[];
}
```

### 4.2 GetDashboardJackpotsUseCase

**File:** `packages/game-core-application/src/use-cases/reports/get-dashboard-jackpots.ts`

```typescript
/**
 * Lấy jackpot pool hiện tại cho 3 game có jackpot.
 * Chạy song song 3 queries (Promise.all).
 */
export class GetDashboardJackpotsUseCase extends NextApiUseCase<void, GetDashboardJackpotsOutput> {
  private readonly mega645JpRepo = new Mega645JackpotCycleRepository();
  private readonly power655JpRepo = new Power655JackpotCycleRepository();
  private readonly lotto535JpRepo = new Lotto535JackpotCycleRepository();

  protected async execute(): Promise<GetDashboardJackpotsOutput> {
    const [mega645, power655, lotto535] = await Promise.all([
      this.mega645JpRepo.findActiveCycle(),
      this.power655JpRepo.findActiveCycle(),
      this.lotto535JpRepo.findActiveCycle(),
    ]);
    return { mega645, power655, lotto535 };
  }
}
```

**Output type:**

```typescript
export interface GetDashboardJackpotsOutput {
  mega645: DashboardJackpotInfo | null;
  power655: DashboardPower655JackpotInfo | null;
  lotto535: DashboardJackpotInfo | null;
}

/** Jackpot info tối giản cho dashboard card. */
export interface DashboardJackpotInfo {
  cycleNumber: number;
  currentAmount: number;
  seedAmount: number;
  /** Số kỳ liên tiếp không có winner. */
  drawsSinceStart: number;
  /** Kỳ quay tiếp theo (optional). */
  nextDrawTime?: string;
}

/** Power 6/55 có dual jackpot. */
export interface DashboardPower655JackpotInfo {
  cycleNumber: number;
  jp1Current: number;
  jp2Current: number;
  jp1Seed: number;
  jp2Seed: number;
  drawsSinceStart: number;
  nextDrawTime?: string;
}
```

### 4.3 Revenue Trend — Reuse existing

Reuse `GetDailyOverviewUseCase` đã có (`aggregateByFinancialDate(from, to)`).

---

## 5. API Routes

### 5.1 Dashboard KPIs

**File:** `apps/backoffice/src/app/api/reports/dashboard/kpis/route.ts`

```typescript
const querySchema = z.object({
  fd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compare: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const useCase = new GetDashboardKpisUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) =>
    useCase.run({
      financialDate: query.fd,
      compareDate: query.compare,
    }),
  );
```

### 5.2 Dashboard Jackpots

**File:** `apps/backoffice/src/app/api/reports/dashboard/jackpots/route.ts`

```typescript
const useCase = new GetDashboardJackpotsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => useCase.run());
```

### 5.3 Dashboard Trend

**File:** `apps/backoffice/src/app/api/reports/dashboard/trend/route.ts`

```typescript
// Reuse GetDailyOverviewUseCase
const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const useCase = new GetDailyOverviewUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => useCase.run(query));
```

### 5.4 Outstanding — Reuse existing

Outstanding API đã có tại `/api/reports/outstanding`. Dashboard reuse cùng endpoint + query key.
