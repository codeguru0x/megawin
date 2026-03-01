/**
 * Power 6/55 Feed Sync – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW:
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Trigger: Scheduler Lambda (mỗi 30s) đọc feedSyncCursor
 *           → start execution với { afterVersion, batchSize }
 *         │
 *         ▼
 *  ┌──────────────────────────────────┐
 *  │  SyncEntries                     │  Scan entries version > afterVersion
 *  │  - Batch 200                     │  Upsert vào entryFeed
 *  │  - done = false → loop           │
 *  │  - done = true  → SaveCursor     │
 *  └──────────┬───────────────────────┘
 *             │ done = false
 *             └──────────┐
 *                        ▼
 *             ┌─────────────────────┐
 *             │ UpdateAfterVersion  │  Cập nhật afterVersion
 *             │ → quay lại Sync     │
 *             └─────────────────────┘
 *
 *  done = true
 *         │
 *         ▼
 *  ┌──────────────────────────────────┐
 *  │  SaveCursor                      │  Ghi lastVersion vào feedSyncCursor
 *  └──────────────────────────────────┘
 *
 * IDEMPOTENT:
 *   - Upsert chỉ ghi nếu version mới > cũ
 *   - Retry toàn bộ step function an toàn
 *
 * TRIGGER:
 *   - Scheduler Lambda (EventBridge schedule rate 30s)
 */

const LAMBDA_RETRY = [
  {
    ErrorEquals: [
      "Lambda.ServiceException",
      "Lambda.AWSLambdaException",
      "Lambda.SdkClientException",
      "Lambda.TooManyRequestsException",
      "States.TaskFailed",
      "States.Timeout",
    ],
    IntervalSeconds: 5,
    MaxAttempts: 3,
    BackoffRate: 2.0,
  },
];

export const FEED_SYNC_STATE_MACHINE = {
  Comment: "Power 6/55 Feed Sync – Copy entries → entryFeed cho tenant polling",
  QueryLanguage: "JSONata",
  StartAt: "SyncEntries",
  States: {
    SyncEntries: {
      Type: "Task",
      Resource:
        "arn:aws:lambda:REGION:ACCOUNT:function:power655-feed-sync-entries",
      Arguments: {
        afterVersion: "{% $states.input.afterVersion %}",
        batchSize: "{% $states.input.batchSize %}",
      },
      Output:
        "{% { 'batchSize': $states.input.batchSize, 'syncResult': $states.result } %}",
      Next: "CheckDone",
      Retry: LAMBDA_RETRY,
    },

    CheckDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $states.input.syncResult.done %}",
          Next: "SaveCursor",
        },
      ],
      Default: "UpdateAfterVersion",
    },

    UpdateAfterVersion: {
      Type: "Pass",
      Output:
        "{% { 'afterVersion': $states.input.syncResult.lastVersion, 'batchSize': $states.input.batchSize } %}",
      Next: "SyncEntries",
    },

    SaveCursor: {
      Type: "Task",
      Resource:
        "arn:aws:lambda:REGION:ACCOUNT:function:power655-feed-save-cursor",
      Arguments: {
        lastVersion: "{% $states.input.syncResult.lastVersion %}",
      },
      End: true,
      Retry: LAMBDA_RETRY,
    },
  },
};
