import {
  StartExecutionCommand,
  ListExecutionsCommand,
  DescribeExecutionCommand,
} from "@aws-sdk/client-sfn";

export { ExecutionAlreadyExists } from "@aws-sdk/client-sfn";

import { sfnClient } from "./client";

// ─────────────────────────────────────────────
// Start Execution
// ─────────────────────────────────────────────

export interface StartExecutionParams {
  stateMachineArn: string;
  /** Tên execution (unique per state machine). Nếu không truyền, AWS tự sinh. */
  name?: string;
  /** Input JSON cho step function (sẽ tự JSON.stringify nếu truyền object). */
  input: Record<string, unknown> | string;
}

export interface StartExecutionResult {
  executionArn: string;
  startDate: Date;
}

/**
 * Start 1 execution mới cho state machine.
 *
 * IDEMPOTENT theo `name`: nếu truyền `name` deterministic và execution với tên
 * đó đã tồn tại (trong cửa sổ 90 ngày AWS giữ name unique), AWS ném
 * `ExecutionAlreadyExists`. Hàm này KHÔNG nuốt lỗi đó — để nguyên cho caller
 * tự quyết: settle/resettle coi là idempotent-success, caller khác có thể coi
 * là lỗi thật. Import {@link ExecutionAlreadyExists} để bắt riêng:
 *
 * ```ts
 * try {
 *   await startExecution({ stateMachineArn, name, input });
 * } catch (err) {
 *   if (err instanceof ExecutionAlreadyExists) {
 *     // phiên đã được start trước đó → coi như thành công
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * LƯU Ý: chỉ idempotent khi caller chủ động truyền `name` deterministic. Nếu
 * bỏ `name` (AWS tự sinh), mỗi lần gọi là 1 execution mới — không idempotent.
 */
export async function startExecution(params: StartExecutionParams): Promise<StartExecutionResult> {
  const inputStr = typeof params.input === "string" ? params.input : JSON.stringify(params.input);

  const result = await sfnClient.send(
    new StartExecutionCommand({
      stateMachineArn: params.stateMachineArn,
      name: params.name,
      input: inputStr,
    }),
  );

  return {
    executionArn: result.executionArn!,
    startDate: result.startDate!,
  };
}

// ─────────────────────────────────────────────
// Check Running Executions
// ─────────────────────────────────────────────

/**
 * Kiểm tra state machine có execution nào đang RUNNING không.
 * Dùng cho guard: tránh start execution mới khi cái cũ chưa xong.
 */
export async function hasRunningExecution(stateMachineArn: string): Promise<boolean> {
  const result = await sfnClient.send(
    new ListExecutionsCommand({
      stateMachineArn,
      statusFilter: "RUNNING",
      maxResults: 1,
    }),
  );

  return (result.executions?.length ?? 0) > 0;
}

// ─────────────────────────────────────────────
// Describe Execution
// ─────────────────────────────────────────────

export interface DescribeExecutionResult {
  executionArn: string;
  stateMachineArn: string;
  status: string;
  input?: string;
  output?: string;
  startDate: Date;
  stopDate?: Date;
}

/**
 * Lấy chi tiết 1 execution (status, input, output).
 */
export async function describeExecution(executionArn: string): Promise<DescribeExecutionResult> {
  const result = await sfnClient.send(new DescribeExecutionCommand({ executionArn }));

  return {
    executionArn: result.executionArn!,
    stateMachineArn: result.stateMachineArn!,
    status: result.status!,
    input: result.input,
    output: result.output,
    startDate: result.startDate!,
    stopDate: result.stopDate,
  };
}
