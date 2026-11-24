import { faCodeBranch, faDownload, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Center, Group, SimpleGrid, Stack } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import Button from '@/elements/buttons/Button.tsx';
import Alert from '@/elements/feedback/Alert.tsx';
import Spinner from '@/elements/feedback/Spinner.tsx';
import Select from '@/elements/input/Select.tsx';
import Switch from '@/elements/input/Switch.tsx';
import { Modal, ModalFooter } from '@/elements/modals/Modal.tsx';
import ConditionalTooltip from '@/elements/overlays/ConditionalTooltip.tsx';
import Text from '@/elements/typography/Text.tsx';
import { bytesToString } from '@/lib/format/size.ts';
import { useServerCan } from '@/plugins/usePermissions.ts';
import { useToast } from '@/providers/ToastProvider.tsx';
import { useServerStore } from '@/stores/server.ts';
import type { InstalledPlugin } from '../lib/plugins.ts';
import {
  compatibleVersions,
  fileAvailability,
  fileFor,
  getProjectVersions,
  type PluginSource,
  type PluginVersion,
  preferredVersion,
} from '../lib/catalog.ts';
import { newestFirst } from '../lib/format.ts';
import { InstallError, installPluginVersion } from '../lib/install.ts';
import { isPluginLoader, loaderLabel, PLUGIN_LOADER_IDS, type PluginLoader, runsOn } from '../lib/loaders.ts';
import {
  pluginQueryKeys,
  useDetection,
  useInstalledPlugins,
  useProjectVersions,
  useRefreshInstalledPlugins,
} from '../lib/queries.ts';
import { useExtTranslations } from '../translations.ts';
import DependencyList, { useDependencies } from './DependencyList.tsx';
import ManualDownloadPanel from './ManualDownloadPanel.tsx';
import PluginIcon from './PluginIcon.tsx';
import ProviderMark from './ProviderMark.tsx';
import { useErrorMessage } from './useErrorMessage.ts';
import { useLoaderOptions } from './useLoaderOptions.ts';

export interface InstallTarget {
  source: PluginSource;
  id: string;
  slug: string;
  title: string;
  iconUrl: string | null;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  project: InstallTarget;
  /** The copy of this plugin already on the server; installing replaces it. */
  installed: InstalledPlugin | null;
  /** Version to preselect, e.g. when installing from a row of the Versions table or updating. */
  initialVersionId?: string | null;
}

function InstallForm({ onClose, project, installed, initialVersionId }: Omit<Props, 'opened'>) {
  const { t: tExt, tReact } = useExtTranslations();
  const uuid = useServerStore((state) => state.server.uuid);
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const errorMessage = useErrorMessage();
  const refreshInstalled = useRefreshInstalledPlugins();
  const canCreate = useServerCan('files.create');
  const canUpdate = useServerCan('files.update');
  const canDelete = useServerCan('files.delete');
  const detection = useDetection();
  const { byProject } = useInstalledPlugins();
  const versionsQuery = useProjectVersions(project.source, project.id);

  const versions = versionsQuery.data ?? [];
  const detectedLoader = detection.data?.loader ?? null;
  const loaderOptions = useLoaderOptions(detectedLoader);
  const detectedVersion = detection.data?.versionApplicable ? (detection.data.minecraftVersion?.value ?? null) : null;
  const initialVersion = versions.find((version) => version.id === initialVersionId) ?? null;

  // `undefined` means "not touched yet": the value then follows the detected server defaults.
  const [loaderChoice, setLoaderChoice] = useState<PluginLoader>();
  const [gameVersionChoice, setGameVersionChoice] = useState<string | null>();
  const [versionChoice, setVersionChoice] = useState<string | null>(initialVersionId ?? null);
  const [preReleasesChoice, setPreReleasesChoice] = useState<boolean>();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState(false);
  // The last install's failure, shown in the modal until the next attempt.
  const [failure, setFailure] = useState<{ message: string; installedAnyway: boolean } | null>(null);

  const supportedLoaders = useMemo(
    () => PLUGIN_LOADER_IDS.filter((loader) => versions.some((version) => runsOn(version.loaders, loader))),
    [versions],
  );

  // A detected platform is binding: builds for other platforms are blocked (the server software panel can override it).
  const loader: PluginLoader | null =
    detectedLoader ??
    loaderChoice ??
    (initialVersion ? (initialVersion.loaders.find(isPluginLoader) ?? null) : (supportedLoaders[0] ?? null));

  const gameVersionsForLoader = useMemo(
    () => newestFirst(compatibleVersions(versions, loader, null).flatMap((version) => version.gameVersions)),
    [versions, loader],
  );

  const defaultGameVersion = initialVersion
    ? detectedVersion && initialVersion.gameVersions.includes(detectedVersion)
      ? detectedVersion
      : null
    : detectedVersion;
  const gameVersion = gameVersionChoice === undefined ? defaultGameVersion : gameVersionChoice;
  const preReleases = preReleasesChoice ?? (!!initialVersion && initialVersion.channel !== 'release');

  const candidates = compatibleVersions(versions, loader, gameVersion).filter(
    (version) => preReleases || version.channel === 'release' || version.id === initialVersionId,
  );
  const selected = candidates.find((version) => version.id === versionChoice) ?? preferredVersion(candidates, loader);
  const selectedFile = selected ? fileFor(selected, loader) : null;
  const availability = selected ? fileAvailability(selected.source, selectedFile) : 'none';
  const alreadyInstalled = !!selected && installed?.version?.id === selected.id;
  const replacingSameName =
    !!installed && !!selectedFile && installed.jarName.toLowerCase() === selectedFile.filename.toLowerCase();
  const dependencyRows = useDependencies(project.source, selected, loader, byProject);

  if (versionsQuery.isPending || detection.isPending) {
    return (
      <Center py='xl'>
        <Spinner />
      </Center>
    );
  }

  if (versionsQuery.isError) {
    return <Alert color='red'>{errorMessage(versionsQuery.error)}</Alert>;
  }

  /** Installs the checked dependencies one by one; stops at core's pull limit. */
  const installDependencies = async () => {
    const failed: string[] = [];
    const wanted = dependencyRows.filter(
      (row) => row.kind === 'required' && !row.installed && row.projectId && !skipped.has(row.projectId),
    );
    for (const dependency of wanted) {
      const projectId = dependency.projectId!;
      try {
        const depVersions = await queryClient.fetchQuery({
          queryKey: pluginQueryKeys.versions(project.source, projectId),
          queryFn: () => getProjectVersions(project.source, uuid, projectId),
        });
        const version = preferredVersion(
          compatibleVersions(depVersions, loader, gameVersion).filter((candidate) => candidate.channel === 'release'),
          loader,
        );
        if (!version) throw new InstallError('noFile');
        await installPluginVersion(uuid, version, loader, null);
      } catch (error) {
        failed.push(`${dependency.name}: ${errorMessage(error)}`);
        if (error instanceof InstallError && error.kind === 'rateLimited') break;
      }
    }
    return failed;
  };

  const finishDependencies = async () => {
    const failed = await installDependencies();
    if (failed.length > 0) {
      addToast(tExt('pages.server.plugins.install.toast.dependenciesFailed', { list: failed.join('; ') }), 'error');
    }
  };

  const install = async (version: PluginVersion) => {
    setInstalling(true);
    setFailure(null);
    try {
      await installPluginVersion(uuid, version, loader, installed);
      addToast(
        installed
          ? tExt('pages.server.plugins.install.toast.switched', {
              plugin: project.title,
              version: version.versionNumber,
            })
          : tExt('pages.server.plugins.install.toast.installed', {
              plugin: project.title,
              version: version.versionNumber,
            }),
        'success',
      );
      await finishDependencies();
      onClose();
    } catch (error) {
      const message = errorMessage(error);
      // The new jar is in place but the old one (or its backup) is left over: dependencies still go in, and the modal
      // stays open naming the file, since two copies of a plugin stop it from loading.
      const installedAnyway =
        error instanceof InstallError && (error.kind === 'oldNotRemoved' || error.kind === 'backupLeft');
      if (installedAnyway) await finishDependencies();
      setFailure({ message, installedAnyway });
      addToast(message, 'error');
    } finally {
      setInstalling(false);
      refreshInstalled();
    }
  };

  const wrongPlatform = !!selected && !!detectedLoader && !runsOn(selected.loaders, detectedLoader);

  const blockedReason = !canCreate
    ? tExt('pages.server.plugins.install.blocked.noCreate', {})
    : installed && !canDelete
      ? tExt('pages.server.plugins.install.blocked.noDelete', {})
      : replacingSameName && !canUpdate
        ? tExt('pages.server.plugins.install.blocked.noUpdate', {})
        : alreadyInstalled
          ? tExt('pages.server.plugins.install.blocked.alreadyInstalled', {})
          : wrongPlatform
            ? tExt('pages.server.plugins.install.blocked.wrongPlatform', {
                platforms: selected.loaders.map(loaderLabel).join(', '),
                server: loaderLabel(detectedLoader),
              })
            : availability === 'none'
              ? tExt('pages.server.plugins.install.blocked.noFile', {})
              : availability === 'external'
                ? tExt('pages.server.plugins.install.blocked.external', {})
                : null;

  const warnings = [
    selected && gameVersion === null && detectedVersion && !selected.gameVersions.includes(detectedVersion)
      ? tExt('pages.server.plugins.install.warning.gameVersion', { version: detectedVersion })
      : null,
    !detectedLoader ? tExt('pages.server.plugins.install.warning.notDetected', {}) : null,
  ].filter((warning) => warning !== null);

  const versionLabel = (version: PluginVersion) => {
    const kind = fileAvailability(version.source, fileFor(version, loader));
    const channel = tExt(`pages.server.plugins.channel.${version.channel}`, {});
    return kind === 'manual' || kind === 'external'
      ? `${version.name} (${channel}, ${tExt(`pages.server.plugins.availability.${kind}`, {})})`
      : `${version.name} (${channel})`;
  };

  return (
    <Stack gap='md'>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          withAsterisk
          label={tExt('pages.server.plugins.install.loader', {})}
          description={detectedLoader ? tExt('pages.server.plugins.install.loaderDetected', {}) : undefined}
          disabled={!!detectedLoader}
          data={loaderOptions.map((option) => ({
            ...option,
            disabled: !supportedLoaders.includes(option.value) && option.value !== detectedLoader,
          }))}
          value={loader}
          onChange={(value) => {
            if (value && isPluginLoader(value)) setLoaderChoice(value);
            setVersionChoice(null);
          }}
        />
        {detection.data?.versionApplicable !== false && (
          <Select
            clearable
            searchable
            label={tExt('pages.server.plugins.install.gameVersion', {})}
            placeholder={tExt('pages.server.plugins.common.anyVersion', {})}
            data={[
              ...(detectedVersion && !gameVersionsForLoader.includes(detectedVersion)
                ? [
                    {
                      value: detectedVersion,
                      label: tExt('pages.server.plugins.common.detectedUnsupportedOption', { value: detectedVersion }),
                    },
                  ]
                : []),
              ...gameVersionsForLoader.map((value) => ({
                value,
                label:
                  value === detectedVersion ? tExt('pages.server.plugins.common.detectedOption', { value }) : value,
              })),
            ]}
            value={gameVersion}
            onChange={(value) => {
              setGameVersionChoice(value);
              setVersionChoice(null);
            }}
          />
        )}
      </SimpleGrid>

      <Stack gap={6}>
        <Select
          withAsterisk
          searchable
          label={tExt('pages.server.plugins.install.version', {})}
          data={candidates.map((version) => ({
            value: version.id,
            label: versionLabel(version),
            disabled: fileAvailability(version.source, fileFor(version, loader)) === 'none',
          }))}
          value={selected?.id ?? null}
          onChange={setVersionChoice}
          disabled={candidates.length === 0}
          error={candidates.length === 0 ? tExt('pages.server.plugins.install.noVersions', {}) : undefined}
        />
        <Switch
          size='xs'
          label={tExt('pages.server.plugins.install.preReleases', {})}
          checked={preReleases}
          onChange={(event) => {
            setPreReleasesChoice(event.currentTarget.checked);
            setVersionChoice(null);
          }}
        />
      </Stack>

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

      {selected && availability === 'manual' && !blockedReason && (
        <ManualDownloadPanel
          project={project}
          version={selected}
          loader={loader}
          installed={installed}
          onInstalled={() => {
            refreshInstalled();
            onClose();
          }}
        />
      )}

      {selected && (
        <DependencyList
          rows={dependencyRows}
          skipped={skipped}
          onToggle={(projectId, wantsInstall) =>
            setSkipped((current) => {
              const next = new Set(current);
              if (wantsInstall) next.delete(projectId);
              else next.add(projectId);
              return next;
            })
          }
        />
      )}

      {selectedFile && availability === 'download' && (
        <Text size='xs' c='dimmed'>
          {tReact('pages.server.plugins.install.fileHint', {
            file: <code>{selectedFile.filename}</code>,
            size: bytesToString(selectedFile.size),
          })}{' '}
          {installed && !alreadyInstalled
            ? tReact(
                installed.enabled
                  ? 'pages.server.plugins.install.replaces'
                  : 'pages.server.plugins.install.replacesDisabled',
                { file: <code>{installed.fileName}</code> },
              )
            : null}{' '}
          {tExt('pages.server.plugins.install.restartHint', {})}
        </Text>
      )}

      {blockedReason && !failure?.installedAnyway && (
        <Text size='sm' c='red'>
          {blockedReason}
        </Text>
      )}

      {failure && (
        <Alert
          color={failure.installedAnyway ? 'yellow' : 'red'}
          icon={<FontAwesomeIcon icon={faTriangleExclamation} />}
          title={
            failure.installedAnyway
              ? tExt('pages.server.plugins.install.failure.partialTitle', {})
              : tExt('pages.server.plugins.install.failure.title', {})
          }
        >
          <Text size='sm'>{failure.message}</Text>
        </Alert>
      )}

      <ModalFooter>
        {availability !== 'manual' && !failure?.installedAnyway && (
          <ConditionalTooltip enabled={!!blockedReason} label={blockedReason ?? ''}>
            <Button
              color='blue'
              leftSection={<FontAwesomeIcon icon={installed ? faCodeBranch : faDownload} />}
              loading={installing}
              disabled={!selected || availability !== 'download' || !!blockedReason}
              onClick={() => selected && install(selected)}
            >
              {installed
                ? tExt('pages.server.plugins.actions.switchVersion', {})
                : tExt('pages.server.plugins.actions.install', {})}
            </Button>
          </ConditionalTooltip>
        )}
        <Button variant='default' onClick={onClose}>
          {failure?.installedAnyway
            ? tExt('pages.server.plugins.actions.close', {})
            : tExt('pages.server.plugins.actions.cancel', {})}
        </Button>
      </ModalFooter>
    </Stack>
  );
}

/** Picks a loader, Minecraft version and plugin version (defaulting to the detected server) and installs it. */
export default function InstallPluginModal({ opened, onClose, installed, ...rest }: Props) {
  const { t: tExt } = useExtTranslations();
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
            <Text fw={600}>
              {openedFor
                ? tExt('pages.server.plugins.install.switchTitle', { plugin: rest.project.title })
                : tExt('pages.server.plugins.install.title', { plugin: rest.project.title })}
            </Text>
            <Text size='xs' c='dimmed' component='div'>
              {openedFor ? (
                openedFor.enabled ? (
                  tExt('pages.server.plugins.install.current', {
                    version: openedFor.version?.versionNumber ?? openedFor.fileName,
                  })
                ) : (
                  tExt('pages.server.plugins.install.currentDisabled', {
                    version: openedFor.version?.versionNumber ?? openedFor.fileName,
                  })
                )
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
