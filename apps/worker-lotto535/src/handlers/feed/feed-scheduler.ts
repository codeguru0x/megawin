/**
 * Lambda: feed-scheduler (Lotto 5/35)
 *
 * Chạy tự động mỗi 30s (EventBridge Schedule).
 *
 * CONCURRENCY GUARD (MongoDB distributed lock):
 *   1. acquireLock() → atomic set lockedUntil + đọc afterVersion
 *      - Thành công: an toàn start step function
 *      - Thất bại: ai đó đang giữ lock → skip
 *   2. Step function chạy → SaveCursor (cuối) release lock
 *   3. Nếu crash → lock auto-expire sau 5 phút → scheduler retry
 *
 * Không cần hasRunningExecution() nữa — lock ở DB chính xác hơn
 * SFN ListExecutions (eventual consistency).
 */

import { startExecution } from "@megawin/app-core/aws/sf";
import { AcquireFeedLockUseCase } from "@megawin/game-lotto535-application/use-cases/feed";

const STEP_FUNCTION_ARN = process.env.FEED_SYNC_SFN_ARN!;
const BATCH_SIZE = 200;

const acquireLockUseCase = new AcquireFeedLockUseCase();

export async function handler() {
  const executionName = `lotto535-feed-sync-${Date.now()}`;

  const lockResult = await acquireLockUseCase.run({ executionId: executionName });
  if (!lockResult.success) throw new Error(lockResult.error.message);

  const { acquired, afterVersion } = lockResult.data;

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
