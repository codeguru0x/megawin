import { MongoMapper } from "@megawin/data/mongo";
import type { GlobalConfigDoc, GlobalConfigEntity } from "@megawin/game-mega645/entities";
import type { Document } from "mongodb";

/**
 * `GlobalConfigDoc` → entity. Map thẳng `_id` → `id`, giữ nguyên các field còn lại.
 *
 * KHÔNG merge default cho bất kỳ section nào (kể cả `ops`): mapper chỉ phản ánh
 * ĐÚNG dữ liệu trong DB. Config được seed đầy đủ khi init/update qua backoffice →
 * doc luôn có `ops`. Trường hợp doc cũ thiếu `ops`, tầng `GetGlobalConfigUseCase`
 * lấp `DEFAULT_MEGA645_CONFIG.ops` (tạm thời, chỉ cho đường backoffice).
 */
export class GameConfigMapper extends MongoMapper<Document, GlobalConfigEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): GlobalConfigEntity {
    const { _id, ...rest } = doc as GlobalConfigDoc & Record<string, unknown>;
    return {
      id: (_id as { toHexString(): string }).toHexString(),
      ...rest,
    } as GlobalConfigEntity;
  }
}
