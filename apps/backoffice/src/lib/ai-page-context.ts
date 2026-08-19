/**
 * AI Page Context — registry cho state của trang mà URL KHÔNG mô tả được.
 *
 * Vì sao cần: `AiPanelProvider.prepareSend` đính `route` + `filters` (đọc từ `window.location`)
 * vào mỗi turn. Cách đó phủ hết state đã đẩy lên URL bằng `nuqs`, nhưng KHÔNG phủ được state chỉ
 * sống trong React. Ví dụ thật: trang vận hành xoá `?drawId=` khỏi URL khi staff đang xem kỳ
 * **đang hoạt động** (`use-draw-context.tsx` — giữ URL gọn), nên URL trống trong khi trang vẫn
 * đang hiển thị một kỳ cụ thể. Model không có cách nào biết kỳ đó là kỳ nào.
 *
 * Vì sao là module-level Map chứ KHÔNG phải React context/state:
 * - `AiPanelProvider` mounted suốt phiên ở layout. Nếu context trang chảy vào provider bằng
 *   state, mỗi lần staff đổi kỳ quay là re-render CẢ cây con của layout (rule §5.2 defer state
 *   reads). Provider chỉ cần giá trị **đúng một lần**, đúng lúc bấm Gửi.
 * - Store nằm ngoài React ⇒ `prepareSend` đọc on-demand, 0 re-render, 0 subscription.
 *
 * Đây là store ghi được ở module scope — chấp nhận được vì chỉ dùng ở client (mỗi tab một
 * instance). TUYỆT ĐỐI không import file này từ server component: trên server, module scope bị
 * chia sẻ giữa các request (đúng lớp bug đã sập ở `theme-boot.tsx`, xem p0-04 §4.9.2).
 */

/**
 * Một khối context trang, dạng caller khai báo. Cho phép `undefined`/`null` để component viết
 * thẳng `financialDate: draw?.financialDate` mà không cần tự lọc — `collectAiPageContext` prune.
 *
 * Chỉ nhận primitive: giá trị này bị JSON-serialize vào prompt mỗi turn, nên phải nhỏ và đọc
 * được bằng mắt. Cần cấu trúc lồng nhau ⇒ dấu hiệu đang gửi quá nhiều.
 */
export type AiPageContextValue = Record<string, string | number | boolean | null | undefined>;

/**
 * Khối context sau khi prune — đây là hình dạng THẬT đi vào `clientContext` của eve, phải khớp
 * `JsonObject` (KHÔNG có `undefined`/`null`, nếu không `useEveAgent` reject ở compile-time).
 */
type AiPageContextPayload = Record<string, string | number | boolean>;

type Contributor = () => AiPageContextValue | undefined;

/** key → hàm đọc snapshot. Key trùng ⇒ ghi đè (chỉ 1 trang mount tại một thời điểm). */
const contributors = new Map<string, Contributor>();

/**
 * Đăng ký một nguồn context. Trả hàm unregister — gọi khi component unmount.
 *
 * Dùng qua hook `useAiPageContext`, KHÔNG gọi trực tiếp từ component.
 */
export function registerAiPageContext(key: string, contributor: Contributor): () => void {
  contributors.set(key, contributor);
  return () => {
    // Chỉ xoá nếu vẫn là contributor của mình: StrictMode chạy effect 2 lần (mount → cleanup →
    // mount), nếu xoá vô điều kiện thì lần cleanup của lượt 1 sẽ giết registration của lượt 2.
    if (contributors.get(key) === contributor) {
      contributors.delete(key);
    }
  };
}

/**
 * Bỏ field rỗng (`undefined`/`null`/`""`) — field rỗng chỉ làm nhiễu prompt, đồng thời `undefined`
 * và `null` không hợp `JsonObject` của eve.
 *
 * Lọc bằng vòng lặp tường minh chứ không `Object.entries().filter()`: `filter` không narrow được
 * type của value, sẽ phải `as` — vòng lặp cho compiler tự chứng minh kiểu.
 */
function pruneEmpty(value: AiPageContextValue): AiPageContextPayload | undefined {
  const pruned: AiPageContextPayload = {};
  let hasField = false;
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined || raw === null || raw === "") {
      continue;
    }
    pruned[key] = raw;
    hasField = true;
  }
  return hasField ? pruned : undefined;
}

/**
 * Gom snapshot của mọi nguồn đang mount. Trả `undefined` khi không có gì để gửi (để
 * `clientContext` không mang khoá rỗng vô nghĩa).
 *
 * Lỗi trong một contributor bị bắt và bỏ qua: một trang lỗi KHÔNG được làm chết nút Gửi. NHƯNG
 * "bỏ qua" ở đây là fail-OPEN với hệ quả nghiệp vụ: `navigate-tool-card` suy "không dirty" từ việc
 * VẮNG khoá `formDirty`, nên contributor throw ⇔ mất chốt chặn, thẻ tự kéo staff khỏi form đang sửa
 * dở. Chính xác cách bug 19/08 sống sót: `useAiPageContext` bọc contributor bằng `useEffectEvent`
 * (React 19 cấm gọi trong render) → throw ở đúng đường thẻ đọc → dòng log này là dấu vết DUY NHẤT,
 * và không ai đọc console. Vì vậy ở dev nó `throw` để vỡ ngay tại chỗ; prod vẫn giữ nút Gửi sống.
 */
export function collectAiPageContext(): Record<string, AiPageContextPayload> | undefined {
  if (contributors.size === 0) {
    return undefined;
  }

  const collected: Record<string, AiPageContextPayload> = {};
  for (const [key, read] of contributors) {
    try {
      const raw = read();
      if (raw === undefined) {
        continue;
      }
      const pruned = pruneEmpty(raw);
      if (pruned) {
        collected[key] = pruned;
      }
    } catch (error) {
      console.error(`[ai-page-context] đọc context "${key}" thất bại`, error);
      // Dev: vỡ to và ngay. Contributor throw luôn là BUG lập trình (gọi hook sai pha, đọc field
      // của object undefined) — không phải điều kiện runtime hợp lệ nào cần chịu đựng.
      // biome-ignore lint/style/noProcessEnv: cần cổng "đang là dev BUILD" (nơi lập trình viên sửa code). `@/env` không quản `NODE_ENV`, và `NEXT_PUBLIC_APP_ENV` sai ngữ nghĩa ở đây — staging build có `NODE_ENV=production` nên KHÔNG throw vào mặt staff, đúng ý định. Tiền lệ: `lib/local-storage.client.ts`.
      if (process.env.NODE_ENV !== "production") {
        throw error;
      }
    }
  }

  return Object.keys(collected).length > 0 ? collected : undefined;
}
