/**
 * Lambda: build-report (Max 3D Pro)
 *
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 *
 * IDEMPOTENT: upsert pattern.
 */

import {
  BuildReportUseCase,
  type SettleContext,
} from "@megawin/game-max3dpro-application/use-cases/settle";

const useCase = new BuildReportUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
