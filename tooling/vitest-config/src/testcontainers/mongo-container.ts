import { MongoDBContainer, type StartedMongoDBContainer } from "@testcontainers/mongodb";

let containerPromise: Promise<StartedMongoDBContainer> | undefined;

/**
 * Singleton Mongo container cho CẢ session `turbo run test` — mỗi package gọi hàm này
 * (qua global-setup riêng của process mình) đều `.withReuse()` cùng 1 label, Testcontainers
 * tự attach vào container đã chạy thay vì start container mới. Ryuk reaper dọn cuối session.
 *
 * Image version: dùng `mongo:8.2` (không phải `8.0`) vì Docker Desktop kernel
 * Linuxkit ≥6.19 / 7.x có incompatibility đã biết với Mongo 8.0
 * (SERVER-121912 — Mongo refuse start). Đối chiếu lại với version Atlas production
 * khi team bump cluster; nếu Atlas vẫn 8.0.x thì chấp nhận lệch minor ở test
 * (wire protocol tương thích) cho đến khi Atlas cũng lên 8.2+.
 */
export function getSharedMongoContainer(): Promise<StartedMongoDBContainer> {
  if (!containerPromise) {
    containerPromise = new MongoDBContainer("mongo:8.2").withReuse().start();
  }
  return containerPromise;
}
