/**
 * Lotto 5/35 – Report Repository
 *
 * Collection: lotto535DailyReports
 *
 * Lưu báo cáo tài chính hàng ngày tách biệt với game data.
 * 2 loại report: "tenant" (per tenant per draw) và "player" (per player per draw).
 * Pattern upsert: idempotent khi chạy lại settle.
 */

import type { GameProduct } from "@megawin/game-core/entities";
import { BaseRepo } from "./base-repo";

const COLLECTION_NAME = "lotto535DailyReports";

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
  /** Gross Gaming Revenue = totalStake - totalPayout */
  ggr: number;
  /** Net Revenue = revenue - commission */
  netRevenue: number;
}

export interface PlayerDailyReportData {
  tenantId: string;
  playerId: string;
  financialDate: string;
  drawId: string;
  product: GameProduct;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  entryCount: number;
  /** netAmount = totalStake - totalPayout */
  netAmount: number;
}

export class ReportRepository extends BaseRepo<any, any> {
  constructor() {
    super({ collName: COLLECTION_NAME });
  }

  /**
   * Upsert báo cáo tenant hàng ngày.
   * Unique key: { tenantId, financialDate, drawId, product, reportType }
   */
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
      { upsert: true },
    );
  }

  /**
   * Upsert báo cáo player hàng ngày.
   * Unique key: { tenantId, playerId, financialDate, drawId, product, reportType }
   */
  async upsertPlayerDailyReport(data: PlayerDailyReportData): Promise<void> {
    const now = new Date();
    const filter = {
      tenantId: data.tenantId,
      playerId: data.playerId,
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
      { upsert: true },
    );
  }
}
