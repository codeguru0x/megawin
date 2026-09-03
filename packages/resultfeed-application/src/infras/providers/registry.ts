/**
 * ResultFeed – Provider Registry
 *
 * Map `SourceEntity.providerId` (dữ liệu, sửa được qua backoffice — xem `SourceRepository`)
 * sang instance {@link FetchProvider} thật. Đọc credentials từ `process.env` LÚC GỌI (không
 * phải module load) để test có thể set env trước khi registry được dùng lần đầu tiên.
 *
 * Cache theo `providerId` — `OxylabsUnblockerProvider` giữ 1 `ProxyAgent`/`Dispatcher` sống,
 * dựng lại mỗi request vừa tốn kết nối vừa mất lợi ích connection pooling của undici.
 */

import { ResultFeedProviderId } from "@megawin/resultfeed/entities";
import { AppException } from "@megawin/shared/errors";

import { ContextDevProvider } from "./context-dev-provider";
import { OxylabsUnblockerProvider } from "./oxylabs-provider";
import type { FetchProvider } from "./types";

const cache = new Map<string, FetchProvider>();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw AppException.internal(`Thiếu env "${name}" — cần cho provider fetch ResultFeed.`);
  }
  return value;
}

/** Dựng instance provider THẬT theo `providerId` — xem {@link ResultFeedProviderId} cho danh sách hợp lệ. */
function buildProvider(providerId: string): FetchProvider {
  switch (providerId) {
    case ResultFeedProviderId.OxylabsUnblocker: {
      return new OxylabsUnblockerProvider({
        username: requireEnv("OXYLABS_USERNAME"),
        password: requireEnv("OXYLABS_PASSWORD"),
      });
    }
    case ResultFeedProviderId.ContextDev: {
      return new ContextDevProvider({
        apiKey: requireEnv("CONTEXT_DEV_API_KEY"),
      });
    }
    default: {
      throw AppException.internal(`Provider "${providerId}" chưa được đăng ký trong providers/registry.ts.`);
    }
  }
}

/** Lấy provider theo `providerId` (giá trị `SourceEntity.providerId`) — cache theo id, tạo lười khi cần. */
export function resolveProvider(providerId: string): FetchProvider {
  const cached = cache.get(providerId);
  if (cached) {
    return cached;
  }
  const provider = buildProvider(providerId);
  cache.set(providerId, provider);
  return provider;
}
