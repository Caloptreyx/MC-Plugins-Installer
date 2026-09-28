import { faCodeBranch, faDownload, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Center, Group, SimpleGrid, Stack } from '@mantine/core';
import { useMemo, useState } from 'react';
import { httpErrorToHuman } from '@/api/axios.ts';
import Button from '@/elements/buttons/Button.tsx';
import Alert from '@/elements/feedback/Alert.tsx';
import Spinner from '@/elements/feedback/Spinner.tsx';
import Select from '@/elements/input/Select.tsx';
import { Modal, ModalFooter } from '@/elements/modals/Modal.tsx';
import ConditionalTooltip from '@/elements/overlays/ConditionalTooltip.tsx';
import Text from '@/elements/typography/Text.tsx';
import { bytesToString } from '@/lib/format/size.ts';
import { useServerCan } from '@/plugins/usePermissions.ts';
import { useToast } from '@/providers/ToastProvider.tsx';
import { useServerStore } from '@/stores/server.ts';
import type { PluginSource, PluginVersion } from '../lib/catalog.ts';
import { newestFirst } from '../lib/format.ts';
import {
  isPluginLoader,
  loaderLabel,
  loaderSelectData,
  PLUGIN_LOADER_IDS,
  type PluginLoader,
  runsOn,
} from '../lib/loaders.ts';
import { type InstalledPlugin, installPluginVersion } from '../lib/plugins.ts';
import { useDetection, useProjectVersions, useRefreshInstalledPlugins } from '../lib/queries.ts';
import { CHANNEL_LABELS } from './ChannelBadge.tsx';
import PluginIcon from './PluginIcon.tsx';
import ProviderMark from './ProviderMark.tsx';

export interface InstallTarget {
  source: PluginSource;
  id: string;
  title: string;
  iconUrl: string | null;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  project: InstallTarget;
  /** The copy of this plugin already on the server; installing replaces it. */
  installed: InstalledPlugin | null;
  /** Version to preselect, e.g. when installing from a row of the Versions table. */
  initialVersionId?: string | null;
}

/** Newest installable release among `candidates`, then the newest installable pre-release, then the newest. */
function preferredVersion(candidates: PluginVersion[]) {
  const installable = candidates.filter((version) => version.file?.url);
  return installable.find((version) => version.channel === 'release') ?? installable[0] ?? candidates[0] ?? null;
}

function InstallForm({ onClose, project, installed, initialVersionId }: Omit<Props, 'opened'>) {
  const uuid = useServerStore((state) => state.server.uuid);
  const { addToast } = useToast();
  const refreshInstalled = useRefreshInstalledPlugins();
  const canCreate = useServerCan('files.create');
  const canDelete = useServerCan('files.delete');
  const detection = useDetection();
  const versionsQuery = useProjectVersions(project.source, project.id);

  const versions = versionsQuery.data ?? [];
  const detectedLoader = detection.data?.loader ?? null;
  const detectedVersion = detection.data?.minecraftVersion ?? null;
  const initialVersion = versions.find((version) => version.id === initialVersionId) ?? null;

  // `undefined` means "not touched yet": the value then follows the detected server defaults.
  const [loaderChoice, setLoaderChoice] = useState<PluginLoader>();
  const [gameVersionChoice, setGameVersionChoice] = useState<string | null>();
  const [versionChoice, setVersionChoice] = useState<string | null>(initialVersionId ?? null);
  const [installing, setInstalling] = useState(false);

  const supportedLoaders = useMemo(
    () => PLUGIN_LOADER_IDS.filter((loader) => versions.some((version) => runsOn(version.loaders, loader))),
    [versions],
  );

  const defaultLoader: PluginLoader | null = initialVersion
    ? detectedLoader && runsOn(initialVersion.loaders, detectedLoader)
      ? detectedLoader
      : (initialVersion.loaders.find(isPluginLoader) ?? null)
    : (detectedLoader ?? supportedLoaders[0] ?? null);
  const loader = loaderChoice ?? defaultLoader;

  const gameVersionsForLoader = useMemo(
    () =>
      newestFirst(
        versions
          .filter((version) => !loader || runsOn(version.loaders, loader))
          .flatMap((version) => version.gameVersions),
      ),
    [versions, loader],
  );

  const defaultGameVersion = initialVersion
    ? detectedVersion && initialVersion.gameVersions.includes(detectedVersion)
      ? detectedVersion
      : (initialVersion.gameVersions[0] ?? null)
    : detectedVersion;
  const gameVersion = gameVersionChoice === undefined ? defaultGameVersion : gameVersionChoice;

  const candidates = versions.filter(
    (version) =>
      (!loader || runsOn(version.loaders, loader)) && (!gameVersion || version.gameVersions.includes(gameVersion)),
  );
  const selected = candidates.find((version) => version.id === versionChoice) ?? preferredVersion(candidates);
  const selectedFile = selected?.file ?? null;
  const alreadyInstalled = !!selected && installed?.version?.id === selected.id;

  if (versionsQuery.isPending || detection.isPending) {
    return (
      <Center py='xl'>
        <Spinner />
      </Center>
    );
  }

  if (versionsQuery.isError) {
    return <Alert color='red'>{versionsQuery.error.message}</Alert>;
  }

  const install = async () => {
    if (!selected) return;
    setInstalling(true);
    try {
      await installPluginVersion(uuid, selected, installed);
      addToast(
        `${project.title} ${selected.versionNumber} was ${installed ? 'switched to' : 'installed'}. Restart the server to load it.`,
        'success',
      );
      onClose();
      refreshInstalled();
    } catch (error) {
      addToast(httpErrorToHuman(error), 'error');
    } finally {
      setInstalling(false);
    }
  };

  const blockedReason = !canCreate
    ? 'You do not have permission to create files on this server.'
    : installed && !canDelete
      ? 'Replacing a plugin requires permission to delete files on this server.'
      : alreadyInstalled
        ? 'This version is already installed.'
        : null;

  const warnings = [
    selected && !selectedFile ? 'This version has no jar to install.' : null,
    selectedFile && !selectedFile.url
      ? `The author of ${project.title} does not allow this version to be downloaded outside CurseForge. Pick another version, or download it from CurseForge and upload it to the plugins folder yourself.`
      : null,
    selected && detectedLoader && !runsOn(selected.loaders, detectedLoader)
      ? `This server runs ${loaderLabel(detectedLoader)}, but this version is built for ${selected.loaders.map(loaderLabel).join(', ')}. It may not load.`
      : null,
    selected && detectedVersion && !selected.gameVersions.includes(detectedVersion)
      ? `This server runs Minecraft ${detectedVersion}, which this version does not list as supported.`
      : null,
  ].filter((warning) => warning !== null);

  return (
    <Stack gap='md'>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          withAsterisk
          label='Plugin Loader'
          data={loaderSelectData(detectedLoader).map((option) => ({
            ...option,
            disabled: !supportedLoaders.includes(option.value),
          }))}
          value={loader}
          onChange={(value) => {
            if (value && isPluginLoader(value)) setLoaderChoice(value);
            setVersionChoice(null);
          }}
        />
        <Select
          clearable
          searchable
          label='Minecraft version'
          placeholder='Any version'
          data={[
            ...(detectedVersion && !gameVersionsForLoader.includes(detectedVersion)
              ? [{ value: detectedVersion, label: `${detectedVersion} (detected, not supported)` }]
              : []),
            ...gameVersionsForLoader.map((value) => ({
              value,
              label: value === detectedVersion ? `${value} (detected)` : value,
            })),
          ]}
          value={gameVersion}
          onChange={(value) => {
            setGameVersionChoice(value);
            setVersionChoice(null);
          }}
        />
      </SimpleGrid>

      <Select
        withAsterisk
        searchable
        label='Plugin version'
        data={candidates.map((version) => ({
          value: version.id,
          label: `${version.name} (${CHANNEL_LABELS[version.channel]})`,
          disabled: !version.file?.url,
        }))}
        value={selected?.id ?? null}
        onChange={setVersionChoice}
        disabled={candidates.length === 0}
        error={
          candidates.length === 0
            ? `No version for ${loader ? loaderLabel(loader) : 'this loader'}${gameVersion ? ` on Minecraft ${gameVersion}` : ''}.`
            : undefined
        }
      />

      {warnings.length > 0 && (
        <Alert color='yellow' icon={<FontAwesomeIcon icon={faTriangleExclamation} />}>
          <Stack gap={4}>
            {warnings.map((warning) => (
              <Text key={warning} size='sm'>
                {warning}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      <Text size='xs' c='dimmed'>
        {selectedFile
          ? `${selectedFile.filename} (${bytesToString(selectedFile.size)}) is downloaded into the plugins folder. `
          : ''}
        {installed && selected && !alreadyInstalled
          ? `It replaces ${installed.fileName}${installed.enabled ? '' : ' and stays disabled'}. `
          : ''}
        Restart the server afterwards to load it.
      </Text>

      <ModalFooter>
        <ConditionalTooltip enabled={!!blockedReason} label={blockedReason ?? ''}>
          <Button
            color='blue'
            leftSection={<FontAwesomeIcon icon={installed ? faCodeBranch : faDownload} />}
            loading={installing}
            disabled={!selected || !selectedFile?.url || !!blockedReason}
            onClick={install}
          >
            {installed ? 'Switch version' : 'Install'}
          </Button>
        </ConditionalTooltip>
        <Button variant='default' onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Stack>
  );
}

/** Picks a loader, Minecraft version and plugin version (defaulting to the detected server) and installs it. */
export default function InstallPluginModal({ opened, onClose, installed, ...rest }: Props) {
  // Keep what the modal was opened for while it animates closed, so the refresh that follows an
  // install cannot flip it into "switch version" mode on the way out.
  const [openedFor, setOpenedFor] = useState(installed);
  if (opened && openedFor !== installed) setOpenedFor(installed);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size='lg'
      title={
        <Group gap='sm' wrap='nowrap'>
          <PluginIcon url={rest.project.iconUrl} name={rest.project.title} size={36} />
          <Stack gap={0}>
            <Text fw={600}>{openedFor ? `Switch ${rest.project.title} version` : `Install ${rest.project.title}`}</Text>
            <Text size='xs' c='dimmed' component='div'>
              {openedFor ? (
                `Installed: ${openedFor.version?.versionNumber ?? openedFor.fileName}${openedFor.enabled ? '' : ' (disabled)'}`
              ) : (
                <ProviderMark source={rest.project.source} />
              )}
            </Text>
          </Stack>
        </Group>
      }
    >
      <InstallForm onClose={onClose} installed={openedFor} {...rest} />
    </Modal>
  );
}
