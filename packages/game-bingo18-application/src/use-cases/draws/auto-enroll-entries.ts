/**
 * Use Case: Auto-Enroll Entries (Bingo 18)
 *
 * DEPRECATED: All entries are now created at place-bet time.
 * This use case is kept as a no-op for step-function compatibility.
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
