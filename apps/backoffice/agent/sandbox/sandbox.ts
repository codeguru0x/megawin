/**
 * Sandbox của agent Mira — môi trường bash cô lập cho tool `bash`.
 *
 * VÌ SAO PHẢI AUTHOR FILE NÀY (không dùng default): sandbox default là `allow-all` egress. Đây
 * là app tài chính — model có thể vừa đọc số liệu doanh thu thật ở turn trước, nên một sandbox
 * ra được internet tự do là kênh exfiltration nếu model bị prompt injection.
 *
 * VÌ SAO `deny-all` CHỨ KHÔNG PHẢI ALLOWLIST: `bash` ở đây chỉ để tính toán/biến đổi dữ liệu đã
 * có trong hội thoại. Nó KHÔNG cần internet — model call đi từ app runtime, không từ trong VM;
 * `web_fetch` cũng chạy ở app runtime với allowlist riêng. Đo thực tế 16/08 còn cho thấy dạng
 * allowlist theo domain **không được enforce** trên microsandbox 0.6.9 local (xem
 * `ALLOWLIST_NOTE`), nên allowlist ở local là cảm giác an toàn giả.
 *
 * VÌ SAO CÓ `bootstrap`: lần đầu dùng sandbox phải cài microsandbox + pull image + boot VM. Nếu
 * để việc đó xảy ra trong turn của staff thì step vượt ngưỡng → crash mid-body → workflow-sdk
 * redeliver vô hạn (đã xảy ra thật 16/08, xem
 * `.cursor/plans/ai-panel/p0-04-sandbox-chat-ux.plan.md` §0.1). `bootstrap` là template-scoped,
 * chạy 1 lần lúc build template — đúng chỗ để trả giá cold-start, và cũng là chỗ đặt assertion
 * an ninh (§1.3) để nó chạy ngoài hội thoại.
 */

import { defaultBackend, defineSandbox, type SandboxNetworkPolicy } from "eve/sandbox";

/**
 * ⚠️ ĐO THỰC TẾ 16/08 — dạng allowlist theo domain KHÔNG enforce trên microsandbox 0.6.9 (macOS
 * arm64), dù log eve vẫn in `applying network policy`:
 *
 * | networkPolicy | Probe `/dev/tcp/example.com/443` | Kết luận |
 * |---|---|---|
 * | `{ allow: ["ai-gateway.vercel.sh", …] }` | **mở được** (exit 0) | allowlist inert |
 * | `"deny-all"` | fail — `Temporary failure in name resolution` | enforce thật, chặn cả DNS |
 *
 * Vì vậy KHÔNG dùng dạng allowlist ở local. Nếu sau này cần cho sandbox ra internet có chọn lọc,
 * phải đo lại bằng probe ở `bootstrap` — không tin vào việc "đã khai allowlist trong code".
 */
const ALLOWLIST_NOTE = "microsandbox 0.6.9: allowlist theo domain không enforce — xem bảng đo ở trên";

/**
 * Policy cho **Vercel Sandbox** (production). Theo `node_modules/eve/docs/sandbox.mdx`, `vercel()`
 * hỗ trợ allowlist theo domain thật. Vẫn để rất hẹp: sandbox không có nghiệp vụ gì cần internet;
 * mở `ai-gateway` cho trường hợp tương lai chạy nested agent trong sandbox.
 *
 * ✅ ĐÃ VERIFY trên Vercel 18/08 (build log deploy đầu tiên): `bootstrap` chạy tới assertion §4,
 * tức `EGRESS_PROBE` **KHÔNG** trả `EGRESS_OPEN` ⇒ allowlist ở đây enforce THẬT trên Vercel
 * Sandbox — khác microsandbox 0.6.9 local (xem `ALLOWLIST_NOTE`). Đây là cơ sở để `bash` giữ
 * `approval: never()` trên production. Đổi allowlist này thì phải đọc lại build log để xác nhận,
 * đừng suy từ việc "code có khai policy".
 */
const VERCEL_NETWORK_POLICY: SandboxNetworkPolicy = {
  allow: ["ai-gateway.vercel.sh"],
  subnets: {
    // Chặn dứt điểm mạng nội bộ + link-local. 169.254.0.0/16 là metadata endpoint của cloud
    // provider — nơi lấy được IAM credential nếu để hở.
    deny: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16"],
  },
};

/**
 * Base image cho microsandbox (local dev). Để rỗng ⇒ dùng **default của eve**
 * (`ghcr.io/vercel/eve:latest`) — đây là lựa chọn ĐÚNG và cố ý:
 *
 * - Image đó cài sẵn `python3` + `python3-pip` + Node 24 + `pnpm` + `jq` + `ripgrep` (đọc từ
 *   history của image config, 16/08). Đây là điều kiện để `bash` tính toán được BẰNG MÁY thay vì
 *   để model nhẩm — xem `PY_ASSERT` bên dưới.
 * - Vercel Sandbox (production) **luôn** boot từ image này: eve loại `runtime` khỏi option của
 *   `vercel()` ("eve always boots its sandboxes from the published eve image"). Dùng image khác ở
 *   local nghĩa là local và prod có bộ binary khác nhau ⇒ prompt viết cho local sẽ sai trên prod.
 *
 * ⚠️ LỊCH SỬ: 16/08 file này từng pin `debian:stable-slim` vì ghcr không tải nổi blob 106,7 MB
 * (5 lần thử dừng ở 0,15 / 0,9 / 1,2 / 4,6 / 37,2 MB — `curl: (18) Transferred a partial file`;
 * microsandbox không resume nên template init fail `error decoding response body`). Debian slim
 * KHÔNG có `python3` nên `bash` chỉ còn awk/coreutils. Đo lại cùng ngày: tải trọn 106,7 MB ở
 * 10 MB/s ⇒ lỗi đó là **tạm thời của mạng**, không phải thuộc tính của registry. Vì vậy quay về
 * image gốc và giữ `EVE_MICROSANDBOX_IMAGE` làm escape hatch cho máy mạng kém.
 *
 * Nếu buộc phải override: image thay thế **phải có `python3`**, nếu không `bootstrap` sẽ fail ở
 * `PY_ASSERT` (đúng ý đồ — mất python là mất độ chính xác số học). Gợi ý:
 * `docker.io/library/python:3.13-slim` (41 MB, Docker Hub CDN) — có python3 nhưng KHÔNG có Node.
 */
const MICROSANDBOX_IMAGE = process.env.EVE_MICROSANDBOX_IMAGE;

/**
 * Assertion năng lực tính toán, chạy ở `bootstrap` (ngoài hội thoại) nên staff không bao giờ gặp
 * lỗi "thiếu python" giữa turn.
 *
 * KIỂM 2 THỨ, không phải 1:
 * 1. `python3` tồn tại và chạy được.
 * 2. `decimal.Decimal` cho kết quả **chính xác thập phân**. Phép thử `0.1 + 0.2 == 0.3` là phép
 *    thử kinh điển: với float nhị phân nó SAI (0.30000000000000004), với `Decimal` thì ĐÚNG. Đây
 *    chính là loại sai số làm lệch số tiền VND khi cộng dồn hàng nghìn dòng, nên nó phải được
 *    verify chứ không phải giả định.
 */
const PY_ASSERT = "PY_DECIMAL_OK";

/**
 * Host dùng để thử egress trong assertion `bootstrap`. Cố ý là domain ổn định và KHÔNG bao giờ
 * nằm trong policy — mở được tới đây nghĩa là egress không bị chặn.
 */
const EGRESS_PROBE = { host: "example.com", port: 443 } as const;

/**
 * Escape hatch khi buộc phải chạy backend không chặn được egress. Đặt `=1` để `bootstrap` chỉ
 * cảnh báo thay vì fail, NHƯNG khi đó **phải** đổi `bash` sang `approval: once()` — điều kiện bắt
 * buộc ở plan p0-04 §1.3, vì lý do duy nhất cho `never()` là sandbox không ra được internet.
 */
const ALLOW_OPEN_EGRESS = process.env.MEGAWIN_SANDBOX_ALLOW_OPEN_EGRESS === "1";

/** Marker stdout của probe — dùng chuỗi thay vì exit code để `sandbox.run` không throw khi bị chặn. */
const PROBE_OPEN = "EGRESS_OPEN";

/**
 * Tên biến mà sự hiện diện trong VM sandbox nghĩa là env đang leak — blocklist cho assertion §4.
 *
 * VÌ SAO BLOCKLIST NGẮN LÀ ĐỦ, không cần allowlist mọi biến được phép: **env leak là
 * all-or-nothing**. Không có cơ chế nào truyền lẻ một biến vào VM — nếu eve/Vercel bật inherit env
 * thì nó vào hàng loạt. Chế độ hỏng thật trông như "cả trăm biến quen tên xuất hiện", chứ không
 * phải "một biến tên lạ". Nên chỉ cần vài tên **chắc chắn có trong app process** làm canary là bắt
 * được, không cần liệt kê hết những gì vô hại.
 *
 * ⚠️ ĐÃ THỬ ALLOWLIST (deny-by-default trên tên biến VM) VÀ BỎ: nhạy hơn về lý thuyết, nhưng tập
 * biến Vercel Sandbox tự set trong VM không có tài liệu nào liệt kê đủ (`AWS_CA_BUNDLE` là phát
 * hiện tình cờ qua build đỏ 18/08) ⇒ mỗi biến platform mới là một lần **chặn deploy production**.
 * Cân chi phí sai: dương tính giả ở đây làm app tài chính không deploy được (đã xảy ra 2 lần
 * 18/08), còn âm tính giả thì gần như không có cơ chế nào tạo ra vì lý do all-or-nothing ở trên.
 * Trả giá đắt cho rủi ro gần bằng không là sai — nên giữ blocklist, và bù bằng dòng log trọn danh
 * sách tên biến VM ở §4 (quan sát được mà không chặn deploy).
 *
 * KHÔNG phải danh sách đầy đủ secret của app — đừng đọc nó như vậy. Nó là canary, và giá trị của
 * nó nằm ở việc các tên này chắc chắn có mặt phía app, chứ không ở độ dài.
 */
const FORBIDDEN_CREDENTIAL_ENV_NAMES = new Set([
  // Credential của platform. `VERCEL_OIDC_TOKEN` là canary tốt nhất: trên Vercel nó CHẮC CHẮN có
  // trong app process — eve dùng chính nó để prewarm template này — nên nếu inheritance bật thì nó
  // vào VM và assertion đỏ ngay.
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "VERCEL_OIDC_TOKEN",
  "VERCEL_TOKEN",
  // Secret của app đáng giá nhất nếu model đọc được: quyền đọc/ghi toàn bộ DB nghiệp vụ và khả năng
  // tự ký session. Thêm vào đây vì chúng rẻ để kiểm và là thứ ta sợ nhất, không phải vì danh sách
  // cần đầy đủ (xem JSDoc: canary, không phải inventory).
  "MONGODB_URI",
  "REDIS_URI",
  "BETTER_AUTH_SECRET",
  "AI_GATEWAY_API_KEY",
]);

export default defineSandbox({
  // `defaultBackend()` tự chọn: Vercel Sandbox khi deploy Vercel → Docker → microsandbox →
  // just-bash. KHÔNG pin cứng `microsandbox()`: máy dev khác trong team có thể có Docker, và
  // trên Vercel bắt buộc phải là `vercel()`.
  backend: defaultBackend({
    vercel: { networkPolicy: VERCEL_NETWORK_POLICY, resources: { vcpus: 2 } },
    // `deny-all` (không phải allowlist) — xem ALLOWLIST_NOTE.
    // `image` chỉ truyền khi có override: bỏ trống ⇒ eve dùng image chính thức của nó, khớp
    // production (xem MICROSANDBOX_IMAGE). Spread có điều kiện thay vì `image: undefined` để
    // không phụ thuộc vào việc `exactOptionalPropertyTypes` có bật hay không.
    microsandbox: { networkPolicy: "deny-all", ...(MICROSANDBOX_IMAGE ? { image: MICROSANDBOX_IMAGE } : {}) },
    // Docker chỉ hiểu `allow-all`/`deny-all`. Chọn `deny-all` để Docker KHÔNG còn là ngoại lệ mất
    // lớp bảo vệ — nhờ vậy `bash` giữ được `approval: never()` trên mọi backend local.
    docker: { networkPolicy: "deny-all" },
  }),
  description: "Sandbox tra cứu/tính toán phụ trợ cho trợ lý vận hành MegaWin.",
  // Source file này + seed content đã được eve track tự động. Phải nhắc TAY biến env ở đây vì nó
  // là input NGOÀI source: đổi `EVE_MICROSANDBOX_IMAGE` mà key không đổi thì eve tái dùng template
  // cũ (dựng từ image cũ) ⇒ assertion python có thể pass/fail không khớp image đang khai báo.
  revalidationKey: () => `megawin-ops-v2:${MICROSANDBOX_IMAGE ?? "default"}`,
  async bootstrap({ use }) {
    const sandbox = await use();

    // ── 1. Smoke test bash thật ────────────────────────────────────────────────────────────────
    // Xác nhận bash chạy được ngay lúc build template, thay vì để lỗi lộ ra giữa hội thoại của
    // staff. `just-bash` (fallback cuối, không có binary thật) sẽ fail ở đây → thấy sớm.
    const smoke = await sandbox.run({ command: "bash -lc 'echo sandbox-ready'" });
    if (smoke.exitCode !== 0) {
      throw new Error(`Sandbox bash không chạy được (exit ${smoke.exitCode}): ${smoke.stderr}`);
    }

    // ── 2. Assertion python3 + số học thập phân chính xác ──────────────────────────────────────
    // Đây là lý do tồn tại của sandbox theo yêu cầu nghiệp vụ: model KHÔNG được tự nhẩm số, mọi
    // phép tính phải chạy bằng máy. Nếu python3 vắng mặt thì `bash` tụt xuống awk (float 64-bit,
    // sai số khi cộng dồn tiền) mà model vẫn tưởng mình tính đúng ⇒ fail-closed ngay tại đây.
    //
    // `|| true` + so khớp stdout thay vì exit code: `sandbox.run` throw khi exit != 0, còn ở đây
    // "python không có" là kết quả cần ĐỌC ĐƯỢC để in message hướng dẫn, không phải exception thô.
    const py = await sandbox.run({
      command:
        "bash -lc 'python3 -c \"from decimal import Decimal as D; " +
        `assert D(\\"0.1\\") + D(\\"0.2\\") == D(\\"0.3\\"); print(\\"${PY_ASSERT}\\")" 2>&1 || true'`,
    });
    if (!py.stdout.includes(PY_ASSERT)) {
      throw new Error(
        "Sandbox KHÔNG chạy được `python3` với số học Decimal chính xác — output: " +
          `${py.stdout.trim() || "(rỗng)"}. Đây là điều kiện bắt buộc: mọi phép tính số liệu phải ` +
          "chạy bằng python trong sandbox, không để model nhẩm. Sửa: bỏ `EVE_MICROSANDBOX_IMAGE` " +
          "để dùng image chính thức của eve (đã có python3), hoặc trỏ nó tới image CÓ python3.",
      );
    }

    // ── 3. Assertion egress: điều kiện SỐNG CÒN cho `bash` chạy `never()` ──────────────────────
    // Lý do duy nhất `bash` được phép chạy không cần duyệt là VM không ra được internet (plan
    // §1.3). Nếu điều đó âm thầm sai (đã xảy ra thật với dạng allowlist — xem ALLOWLIST_NOTE) thì
    // ta mất lớp phòng vệ mà không ai biết ⇒ fail-closed ngay lúc build template.
    //
    // Probe bằng `/dev/tcp` (bash builtin) chứ KHÔNG bằng `curl`: image slim không có curl.
    // Bọc if/else để LUÔN exit 0 — `sandbox.run` của eve throw khi exit != 0, mà "bị chặn" là
    // kết quả MONG ĐỢI, không phải lỗi.
    const probe = await sandbox.run({
      command:
        `bash -lc 'if exec 3<>/dev/tcp/${EGRESS_PROBE.host}/${EGRESS_PROBE.port} 2>/dev/null; ` +
        `then echo ${PROBE_OPEN}; else echo EGRESS_BLOCKED; fi'`,
    });
    if (probe.stdout.includes(PROBE_OPEN)) {
      const message =
        `Sandbox mở được TCP tới ${EGRESS_PROBE.host}:${EGRESS_PROBE.port} — egress KHÔNG bị chặn. ` +
        `(${ALLOWLIST_NOTE}). Sửa: dùng networkPolicy "deny-all", HOẶC đổi \`bash\` sang ` +
        "`approval: once()` rồi đặt MEGAWIN_SANDBOX_ALLOW_OPEN_EGRESS=1. " +
        "Xem .cursor/plans/ai-panel/p0-04-sandbox-chat-ux.plan.md §1.3.";
      if (!ALLOW_OPEN_EGRESS) {
        throw new Error(message);
      }
      console.warn(`[sandbox] ⚠️ ${message}`);
    }

    // ── 4. Assertion: env của app KHÔNG leak vào sandbox ───────────────────────────────────────
    // `bash` chạy `never()` nên nếu `MONGODB_URI`/AWS credential có mặt trong VM thì model đọc
    // được không cần ai duyệt.
    //
    // CÁCH LÀM: so khớp CHÍNH XÁC tên biến với `FORBIDDEN_CREDENTIAL_ENV_NAMES` (canary — xem JSDoc
    // ở đó để biết vì sao list ngắn là đủ). KHÔNG dùng regex từ khoá: đã thất bại 2 lần thật ngày
    // 18/08, cả hai đều là dương tính giả chặn deploy production:
    //
    // 1. `env | grep -iE "mongo|aws_|secret|…"` — match cả phần GIÁ TRỊ, nên biến vô hại có giá trị
    //    chứa chữ "token" cũng làm đỏ build.
    // 2. Vẫn regex nhưng chỉ khớp TÊN — `AWS_CA_BUNDLE` (đường dẫn file CA công khai) khớp `aws_`.
    //
    // Gốc của cả hai: regex từ khoá đoán bừa. So khớp chính xác thì không có chuyện đó.
    //
    // `compgen -e` (không phải `env`) liệt kê đúng tập biến **exported** — tức đúng thứ process con
    // của model đọc được — mỗi tên một dòng, nên không bao giờ chạm tới giá trị.
    const vmEnv = await sandbox.run({ command: "bash -lc 'compgen -e'" });
    const vmEnvNames = vmEnv.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    // Log TRỌN danh sách tên biến trong VM, kể cả khi assertion PASS. Đây là phần BÙ cho việc chọn
    // blocklist thay vì allowlist: ta không chặn biến lạ, nhưng luôn NHÌN THẤY chúng. Không có dòng
    // này thì tập biến VM là vùng tối hoàn toàn (`AWS_CA_BUNDLE` chỉ lộ ra nhờ một build đỏ).
    // An toàn để log: chỉ TÊN, không có giá trị.
    console.log(`[sandbox] Tên biến env trong VM (${vmEnvNames.length}): ${vmEnvNames.join(", ")}`);
    // In THẲNG tên biến vào message: bản đầu chỉ báo số lượng ("thấy 1 biến") nên build log Vercel
    // không cho biết biến nào ⇒ không debug được, mất trọn một vòng deploy 18/08. Tên biến an toàn
    // để log; giá trị thì TUYỆT ĐỐI không.
    const leakedNames = vmEnvNames.filter((name) => FORBIDDEN_CREDENTIAL_ENV_NAMES.has(name));
    if (leakedNames.length > 0) {
      throw new Error(
        `Sandbox thấy ${leakedNames.length} credential trong VM (${leakedNames.join(", ")}) — ` +
          "env đang leak vào sandbox. KHÔNG được chạy `bash` với approval never() trong tình trạng " +
          "này: model đọc được credential đó mà không ai duyệt. Vì env leak là all-or-nothing, hãy " +
          "coi đây là dấu hiệu TOÀN BỘ env của app đã vào VM, không chỉ mấy biến vừa in ra — đọc " +
          "dòng log tên biến ở trên để xác nhận, và KHÔNG nới assertion này để lấy build xanh.",
      );
    }
  },
});
