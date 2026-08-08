import { NextApiUseCase } from "@megawin/next/server";
import { DispatchOrderRepository } from "../../infras/repos/dispatch-order-repo";
import type { BatchProgress } from "../../infras/repos/types";

export interface GetBatchProgressInput {
  batchKey: string;
}

export type GetBatchProgressOutput = BatchProgress | null;

/**
 * BO use case — trả aggregate progress của 1 `batchKey` cho operations dashboard.
 */
export class GetBatchProgressUseCase extends NextApiUseCase<GetBatchProgressInput, GetBatchProgressOutput> {
  private readonly repo = new DispatchOrderRepository();

  protected async execute(input: GetBatchProgressInput): Promise<GetBatchProgressOutput> {
    return await this.repo.aggregateBatchProgress(input.batchKey);
  }
}
