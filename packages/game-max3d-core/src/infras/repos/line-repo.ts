import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";

export abstract class AbstractLineRepository<
  TLineDoc extends object,
> extends BaseRepo<any> {
  private static readonly BULK_CHUNK_SIZE = 500;

  async upsertLines(lines: Array<Omit<TLineDoc, "_id">>): Promise<void> {
    if (lines.length === 0) return;

    const ops = lines.map((doc) => ({
      updateOne: {
        filter: {
          entryId: (doc as any).entryId,
          lineIndex: (doc as any).lineIndex,
        },
        update: { $setOnInsert: doc },
        upsert: true,
      },
    }));

    for (
      let i = 0;
      i < ops.length;
      i += AbstractLineRepository.BULK_CHUNK_SIZE
    ) {
      const chunk = ops.slice(i, i + AbstractLineRepository.BULK_CHUNK_SIZE);
      await this.bulkWrite(chunk, { ordered: false });
    }
  }

  async getLinesByEntryId(
    entryId: string,
    options: { size?: number; cursor?: number } = {}
  ): Promise<{ lines: TLineDoc[]; hasMore: boolean }> {
    const { size = 50, cursor } = options;
    const col = await this.getCollection();
    const filter: Record<string, unknown> = { entryId: new ObjectId(entryId) };

    if (cursor != null) {
      filter.lineIndex = { $gt: cursor };
    }

    const lines = await col
      .find(filter)
      .sort({ lineIndex: 1 })
      .limit(size + 1)
      .toArray();

    const hasMore = lines.length > size;
    const slice = hasMore ? lines.slice(0, size) : lines;

    return { lines: slice as unknown as TLineDoc[], hasMore };
  }

  async countByEntryId(entryId: string): Promise<number> {
    return await this.count({ entryId: new ObjectId(entryId) });
  }
}
