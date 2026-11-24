import {
  faArrowsRotate,
  faArrowUp,
  faBoxOpen,
  faCircleInfo,
  faCodeBranch,
  faCompass,
  faMagnifyingGlass,
  faTrash,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Stack } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import ActionIcon from '@/elements/buttons/ActionIcon.tsx';
import Button from '@/elements/buttons/Button.tsx';
import Badge from '@/elements/data-display/Badge.tsx';
import Table, { TableData, TableRow } from '@/elements/data-display/Table.tsx';
import Alert from '@/elements/feedback/Alert.tsx';
import EmptyState from '@/elements/feedback/EmptyState.tsx';
import Switch from '@/elements/input/Switch.tsx';
import TextInput from '@/elements/input/TextInput.tsx';
import Group from '@/elements/layout/Group.tsx';
import SegmentedControl from '@/elements/layout/SegmentedControl.tsx';
import ConfirmationModal from '@/elements/modals/ConfirmationModal.tsx';
import Tooltip from '@/elements/overlays/Tooltip.tsx';
import Text from '@/elements/typography/Text.tsx';
import { bytesToString } from '@/lib/format/size.ts';
import { useServerCan } from '@/plugins/usePermissions.ts';
import { useToast } from '@/providers/ToastProvider.tsx';
import { useServerStore } from '@/stores/server.ts';
import ChannelBadge from '../components/ChannelBadge.tsx';
import InstallPluginModal from '../components/InstallPluginModal.tsx';
import PluginIcon from '../components/PluginIcon.tsx';
import PluginsLayout from '../components/PluginsLayout.tsx';
import ProviderMark from '../components/ProviderMark.tsx';
import UpdateAllModal from '../components/UpdateAllModal.tsx';
import { useErrorMessage } from '../components/useErrorMessage.ts';
import { fileAvailability, fileFor, type VersionChannel } from '../lib/catalog.ts';
import { loaderLabel, runsOn } from '../lib/loaders.ts';
import {
  deletePlugin,
  duplicateFiles,
  type InstalledPlugin,
  pluginDisplayName,
  setPluginEnabled,
} from '../lib/plugins.ts';
import {
  useCurseforgeEnabled,
  useDetection,
  useInstalledPlugins,
  usePluginUpdates,
  useRefreshInstalledPlugins,
} from '../lib/queries.ts';
import { pluginDetailsUrl, pluginsUrl } from '../lib/routes.ts';
import { useExtTranslations } from '../translations.ts';

const PER_PAGE = 25;

type StatusFilter = 'all' | 'enabled' | 'disabled' | 'updates';

const RELEASES: VersionChannel[] = ['release'];
const ALL_CHANNELS: VersionChannel[] = ['release', 'beta', 'alpha'];

export default function ManagePage() {
  const { t: tExt, tReact } = useExtTranslations();
  const server = useServerStore((state) => state.server);
  const navigate = useNavigate();
  const { addToast } = useToast();
  const errorMessage = useErrorMessage();
  const installed = useInstalledPlugins();
  const detection = useDetection();
  const curseforge = useCurseforgeEnabled();
  const refresh = useRefreshInstalledPlugins();
  const canRename = useServerCan('files.update');
  const canDelete = useServerCan('files.delete');
  const canCreate = useServerCan('files.create');

  const [preReleaseUpdates, setPreReleaseUpdates] = useState(false);
  const updates = usePluginUpdates(preReleaseUpdates ? ALL_CHANNELS : RELEASES);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [toggling, setToggling] = useState<string | null>(null);
  // Targets outlive their modal's open flag so the content stays intact during the close animation.
  const [switchTarget, setSwitchTarget] = useState<{ plugin: InstalledPlugin; versionId: string | null } | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InstalledPlugin | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [updateAllOpen, setUpdateAllOpen] = useState(false);
  const [changed, setChanged] = useState(false);

  const plugins = installed.plugins ?? [];
  const enabledCount = plugins.filter((plugin) => plugin.enabled).length;
  const detectedLoader = detection.data?.loader ?? null;
  const duplicates = useMemo(() => duplicateFiles(plugins), [plugins]);
  const updateMap = updates.data;
  const pendingUpdates = plugins.flatMap((plugin) => {
    const version = updateMap?.get(plugin.fileName);
    return version ? [{ plugin, version }] : [];
  });

  const unknownSourceHint = curseforge.enabled
    ? tExt('pages.server.plugins.installed.unknownHintCurseforge', {})
    : tExt('pages.server.plugins.installed.unknownHint', {});

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return plugins.filter(
      (plugin) =>
        (status === 'all' ||
          (status === 'updates' ? !!updateMap?.has(plugin.fileName) : plugin.enabled === (status === 'enabled'))) &&
        (!needle ||
          pluginDisplayName(plugin).toLowerCase().includes(needle) ||
          plugin.fileName.toLowerCase().includes(needle)),
    );
  }, [plugins, search, status, updateMap]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pagination: Pagination<InstalledPlugin> = {
    total: filtered.length,
    perPage: PER_PAGE,
    page: currentPage,
    data: filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE),
  };

  const toggle = async (plugin: InstalledPlugin, enabled: boolean) => {
    setToggling(plugin.fileName);
    try {
      await setPluginEnabled(
        server.uuid,
        plugin,
        enabled,
        plugins.map((entry) => entry.fileName),
      );
      addToast(
        enabled
          ? tExt('pages.server.plugins.installed.toast.enabled', { plugin: pluginDisplayName(plugin) })
          : tExt('pages.server.plugins.installed.toast.disabled', { plugin: pluginDisplayName(plugin) }),
        'success',
      );
      setChanged(true);
    } catch (error) {
      addToast(errorMessage(error), 'error');
    } finally {
      setToggling(null);
      await refresh();
    }
  };

  const remove = async (plugin: InstalledPlugin) => {
    try {
      await deletePlugin(server.uuid, plugin);
      addToast(tExt('pages.server.plugins.installed.toast.deleted', { plugin: pluginDisplayName(plugin) }), 'success');
      setDeleteOpen(false);
      setChanged(true);
    } catch (error) {
      addToast(errorMessage(error), 'error');
    } finally {
      await refresh();
    }
  };

  const openSwitch = (plugin: InstalledPlugin, versionId: string | null) => {
    setSwitchTarget({ plugin, versionId });
    setSwitchOpen(true);
  };

  const wrongPlatform = (plugin: InstalledPlugin) =>
    !!plugin.version && !!detectedLoader && !runsOn(plugin.version.loaders, detectedLoader);

  if (installed.isSuccess && plugins.length === 0 && installed.data.leftovers.length === 0) {
    return (
      <PluginsLayout tab='installed'>
        <EmptyState
          icon={faBoxOpen}
          title={tExt('pages.server.plugins.installed.empty.title', {})}
          description={tExt('pages.server.plugins.installed.empty.description', {})}
        >
          <Button
            leftSection={<FontAwesomeIcon icon={faCompass} />}
            onClick={() => navigate(pluginsUrl(server.uuidShort))}
          >
            {tExt('pages.server.plugins.actions.browse', {})}
          </Button>
        </EmptyState>
      </PluginsLayout>
    );
  }

  return (
    <PluginsLayout tab='installed'>
      <Stack gap='md' mb='md'>
        {changed && (
          <Alert color='blue' variant='light' icon={<FontAwesomeIcon icon={faCircleInfo} />}>
            <Text size='sm'>{tExt('pages.server.plugins.installed.restartHint', {})}</Text>
          </Alert>
        )}
        {installed.data && !installed.data.hashed && (
          <Alert color='gray' variant='light' icon={<FontAwesomeIcon icon={faCircleInfo} />}>
            <Text size='sm'>{tExt('pages.server.plugins.installed.noReadContent', {})}</Text>
          </Alert>
        )}
        {installed.data && installed.data.leftovers.length > 0 && (
          <Alert
            color='yellow'
            variant='light'
            icon={<FontAwesomeIcon icon={faTriangleExclamation} />}
            title={tExt('pages.server.plugins.installed.leftovers.title', {})}
          >
            <Text size='sm'>
              {tExt('pages.server.plugins.installed.leftovers.description', {
                list: installed.data.leftovers.join(', '),
              })}
            </Text>
          </Alert>
        )}
        {updates.isError && (
          <Alert color='yellow' variant='light'>
            {tExt('pages.server.plugins.installed.updateCheckFailed', { error: errorMessage(updates.error) })}
          </Alert>
        )}
      </Stack>

      <Group justify='space-between' mb='md' wrap='wrap'>
        <Group gap='sm' wrap='wrap'>
          <TextInput
            placeholder={tExt('pages.server.plugins.installed.searchPlaceholder', {})}
            leftSection={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setPage(1);
            }}
            w={260}
          />
          <SegmentedControl
            value={status}
            onChange={(value) => {
              setStatus(value as StatusFilter);
              setPage(1);
            }}
            data={[
              { value: 'all', label: tExt('pages.server.plugins.installed.filter.all', {}) },
              { value: 'enabled', label: tExt('pages.server.plugins.installed.filter.enabled', {}) },
              { value: 'disabled', label: tExt('pages.server.plugins.installed.filter.disabled', {}) },
              {
                value: 'updates',
                label: tExt('pages.server.plugins.installed.filter.updates', { count: pendingUpdates.length }),
              },
            ]}
          />
          <Switch
            label={tExt('pages.server.plugins.installed.preReleaseUpdates', {})}
            checked={preReleaseUpdates}
            onChange={(event) => setPreReleaseUpdates(event.currentTarget.checked)}
          />
        </Group>
        <Group gap='sm' wrap='wrap'>
          {installed.data && (
            <Text size='sm' c='dimmed'>
              {tExt('pages.server.plugins.installed.counts', {
                total: plugins.length,
                enabled: enabledCount,
                disabled: plugins.length - enabledCount,
              })}
            </Text>
          )}
          {pendingUpdates.length > 0 && detectedLoader && (
            <Button
              variant='light'
              leftSection={<FontAwesomeIcon icon={faArrowUp} />}
              disabled={!canCreate || !canDelete}
              onClick={() => setUpdateAllOpen(true)}
            >
              {tExt('pages.server.plugins.installed.updateAll', { count: pendingUpdates.length })}
            </Button>
          )}
          <Button
            variant='default'
            leftSection={<FontAwesomeIcon icon={faArrowsRotate} spin={installed.isFetching || updates.isFetching} />}
            onClick={() => refresh()}
          >
            {tExt('pages.server.plugins.actions.refresh', {})}
          </Button>
          <Button
            leftSection={<FontAwesomeIcon icon={faCompass} />}
            onClick={() => navigate(pluginsUrl(server.uuidShort))}
          >
            {tExt('pages.server.plugins.actions.browse', {})}
          </Button>
        </Group>
      </Group>

      <Table
        columns={[
          tExt('pages.server.plugins.installed.columns.plugin', {}),
          tExt('pages.server.plugins.installed.columns.version', {}),
          tExt('pages.server.plugins.installed.columns.source', {}),
          tExt('pages.server.plugins.installed.columns.size', {}),
          tExt('pages.server.plugins.installed.columns.enabled', {}),
          '',
        ]}
        loading={installed.isPending}
        error={installed.isError ? errorMessage(installed.error) : null}
        pagination={pagination}
        onPageSelect={setPage}
      >
        {pagination.data.map((plugin) => {
          const update = updateMap?.get(plugin.fileName) ?? null;
          const updateAvailability = update ? fileAvailability(update.source, fileFor(update, detectedLoader)) : null;

          return (
            <TableRow key={plugin.fileName}>
              <TableData>
                <Group gap='sm' wrap='nowrap'>
                  <PluginIcon url={plugin.project?.iconUrl} name={pluginDisplayName(plugin)} size={36} />
                  <div style={{ minWidth: 0 }}>
                    <Group gap={6} wrap='wrap'>
                      {plugin.project ? (
                        <Text
                          fw={500}
                          className='mcpi-link'
                          onClick={() =>
                            navigate(pluginDetailsUrl(server.uuidShort, plugin.project!.source, plugin.project!.id))
                          }
                        >
                          {pluginDisplayName(plugin)}
                        </Text>
                      ) : (
                        <Text fw={500}>{pluginDisplayName(plugin)}</Text>
                      )}
                      {wrongPlatform(plugin) && (
                        <Tooltip
                          label={tExt('pages.server.plugins.installed.wrongPlatformHint', {
                            platforms: plugin.version!.loaders.map(loaderLabel).join(', '),
                            server: detectedLoader ? loaderLabel(detectedLoader) : '',
                          })}
                        >
                          <Badge size='xs' color='red' variant='light'>
                            {tExt('pages.server.plugins.installed.wrongPlatform', {})}
                          </Badge>
                        </Tooltip>
                      )}
                      {duplicates.has(plugin.fileName) && (
                        <Tooltip label={tExt('pages.server.plugins.installed.duplicateHint', {})}>
                          <Badge size='xs' color='red' variant='light'>
                            {tExt('pages.server.plugins.installed.duplicate', {})}
                          </Badge>
                        </Tooltip>
                      )}
                    </Group>
                    <Text size='xs' c='dimmed'>
                      {plugin.fileName}
                    </Text>
                  </div>
                </Group>
              </TableData>
              <TableData>
                <Stack gap={4}>
                  {plugin.version ? (
                    <Group gap='xs' wrap='nowrap'>
                      <Text size='sm' ff='monospace'>
                        {plugin.version.versionNumber}
                      </Text>
                      {plugin.version.channel !== 'release' && <ChannelBadge channel={plugin.version.channel} />}
                    </Group>
                  ) : (
                    <Text size='sm' c='dimmed'>
                      —
                    </Text>
                  )}
                  {update && (
                    <Group gap={6} wrap='nowrap'>
                      <Button
                        size='compact-xs'
                        variant='light'
                        color='green'
                        leftSection={<FontAwesomeIcon icon={faArrowUp} />}
                        disabled={!canCreate || !canDelete}
                        onClick={() => openSwitch(plugin, update.id)}
                      >
                        {tExt('pages.server.plugins.installed.updateTo', { version: update.versionNumber })}
                      </Button>
                      {(updateAvailability === 'manual' || updateAvailability === 'external') && (
                        <Badge size='xs' color='orange' variant='light'>
                          {tExt(`pages.server.plugins.availability.${updateAvailability}`, {})}
                        </Badge>
                      )}
                    </Group>
                  )}
                </Stack>
              </TableData>
              <TableData>
                {plugin.project ? (
                  <Text size='sm' component='div'>
                    <ProviderMark source={plugin.project.source} />
                  </Text>
                ) : (
                  <Tooltip label={unknownSourceHint}>
                    <Badge size='sm' variant='light' color='gray'>
                      {tExt('pages.server.plugins.installed.unknown', {})}
                    </Badge>
                  </Tooltip>
                )}
              </TableData>
              <TableData>
                <Text size='sm'>{bytesToString(plugin.size)}</Text>
              </TableData>
              <TableData>
                <Switch
                  checked={plugin.enabled}
                  disabled={!canRename || toggling !== null}
                  onChange={(event) => toggle(plugin, event.currentTarget.checked)}
                  aria-label={
                    plugin.enabled
                      ? tExt('pages.server.plugins.actions.disable', {})
                      : tExt('pages.server.plugins.actions.enable', {})
                  }
                />
              </TableData>
              <TableData>
                <Group gap='xs' justify='flex-end' wrap='nowrap'>
                  <Tooltip
                    label={plugin.project ? tExt('pages.server.plugins.actions.switchVersion', {}) : unknownSourceHint}
                  >
                    <ActionIcon
                      variant='subtle'
                      disabled={!plugin.project || !canCreate}
                      onClick={() => openSwitch(plugin, null)}
                      aria-label={tExt('pages.server.plugins.actions.switchVersion', {})}
                    >
                      <FontAwesomeIcon icon={faCodeBranch} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={tExt('pages.server.plugins.actions.delete', {})}>
                    <ActionIcon
                      variant='subtle'
                      color='red'
                      disabled={!canDelete}
                      onClick={() => {
                        setDeleteTarget(plugin);
                        setDeleteOpen(true);
                      }}
                      aria-label={tExt('pages.server.plugins.actions.delete', {})}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </TableData>
            </TableRow>
          );
        })}
      </Table>

      <InstallPluginModal
        opened={switchOpen}
        onClose={() => setSwitchOpen(false)}
        project={{
          source: switchTarget?.plugin.project?.source ?? 'modrinth',
          id: switchTarget?.plugin.project?.id ?? '',
          slug: switchTarget?.plugin.project?.slug ?? '',
          title: switchTarget ? pluginDisplayName(switchTarget.plugin) : '',
          iconUrl: switchTarget?.plugin.project?.iconUrl ?? null,
        }}
        installed={switchTarget?.plugin ?? null}
        initialVersionId={switchTarget?.versionId ?? null}
      />

      {detectedLoader && (
        <UpdateAllModal
          key={updateAllOpen ? 'open' : 'closed'}
          opened={updateAllOpen}
          onClose={() => setUpdateAllOpen(false)}
          updates={pendingUpdates}
          loader={detectedLoader}
          onDone={() => {
            setChanged(true);
            refresh();
          }}
        />
      )}

      <ConfirmationModal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={tExt('pages.server.plugins.installed.deleteModal.title', {})}
        confirm={tExt('pages.server.plugins.actions.delete', {})}
        onConfirmed={() => (deleteTarget ? remove(deleteTarget) : undefined)}
      >
        <Text>
          {tReact('pages.server.plugins.installed.deleteModal.content', {
            file: <b>{deleteTarget?.fileName}</b>,
          })}
        </Text>
      </ConfirmationModal>
    </PluginsLayout>
  );
}
