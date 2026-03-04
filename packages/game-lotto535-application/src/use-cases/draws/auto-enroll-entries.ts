/**
 * Use Case: Auto-Enroll Entries (DEPRECATED cho Lotto535)
 *
 * Với flow mới, tất cả entries được tạo ngay tại place-bet.
 * Use case này giữ lại để tương thích với step function enroll
 * nhưng sẽ luôn trả về done: true, enrolledCount: 0.
 *
 * Step function enroll vẫn gọi lambda này khi draw mở bán.
 * Lambda sẽ không làm gì — chỉ return success.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";

export interface AutoEnrollInput {
  drawId: string;
}

export interface AutoEnrollOutput {
  drawId: string;
  enrolledCount: number;
  skippedCount: number;
  entriesCreated: number;
  done: boolean;
}

export class AutoEnrollEntriesUseCase extends InternalUseCase<
  AutoEnrollInput,
  AutoEnrollOutput
> {
  protected async execute(input: AutoEnrollInput): Promise<AutoEnrollOutput> {
    return {
      drawId: input.drawId,
      enrolledCount: 0,
      skippedCount: 0,
      entriesCreated: 0,
      done: true,
    };
  }
}
