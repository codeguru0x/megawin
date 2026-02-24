/**
 * Lotto 5/35 Feed Sync – Step Function Definition (ASL)
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

export const FEED_SYNC_STATE_MACHINE = {
  Comment: "Lotto 5/35 Feed Sync – Copy entries → entryFeed cho tenant polling",
  StartAt: "SyncEntries",
  States: {
    SyncEntries: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:lotto535-feed-sync-entries",
      Parameters: {
        "afterVersion.$": "$.afterVersion",
        "batchSize.$": "$.batchSize",
      },
      ResultPath: "$.syncResult",
      Next: "CheckDone",
      Retry: [
        {
          ErrorEquals: ["States.TaskFailed"],
          IntervalSeconds: 5,
          MaxAttempts: 3,
          BackoffRate: 2.0,
        },
      ],
    },

    CheckDone: {
      Type: "Choice",
      Choices: [
        {
          Variable: "$.syncResult.done",
          BooleanEquals: true,
          Next: "SaveCursor",
        },
      ],
      Default: "UpdateAfterVersion",
    },

    UpdateAfterVersion: {
      Type: "Pass",
      Parameters: {
        "afterVersion.$": "$.syncResult.lastVersion",
        "batchSize.$": "$.batchSize",
      },
      Next: "SyncEntries",
    },

    SaveCursor: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:lotto535-feed-save-cursor",
      Parameters: {
        "lastVersion.$": "$.syncResult.lastVersion",
      },
      End: true,
      Retry: [
        {
          ErrorEquals: ["States.TaskFailed"],
          IntervalSeconds: 2,
          MaxAttempts: 3,
          BackoffRate: 2.0,
        },
      ],
    },
  },
};
