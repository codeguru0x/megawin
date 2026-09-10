/**
 * Unit test `useBatchRunner` (p1-09 §12) — engine chia lô/chạy tuần tự/gộp kết quả.
 *
 * PURE — không DB, không network. `runChunk` là mock do từng test tự định nghĩa hành vi
 * (thành công/thất bại/throw) — không gọi API thật.
 *
 * Trọng tâm: đây là logic quyết định TÍNH ĐÚNG của cả tính năng batch bulk action (chia lô
 * bao nhiêu, có thật sự TUẦN TỰ không — sai chỗ này sẽ nhân concurrency phía server ngoài
 * thiết kế gốc, xem JSDoc `use-batch-runner.ts`). Test tĩnh (`tsc`/`biome`) KHÔNG bắt được lỗi
 * hành vi này — phải chứng minh bằng test chạy thật.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { type BatchChunkResult, useBatchRunner } from "@/hooks/use-batch-runner";

/**
 * Wrapper tường minh kiểu trả về qua `act` — `act<T>()` của React có return type CONDITIONAL
 * (`T extends Promise<any> ? Promise<undefined> : undefined`) mà Biome không resolve được qua
 * generic alias (đúng caveat đã ghi ở `biome-lint-conventions.mdc` §d, case `GetSessionFn`), nên
 * `await act(async () => {...})` bị Biome báo sai `useAwaitThenable` dù `tsc --noEmit` xanh (đã
 * verify). Khai báo tường minh `Promise<void>` ở ĐÂY thay vì rải `biome-ignore` ở 11 chỗ gọi.
 */
async function actAsync(callback: () => Promise<void>): Promise<void> {
  // biome-ignore lint/nursery/useAwaitThenable: act<T>() có return type CONDITIONAL (T extends Promise<any> ? Promise<undefined> : undefined) — Biome không resolve được qua callback async, dù tsc --noEmit xanh (verified). Xem JSDoc actAsync phía trên.
  await act(callback);
}

/** Helper: tạo N id giả `id-0`..`id-(N-1)`, thứ tự cố định để assert chunk đúng thứ tự. */
function makeIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `id-${i}`);
}

/** `runChunk` mặc định: mọi id trong lô đều thành công. */
function allSuccess(chunk: readonly string[]): Promise<BatchChunkResult> {
  return Promise.resolve({ successIds: [...chunk], failures: [] });
}

describe("useBatchRunner — chia lô", () => {
  it("chia đúng số lô theo chunkSize, giữ nguyên thứ tự id", async () => {
    const { result } = renderHook(() => useBatchRunner(50));
    const ids = makeIds(120); // 50 + 50 + 20 = 3 lô
    const seenChunks: string[][] = [];

    await actAsync(async () => {
      await result.current.run(ids, async (chunk) => {
        seenChunks.push([...chunk]);
        return allSuccess(chunk);
      });
    });

    expect(seenChunks).toHaveLength(3);
    expect(seenChunks[0]).toHaveLength(50);
    expect(seenChunks[1]).toHaveLength(50);
    expect(seenChunks[2]).toHaveLength(20);
    // Thứ tự giữ nguyên — lô 1 là id-0..id-49, lô 3 kết thúc ở id-119.
    expect(seenChunks[0]?.[0]).toBe("id-0");
    expect(seenChunks[0]?.[49]).toBe("id-49");
    expect(seenChunks[2]?.[19]).toBe("id-119");
  });

  it("đúng đúng 1 lô khi ids.length === chunkSize (biên, KHÔNG tạo lô rỗng thừa)", async () => {
    const { result } = renderHook(() => useBatchRunner(50));
    const ids = makeIds(50);
    let callCount = 0;

    await actAsync(async () => {
      await result.current.run(ids, async (chunk) => {
        callCount++;
        return allSuccess(chunk);
      });
    });

    expect(callCount).toBe(1);
    expect(result.current.state.totalChunks).toBe(1);
  });

  it("ids rỗng → 0 lô, không gọi runChunk, kết quả thành/thất bại đều 0", async () => {
    const { result } = renderHook(() => useBatchRunner(50));
    const runChunk = vi.fn();

    let output: Awaited<ReturnType<typeof result.current.run>> | undefined;
    await actAsync(async () => {
      output = await result.current.run([], runChunk);
    });

    expect(runChunk).not.toHaveBeenCalled();
    expect(output).toEqual({ successCount: 0, failureCount: 0, failedIds: [] });
  });
});

describe("useBatchRunner — TUẦN TỰ (điều kiện bắt buộc, không được song song)", () => {
  it("lô sau chỉ bắt đầu SAU KHI lô trước đã resolve — không gọi runChunk chồng lấp", async () => {
    const { result } = renderHook(() => useBatchRunner(10));
    const ids = makeIds(30); // 3 lô
    const activeCount = { current: 0 };
    let maxConcurrent = 0;
    const startOrder: number[] = [];

    await actAsync(async () => {
      await result.current.run(ids, async (chunk) => {
        activeCount.current++;
        maxConcurrent = Math.max(maxConcurrent, activeCount.current);
        startOrder.push(activeCount.current);
        // Nhường event loop 1 nhịp để nếu code gọi song song (Promise.all), lô kế sẽ kịp
        // start TRƯỚC khi lô này resolve — bài test này phải bắt được lỗi đó.
        await new Promise((r) => setTimeout(r, 5));
        activeCount.current--;
        return allSuccess(chunk);
      });
    });

    // Nếu chạy song song, maxConcurrent sẽ = 3 (cả 3 lô cùng "active" một lúc). Tuần tự đúng
    // phải luôn = 1 tại mọi thời điểm — đây là assertion CHỐT cho điều kiện bắt buộc của thiết kế.
    expect(maxConcurrent).toBe(1);
  });

  it("phản chứng: nếu adapter tự ý Promise.all thì test trên PHẢI đỏ (sanity check của bài test)", async () => {
    // Test này KHÔNG test `useBatchRunner` — nó test rằng bài test phía trên có khả năng bắt lỗi
    // thật, bằng cách tự chạy 3 "lô" song song và xác nhận maxConcurrent đo được > 1.
    const activeCount = { current: 0 };
    let maxConcurrent = 0;
    await Promise.all(
      [0, 1, 2].map(async () => {
        activeCount.current++;
        maxConcurrent = Math.max(maxConcurrent, activeCount.current);
        await new Promise((r) => setTimeout(r, 5));
        activeCount.current--;
      }),
    );
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});

describe("useBatchRunner — gộp kết quả thành công/thất bại", () => {
  it("gộp đúng successCount/failureCount/failedIds qua nhiều lô có cả thành công và thất bại", async () => {
    const { result } = renderHook(() => useBatchRunner(2));
    const ids = makeIds(4); // 2 lô: [id-0,id-1], [id-2,id-3]

    let output: Awaited<ReturnType<typeof result.current.run>> | undefined;
    await actAsync(async () => {
      output = await result.current.run(ids, async (chunk) => {
        if (chunk.includes("id-1")) {
          // Lô 1: id-0 thành công, id-1 thất bại (partial success trong 1 lô).
          return { successIds: ["id-0"], failures: [{ id: "id-1", message: "Lỗi giả lập" }] };
        }
        return allSuccess(chunk);
      });
    });

    expect(output).toEqual({
      successCount: 3, // id-0, id-2, id-3
      failureCount: 1,
      failedIds: ["id-1"],
    });
  });

  it("1 lô throw TOÀN BỘ (network/500) → mọi id trong lô đó tính thất bại, job KHÔNG dừng ở đó", async () => {
    const { result } = renderHook(() => useBatchRunner(2));
    const ids = makeIds(4); // 2 lô: [id-0,id-1], [id-2,id-3]
    let secondChunkCalled = false;

    let output: Awaited<ReturnType<typeof result.current.run>> | undefined;
    await actAsync(async () => {
      output = await result.current.run(ids, async (chunk) => {
        if (chunk.includes("id-0")) {
          throw new Error("Network error giả lập — cả lô fail");
        }
        secondChunkCalled = true;
        return allSuccess(chunk);
      });
    });

    // Lô 2 VẪN được gọi dù lô 1 throw — đúng triết lý "1 lô lỗi không dừng job".
    expect(secondChunkCalled).toBe(true);
    expect(output).toEqual({
      successCount: 2, // id-2, id-3
      failureCount: 2,
      failedIds: ["id-0", "id-1"],
    });
  });
});

describe("useBatchRunner — state tiến trình (progress UI đọc từ đây)", () => {
  it("idle trước khi run, chuyển running với đúng totalChunks, rồi done khi xong", async () => {
    const { result } = renderHook(() => useBatchRunner(1));
    expect(result.current.state.status).toBe("idle");

    const ids = makeIds(3); // 3 lô (chunkSize=1)
    // Lô đầu "treo" 30ms để có cơ hội quan sát state "running" giữa lúc job đang chạy — đọc
    // `result.current` qua `waitFor` (đợi re-render thật, KHÔNG đọc closure đồng bộ trong
    // callback — đó là lỗi timing giả, không phải hành vi hook cần test).
    let runPromise!: Promise<unknown>;
    act(() => {
      runPromise = result.current.run(ids, async (chunk) => {
        await new Promise((r) => setTimeout(r, 30));
        return allSuccess(chunk);
      });
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("running");
    });
    expect(result.current.state.totalChunks).toBe(3);
    expect(result.current.state.totalItems).toBe(3);

    await actAsync(async () => {
      await runPromise;
    });

    expect(result.current.state.status).toBe("done");
    expect(result.current.state.doneChunks).toBe(3);
    expect(result.current.state.successCount).toBe(3);
    expect(result.current.state.failureCount).toBe(0);
  });

  it("doneChunks tăng đúng 1 sau MỖI lô xong (quan sát qua waitFor giữa các lô, không đọc closure)", async () => {
    const { result } = renderHook(() => useBatchRunner(1));
    const ids = makeIds(3);
    // Mỗi lô chỉ resolve khi test tự "mở khoá" — cho phép quan sát `doneChunks` ở TỪNG mốc
    // trung gian bằng `waitFor`, thay vì đọc `result.current` racy ngay trong callback.
    const gates: Array<() => void> = [];
    const runChunk = vi.fn(
      (chunk: readonly string[]) =>
        new Promise<BatchChunkResult>((resolve) => {
          gates.push(() => resolve(allSuccess(chunk) as unknown as BatchChunkResult));
        }),
    );

    let runPromise!: Promise<unknown>;
    act(() => {
      runPromise = result.current.run(ids, runChunk);
    });

    await waitFor(() => expect(gates).toHaveLength(1));
    expect(result.current.state.doneChunks).toBe(0);

    await actAsync(async () => {
      gates[0]?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.state.doneChunks).toBe(1));

    await waitFor(() => expect(gates).toHaveLength(2));
    await actAsync(async () => {
      gates[1]?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.state.doneChunks).toBe(2));

    await waitFor(() => expect(gates).toHaveLength(3));
    await actAsync(async () => {
      gates[2]?.();
      await runPromise;
    });
    expect(result.current.state.doneChunks).toBe(3);
    expect(result.current.state.status).toBe("done");
  });

  it("reset() đưa state về idle, cho phép chạy job mới sạch", async () => {
    const { result } = renderHook(() => useBatchRunner(50));
    await actAsync(async () => {
      await result.current.run(makeIds(60), async (chunk) => allSuccess(chunk));
    });
    expect(result.current.state.status).toBe("done");

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toEqual({
      status: "idle",
      totalChunks: 0,
      doneChunks: 0,
      totalItems: 0,
      successCount: 0,
      failureCount: 0,
    });
  });
});
