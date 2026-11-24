import { httpErrorToHuman } from '@/api/axios.ts';
import { InstallError } from '../lib/install.ts';
import { ModrinthError } from '../lib/modrinth.ts';
import { FileActionError } from '../lib/plugins.ts';
import { useExtTranslations } from '../translations.ts';

/** Turns errors of installs, file actions and source lookups into a translated sentence. */
export function useErrorMessage() {
  const { t: tExt } = useExtTranslations();

  return (error: unknown): string => {
    if (error instanceof InstallError) {
      const values = { file: error.file, seconds: error.seconds };
      switch (error.kind) {
        case 'noFile':
          return tExt('pages.server.plugins.errors.noFile', {});
        case 'notDownloadable':
          return tExt('pages.server.plugins.errors.notDownloadable', {});
        case 'unsafeFile':
          return tExt('pages.server.plugins.errors.unsafeFile', values);
        case 'noChecksum':
          return tExt('pages.server.plugins.errors.noChecksum', values);
        case 'exists':
          return tExt('pages.server.plugins.errors.exists', values);
        case 'mismatch':
          return tExt('pages.server.plugins.errors.mismatch', values);
        case 'mismatchLeft':
          return tExt('pages.server.plugins.errors.mismatchLeft', values);
        case 'uploadMismatch':
          return tExt('pages.server.plugins.errors.uploadMismatch', {});
        case 'rateLimited':
          return tExt('pages.server.plugins.errors.rateLimited', values);
        case 'oldNotRemoved':
          return tExt('pages.server.plugins.errors.oldNotRemoved', values);
        case 'backupLeft':
          return tExt('pages.server.plugins.errors.backupLeft', values);
        case 'restoreFailed':
          return tExt('pages.server.plugins.errors.restoreFailed', values);
      }
    }
    if (error instanceof FileActionError) {
      const values = { file: error.fileName };
      if (error.kind === 'exists') return tExt('pages.server.plugins.errors.exists', values);
      return error.kind === 'rename'
        ? tExt('pages.server.plugins.errors.renameSkipped', values)
        : tExt('pages.server.plugins.errors.deleteSkipped', values);
    }
    if (error instanceof ModrinthError) {
      return error.status === 404
        ? tExt('pages.server.plugins.errors.modrinthNotFound', {})
        : tExt('pages.server.plugins.errors.modrinthFailed', { status: error.status });
    }
    return httpErrorToHuman(error);
  };
}
