import { MongoMapper } from "@megawin/data/mongo";
import type { GlobalConfigDoc, GlobalConfigEntity } from "@megawin/game-lotto535/entities";

/**
 * `GlobalConfigDoc` → entity. Map thẳng `_id` → `id`, giữ nguyên các field còn lại.
 *
 * KHÔNG merge default cho bất kỳ section nào (kể cả `ops`): mapper chỉ phản ánh
 * ĐÚNG dữ liệu trong DB. Config được seed đầy đủ khi init/update qua backoffice →
 * doc luôn có `ops`. Trường hợp doc cũ thiếu `ops`, tầng `GetGlobalConfigUseCase`
 * lấp `DEFAULT_LOTTO535_CONFIG.ops` (tạm thời, chỉ cho đường backoffice).
 */
export class GameConfigMapper extends MongoMapper<GlobalConfigDoc, GlobalConfigEntity> {
  protected mapProps(doc: GlobalConfigDoc): GlobalConfigEntity {
    const { _id, ...rest } = doc as GlobalConfigDoc & Record<string, unknown>;
    return {
      id: (_id as { toHexString(): string }).toHexString(),
      ...rest,
    } as GlobalConfigEntity;
  }
}
