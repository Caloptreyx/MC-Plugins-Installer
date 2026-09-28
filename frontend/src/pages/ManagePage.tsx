import {
  faArrowsRotate,
  faBoxOpen,
  faCircleInfo,
  faCodeBranch,
  faCompass,
  faMagnifyingGlass,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { httpErrorToHuman } from '@/api/axios.ts';
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
import { deletePlugin, type InstalledPlugin, pluginDisplayName, setPluginEnabled } from '../lib/plugins.ts';
import { useCurseforgeEnabled, useInstalledPlugins, useRefreshInstalledPlugins } from '../lib/queries.ts';
import { pluginDetailsUrl, pluginsUrl } from '../lib/routes.ts';

const PER_PAGE = 25;

type StatusFilter = 'all' | 'enabled' | 'disabled';

export default function ManagePage() {
  const server = useServerStore((state) => state.server);
  const navigate = useNavigate();
  const { addToast } = useToast();
  const installed = useInstalledPlugins();
  const curseforge = useCurseforgeEnabled();
  const unknownSourceHint = curseforge.enabled
    ? 'This jar was not found on Modrinth or CurseForge, so it cannot switch versions.'
    : 'This jar was not found on Modrinth, so it cannot switch versions.';
  const refresh = useRefreshInstalledPlugins();
  const canRename = useServerCan('files.update');
  const canDelete = useServerCan('files.delete');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [toggling, setToggling] = useState<string | null>(null);
  // Targets outlive their modal's open flag so the content stays intact during the close animation.
  const [switchTarget, setSwitchTarget] = useState<InstalledPlugin | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InstalledPlugin | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changed, setChanged] = useState(false);

  const plugins = installed.data ?? [];
  const enabledCount = plugins.filter((plugin) => plugin.enabled).length;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return plugins.filter(
      (plugin) =>
        (status === 'all' || plugin.enabled === (status === 'enabled')) &&
        (!needle ||
          pluginDisplayName(plugin).toLowerCase().includes(needle) ||
          plugin.fileName.toLowerCase().includes(needle)),
    );
  }, [plugins, search, status]);

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
      await setPluginEnabled(server.uuid, plugin, enabled);
      addToast(`${pluginDisplayName(plugin)} ${enabled ? 'enabled' : 'disabled'}.`, 'success');
      setChanged(true);
      await refresh();
    } catch (error) {
      addToast(httpErrorToHuman(error), 'error');
    } finally {
      setToggling(null);
    }
  };

  const remove = async (plugin: InstalledPlugin) => {
    await deletePlugin(server.uuid, plugin);
    addToast(`${pluginDisplayName(plugin)} deleted.`, 'success');
    setDeleteOpen(false);
    setChanged(true);
    await refresh();
  };

  if (installed.isSuccess && plugins.length === 0) {
    return (
      <PluginsLayout tab='installed'>
        <EmptyState
          icon={faBoxOpen}
          title='No plugins installed'
          description='The plugins folder of this server has no plugin jars yet.'
        >
          <Button
            leftSection={<FontAwesomeIcon icon={faCompass} />}
            onClick={() => navigate(pluginsUrl(server.uuidShort))}
          >
            Browse plugins
          </Button>
        </EmptyState>
      </PluginsLayout>
    );
  }

  return (
    <PluginsLayout tab='installed'>
      {changed && (
        <Alert color='blue' variant='light' mb='md' icon={<FontAwesomeIcon icon={faCircleInfo} />}>
          <Text size='sm'>Restart the server to apply plugin changes.</Text>
        </Alert>
      )}

      <Group justify='space-between' mb='md'>
        <Group gap='sm'>
          <TextInput
            placeholder='Search installed plugins…'
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
              { value: 'all', label: 'All' },
              { value: 'enabled', label: 'Enabled' },
              { value: 'disabled', label: 'Disabled' },
            ]}
          />
        </Group>
        <Group gap='sm'>
          {installed.data && (
            <Text size='sm' c='dimmed'>
              {plugins.length} installed · {enabledCount} enabled · {plugins.length - enabledCount} disabled
            </Text>
          )}
          <Button
            variant='default'
            leftSection={<FontAwesomeIcon icon={faArrowsRotate} spin={installed.isFetching} />}
            onClick={() => refresh()}
          >
            Refresh
          </Button>
          <Button
            leftSection={<FontAwesomeIcon icon={faCompass} />}
            onClick={() => navigate(pluginsUrl(server.uuidShort))}
          >
            Browse plugins
          </Button>
        </Group>
      </Group>

      <Table
        columns={['Plugin', 'Version', 'Source', 'Size', 'Enabled', '']}
        loading={installed.isPending}
        error={installed.isError ? installed.error.message : null}
        pagination={pagination}
        onPageSelect={setPage}
      >
        {pagination.data.map((plugin) => (
          <TableRow key={plugin.fileName}>
            <TableData>
              <Group gap='sm' wrap='nowrap'>
                <PluginIcon url={plugin.project?.iconUrl} name={pluginDisplayName(plugin)} size={36} />
                <div>
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
                  <Text size='xs' c='dimmed'>
                    {plugin.fileName}
                  </Text>
                </div>
              </Group>
            </TableData>
            <TableData>
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
            </TableData>
            <TableData>
              {plugin.project ? (
                <Text size='sm' component='div'>
                  <ProviderMark source={plugin.project.source} />
                </Text>
              ) : (
                <Tooltip label={unknownSourceHint}>
                  <Badge size='sm' variant='light' color='gray'>
                    Unknown
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
                aria-label={plugin.enabled ? 'Disable plugin' : 'Enable plugin'}
              />
            </TableData>
            <TableData>
              <Group gap='xs' justify='flex-end' wrap='nowrap'>
                <Tooltip label={plugin.project ? 'Switch version' : unknownSourceHint}>
                  <ActionIcon
                    variant='subtle'
                    disabled={!plugin.project}
                    onClick={() => {
                      setSwitchTarget(plugin);
                      setSwitchOpen(true);
                    }}
                    aria-label='Switch version'
                  >
                    <FontAwesomeIcon icon={faCodeBranch} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label='Delete'>
                  <ActionIcon
                    variant='subtle'
                    color='red'
                    disabled={!canDelete}
                    onClick={() => {
                      setDeleteTarget(plugin);
                      setDeleteOpen(true);
                    }}
                    aria-label='Delete'
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </TableData>
          </TableRow>
        ))}
      </Table>

      <InstallPluginModal
        opened={switchOpen}
        onClose={() => setSwitchOpen(false)}
        project={{
          source: switchTarget?.project?.source ?? 'modrinth',
          id: switchTarget?.project?.id ?? '',
          title: switchTarget ? pluginDisplayName(switchTarget) : '',
          iconUrl: switchTarget?.project?.iconUrl ?? null,
        }}
        installed={switchTarget}
      />

      <ConfirmationModal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title='Delete plugin'
        confirm='Delete'
        onConfirmed={() => remove(deleteTarget!)}
      >
        <Text>
          Delete <b>{deleteTarget?.fileName}</b> from the plugins folder? Its configuration folder is kept.
        </Text>
      </ConfirmationModal>
    </PluginsLayout>
  );
}
