import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";

export abstract class AbstractLineRepository<
  TLineDoc extends object,
> extends BaseRepo<any> {
  async upsertLines(lines: Array<Omit<TLineDoc, "_id">>): Promise<void> {
    if (lines.length === 0) return;

    const col = await this.getCollection();
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

    await col.bulkWrite(ops, { ordered: false });
  }

  async getLinesByEntryId(
    entryId: string,
    options: { page?: number; size?: number } = {}
  ): Promise<{ lines: TLineDoc[]; total: number }> {
    const { page = 1, size = 50 } = options;
    const col = await this.getCollection();
    const filter = { entryId: new ObjectId(entryId) };

    const [lines, total] = await Promise.all([
      col
        .find(filter)
        .sort({ lineIndex: 1 })
        .skip((page - 1) * size)
        .limit(size)
        .toArray(),
      col.countDocuments(filter),
    ]);

    return { lines: lines as unknown as TLineDoc[], total };
  }

  async countByEntryId(entryId: string): Promise<number> {
    return await this.count({ entryId: new ObjectId(entryId) });
  }
}
