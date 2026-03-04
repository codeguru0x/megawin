/**
 * Keno Settle – Shared Handler Types
 *
 * Types dùng chung giữa các settle handler steps.
 * Input/Output cụ thể của mỗi step → import trực tiếp từ use-case.
 *
 * File này chỉ chứa:
 *   - SettleContext: output của PrepareSettle, truyền xuyên suốt step function
 *   - BuildReportFinancials: subset của CalculateFinancialsResult truyền sang BuildReport
 */

import type {
  PrepareSettleResult,
  KenoSettleFinancials,
} from "@megawin/game-keno-application/use-cases/settle";

/**
 * Context chung cho toàn bộ settle flow.
 * PrepareSettle tạo ra, các step sau đọc qua `$states.input.context`.
 */
export type SettleContext = PrepareSettleResult;

/**
 * Subset tài chính truyền từ CalculateFinancials → BuildReport.
 * Step function truyền `financials` field qua JSONata.
 */
export type BuildReportFinancials = KenoSettleFinancials;
