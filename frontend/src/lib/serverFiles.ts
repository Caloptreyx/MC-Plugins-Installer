import { z } from 'zod';
import { getHttpStatus } from '@/api/axios.ts';
import loadDirectory from '@/api/server/files/loadDirectory.ts';
import { serverDirectoryEntrySchema } from '@/lib/schemas/server/files.ts';

export type DirectoryEntry = z.infer<typeof serverDirectoryEntrySchema>;

/** All entries of a server directory, or `null` when it does not exist. */
export async function listDirectory(uuid: string, directory: string): Promise<DirectoryEntry[] | null> {
  const entries: DirectoryEntry[] = [];
  try {
    for (let page = 1; ; page++) {
      const { entries: batch } = await loadDirectory(uuid, directory, page, 'name_asc');
      entries.push(...batch.data);
      if (batch.data.length === 0 || page * batch.perPage >= batch.total) return entries;
    }
  } catch (error) {
    if (getHttpStatus(error) === 404) return null;
    throw error;
  }
}

/** Runs `task` over `items` with at most `limit` in flight, preserving order. */
export async function mapConcurrent<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
