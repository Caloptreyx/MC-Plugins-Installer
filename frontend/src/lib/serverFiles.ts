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
