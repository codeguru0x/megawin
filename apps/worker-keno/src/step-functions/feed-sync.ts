/**
 * Keno Feed Sync – Step Function Definition (ASL)
 *
 * Tương tự Lotto 5/35 feed sync.
 * Dùng chung global entryChangeSeq → version không trùng với Lotto535.
 * Scheduler Lambda đọc feedSyncCursor(keno) → start execution.
 */

export const FEED_SYNC_STATE_MACHINE = {
  Comment: "Keno Feed Sync – Copy entries → entryFeed cho tenant polling",
  StartAt: "SyncEntries",
  States: {
    SyncEntries: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:keno-feed-sync-entries",
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
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:keno-feed-save-cursor",
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
