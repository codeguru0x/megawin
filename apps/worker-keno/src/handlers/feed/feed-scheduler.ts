/**
 * Lambda: feed-scheduler (Keno)
 *
 * Chạy tự động mỗi 30s (EventBridge Schedule).
 * Đọc feedSyncCursor qua use case → lấy afterVersion → start Step Function.
 *
 * Guard: nếu execution đang chạy, skip để tránh chạy song song.
 */

import { hasRunningExecution, startExecution } from "@megawin/app-core/aws/sf";
import { ReadFeedCursorUseCase } from "@megawin/game-keno-application/use-cases/feed";

const STEP_FUNCTION_ARN = process.env.FEED_SYNC_SFN_ARN!;
const BATCH_SIZE = 200;

const useCase = new ReadFeedCursorUseCase();

export async function handler() {
  if (await hasRunningExecution(STEP_FUNCTION_ARN)) {
    console.log("Feed sync step function đang chạy, skip lần này.");
    return { skipped: true };
  }

  const cursorResult = await useCase.run({});
  if (!cursorResult.success) throw new Error(cursorResult.error.message);
  const { afterVersion } = cursorResult.data;

  const executionName = `keno-feed-sync-${Date.now()}`;

  const { executionArn } = await startExecution({
    stateMachineArn: STEP_FUNCTION_ARN,
    name: executionName,
    input: { afterVersion, batchSize: BATCH_SIZE },
  });

  console.log(`Started feed sync: afterVersion=${afterVersion}, arn=${executionArn}`);
  return { started: true, afterVersion, executionName };
}
