/**
 * Max 3D Pro Feed Sync – Step Function Definition (ASL)
 *
 * Dùng chung global entryChangeSeq → version không trùng với game khác.
 * Scheduler Lambda đọc feedSyncCursor(max3dpro) → start execution.
 *
 * USAGE (chạy từ thư mục step-functions):
 *   npx tsx -e "import { FEED_SYNC_STATE_MACHINE } from './feed-sync'; console.log(JSON.stringify(FEED_SYNC_STATE_MACHINE, null, 2))" > feed-sync.asl.json
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-max3dpro";
const STAGE = "dev";

function lambdaArn(functionName: string): string {
  return `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${SERVICE}-${STAGE}-${functionName}`;
}

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
  Comment: "Max 3D Pro Feed Sync – Copy entries → entryFeed cho tenant polling",
  QueryLanguage: "JSONata",
  StartAt: "SyncEntries",
  States: {
    SyncEntries: {
      Type: "Task",
      Resource: lambdaArn("max3dpro-feed-sync-entries"),
      Arguments: {
        afterVersion: "{% $states.input.afterVersion %}",
        batchSize: "{% $states.input.batchSize %}",
      },
      Output: "{% { 'batchSize': $states.input.batchSize, 'syncResult': $states.result } %}",
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
      Resource: lambdaArn("max3dpro-feed-save-cursor"),
      Arguments: {
        lastVersion: "{% $states.input.syncResult.lastVersion %}",
      },
      End: true,
      Retry: LAMBDA_RETRY,
    },
  },
};
