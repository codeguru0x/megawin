/**
 * Keno – Report Repository
 *
 * Collection: kenoDailyReports
 */

import type { GameProduct } from "@megawin/game-core/entities";
import { BaseRepo } from "./base-repo";

const COLLECTION_NAME = "kenoDailyReports";

export interface TenantDailyReportData {
  tenantId: string;
  financialDate: string;
  drawId: string;
  product: GameProduct;
  revenue: number;
  commission: number;
  commissionRate: number;
  totalStake: number;
  totalPayout: number;
  totalWin: number;
  entryCount: number;
  ggr: number;
  netRevenue: number;
}

export interface PlayerDailyReportData {
  tenantId: string;
  accountId: string;
  financialDate: string;
  drawId: string;
  product: GameProduct;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  entryCount: number;
  netAmount: number;
}

export class ReportRepository extends BaseRepo<any, any> {
  constructor() {
    super({ collName: COLLECTION_NAME });
  }

  async upsertTenantDailyReport(data: TenantDailyReportData): Promise<void> {
    const now = new Date();
    const filter = {
      tenantId: data.tenantId,
      financialDate: data.financialDate,
      drawId: data.drawId,
      product: data.product,
      reportType: "tenant",
    };
    await this.updateOne(
      filter,
      {
        $set: { ...data, reportType: "tenant", updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }

  async upsertPlayerDailyReport(data: PlayerDailyReportData): Promise<void> {
    const now = new Date();
    const filter = {
      tenantId: data.tenantId,
      accountId: data.accountId,
      financialDate: data.financialDate,
      drawId: data.drawId,
      product: data.product,
      reportType: "player",
    };
    await this.updateOne(
      filter,
      {
        $set: { ...data, reportType: "player", updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }
}
