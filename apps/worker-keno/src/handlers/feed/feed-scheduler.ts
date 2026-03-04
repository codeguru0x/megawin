/**
 * Lambda: feed-scheduler (Keno)
 *
 * Chạy tự động mỗi 30s (EventBridge Schedule).
 *
 * CONCURRENCY GUARD (MongoDB distributed lock):
 *   1. acquireLock() → atomic set lockedUntil + đọc afterVersion
 *      - Thành công: an toàn start step function
 *      - Thất bại: ai đó đang giữ lock → skip
 *   2. Step function chạy → SaveCursor (cuối) release lock
 *   3. Nếu crash → lock auto-expire sau 5 phút → scheduler retry
 */

import { startExecution } from "@megawin/app-core/aws/sf";
import { AcquireFeedLockUseCase } from "@megawin/game-keno-application/use-cases/feed";

const STEP_FUNCTION_ARN = process.env.FEED_SYNC_SFN_ARN!;
const BATCH_SIZE = 200;

const acquireLockUseCase = new AcquireFeedLockUseCase();

export async function handler() {
  const executionName = `keno-feed-sync-${Date.now()}`;

  const { acquired, afterVersion } = await acquireLockUseCase.run({ executionId: executionName });

  if (!acquired) {
    console.log("Feed sync lock đang bị giữ, skip lần này.");
    return { skipped: true };
  }

  const { executionArn } = await startExecution({
    stateMachineArn: STEP_FUNCTION_ARN,
    name: executionName,
    input: { afterVersion, batchSize: BATCH_SIZE },
  });

  console.log(`Started feed sync: afterVersion=${afterVersion}, arn=${executionArn}`);
  return { started: true, afterVersion, executionName };
}
