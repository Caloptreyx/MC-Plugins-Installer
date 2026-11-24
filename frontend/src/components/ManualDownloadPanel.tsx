import { faArrowUpRightFromSquare, faFileArrowUp, faHandPointRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Group, Stack } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Button from '@/elements/buttons/Button.tsx';
import Alert from '@/elements/feedback/Alert.tsx';
import FileInput from '@/elements/input/FileInput.tsx';
import Anchor from '@/elements/typography/Anchor.tsx';
import Text from '@/elements/typography/Text.tsx';
import { useToast } from '@/providers/ToastProvider.tsx';
import { useServerStore } from '@/stores/server.ts';
import type { PluginVersion } from '../lib/catalog.ts';
import type { PluginLoader } from '../lib/loaders.ts';
import type { InstalledPlugin } from '../lib/plugins.ts';
import type { InstallTarget } from './InstallPluginModal.tsx';
import { curseforgeFileUrl } from '../lib/curseforge.ts';
import { installPluginVersion, installUploadedJar } from '../lib/install.ts';
import { versionWithFile } from '../lib/modrinth.ts';
import { useExtTranslations } from '../translations.ts';
import { useErrorMessage } from './useErrorMessage.ts';

interface Props {
  project: InstallTarget;
  /** A CurseForge version whose author disallows third-party downloads. */
  version: PluginVersion;
  loader: PluginLoader | null;
  installed: InstalledPlugin | null;
  onInstalled: () => void;
}

/**
 * CurseForge files that can't be downloaded by third parties: install the identical file from Modrinth when Modrinth
 * has it (same SHA-1), otherwise let the user download it from CurseForge and upload it; the upload must have the
 * expected CurseForge fingerprint.
 */
export default function ManualDownloadPanel({ project, version, loader, installed, onInstalled }: Props) {
  const { t: tExt } = useExtTranslations();
  const uuid = useServerStore((state) => state.server.uuid);
  const { addToast } = useToast();
  const errorMessage = useErrorMessage();
  const [upload, setUpload] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const sha1 = version.file?.hashes.sha1 ?? null;
  const onModrinth = useQuery({
    queryKey: ['dev.caloptreyx.mcplugins', 'modrinth', 'file', sha1],
    queryFn: () => versionWithFile(sha1!),
    enabled: !!sha1,
    staleTime: 60 * 60 * 1000,
  });

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      addToast(done, 'success');
      onInstalled();
    } catch (error) {
      addToast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const values = { plugin: project.title, version: version.versionNumber };

  if (onModrinth.data) {
    const identical = onModrinth.data;
    return (
      <Alert color='blue' icon={<FontAwesomeIcon icon={faHandPointRight} />}>
        <Stack gap='xs'>
          <Text size='sm'>{tExt('pages.server.plugins.manual.onModrinth', {})}</Text>
          <Group>
            <Button
              size='xs'
              loading={busy}
              onClick={() =>
                run(
                  () => installPluginVersion(uuid, identical, loader, installed),
                  tExt('pages.server.plugins.install.toast.installed', values),
                )
              }
            >
              {tExt('pages.server.plugins.manual.installFromModrinth', {})}
            </Button>
          </Group>
        </Stack>
      </Alert>
    );
  }

  return (
    <Alert color='yellow' title={tExt('pages.server.plugins.availability.manual', {})}>
      <Stack gap='xs'>
        <Text size='sm'>{tExt('pages.server.plugins.manual.explanation', { file: version.file?.filename ?? '' })}</Text>
        <Anchor href={curseforgeFileUrl(project.slug, version.id)} target='_blank' rel='noopener noreferrer' size='sm'>
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} /> {tExt('pages.server.plugins.manual.openCurseforge', {})}
        </Anchor>
        <Group align='flex-end' wrap='wrap'>
          <FileInput
            style={{ flex: 1, minWidth: 200 }}
            accept='.jar'
            label={tExt('pages.server.plugins.manual.uploadLabel', {})}
            placeholder={tExt('pages.server.plugins.manual.uploadPlaceholder', {})}
            value={upload}
            onChange={setUpload}
            clearable
          />
          <Button
            leftSection={<FontAwesomeIcon icon={faFileArrowUp} />}
            disabled={!upload}
            loading={busy}
            onClick={async () => {
              if (!upload) return;
              await run(
                () => installUploadedJar(uuid, version, upload, installed),
                tExt('pages.server.plugins.install.toast.installed', values),
              );
            }}
          >
            {tExt('pages.server.plugins.manual.upload', {})}
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}
