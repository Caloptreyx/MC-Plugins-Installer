import { faCodeBranch, faDownload, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Group, Stack } from '@mantine/core';
import { useMemo, useState } from 'react';
import Button from '@/elements/buttons/Button.tsx';
import { ServerCan } from '@/elements/Can.tsx';
import Badge from '@/elements/data-display/Badge.tsx';
import Table, { TableData, TableRow } from '@/elements/data-display/Table.tsx';
import EmptyState from '@/elements/feedback/EmptyState.tsx';
import Select from '@/elements/input/Select.tsx';
import Switch from '@/elements/input/Switch.tsx';
import TextInput from '@/elements/input/TextInput.tsx';
import SegmentedControl from '@/elements/layout/SegmentedControl.tsx';
import ConditionalTooltip from '@/elements/overlays/ConditionalTooltip.tsx';
import Tooltip from '@/elements/overlays/Tooltip.tsx';
import FormattedTimestamp from '@/elements/time/FormattedTimestamp.tsx';
import Text from '@/elements/typography/Text.tsx';
import { bytesToString } from '@/lib/format/size.ts';
import ChannelBadge, { CHANNEL_LABELS } from '../../components/ChannelBadge.tsx';
import LoaderBadge from '../../components/LoaderBadge.tsx';
import type { PluginVersion, VersionChannel } from '../../lib/catalog.ts';
import { formatCount, newestFirst } from '../../lib/format.ts';
import { isPluginLoader, loaderSelectData, type PluginLoader, runsOn } from '../../lib/loaders.ts';
import type { InstalledPlugin } from '../../lib/plugins.ts';
import { useDetection } from '../../lib/queries.ts';

const PER_PAGE = 15;
const SHOWN_GAME_VERSIONS = 3;
const ALL = 'all';

interface Props {
  versions: PluginVersion[];
  loading: boolean;
  error: string | null;
  installed: InstalledPlugin | null;
  onInstall: (versionId: string) => void;
}

export default function VersionsTab({ versions, loading, error, installed, onInstall }: Props) {
  const { data: detection } = useDetection();

  const detectedLoader = detection?.loader ?? null;
  const detectedVersion = detection?.minecraftVersion ?? null;
  const canMatch = !!detectedLoader || !!detectedVersion;

  const [search, setSearch] = useState('');
  const [loaderFilter, setLoaderFilter] = useState<PluginLoader | null>(null);
  const [gameVersionFilter, setGameVersionFilter] = useState<string | null>(null);
  const [channel, setChannel] = useState<VersionChannel | null>(null);
  // Showing only builds for the detected server is the default.
  const [compatibleChoice, setCompatibleChoice] = useState(true);
  const [page, setPage] = useState(1);

  const compatible = canMatch && compatibleChoice;
  const loader = compatible ? detectedLoader : loaderFilter;
  const gameVersion = compatible ? detectedVersion : gameVersionFilter;

  const gameVersionOptions = useMemo(
    () => newestFirst(versions.flatMap((version) => version.gameVersions)),
    [versions],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return versions.filter(
      (version) =>
        (!needle ||
          version.name.toLowerCase().includes(needle) ||
          version.versionNumber.toLowerCase().includes(needle)) &&
        (!loader || runsOn(version.loaders, loader)) &&
        (!gameVersion || version.gameVersions.includes(gameVersion)) &&
        (!channel || version.channel === channel),
    );
  }, [versions, search, loader, gameVersion, channel]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pagination: Pagination<PluginVersion> = {
    total: filtered.length,
    perPage: PER_PAGE,
    page: currentPage,
    data: filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE),
  };

  const changeFilter =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  return (
    <Stack gap='md'>
      <Group gap='sm' wrap='wrap'>
        <TextInput
          style={{ flex: 1, minWidth: 200 }}
          placeholder='Search versions…'
          leftSection={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          value={search}
          onChange={(event) => changeFilter(setSearch)(event.target.value)}
        />
        <Select
          w={170}
          clearable
          placeholder='All loaders'
          value={loader}
          disabled={compatible}
          onChange={changeFilter((value: string | null) =>
            setLoaderFilter(value && isPluginLoader(value) ? value : null),
          )}
          data={loaderSelectData(detectedLoader)}
        />
        <Select
          w={200}
          clearable
          searchable
          placeholder='All game versions'
          value={gameVersion}
          disabled={compatible}
          onChange={changeFilter(setGameVersionFilter)}
          data={
            gameVersion && !gameVersionOptions.includes(gameVersion)
              ? [gameVersion, ...gameVersionOptions]
              : gameVersionOptions
          }
        />
        <SegmentedControl
          value={channel ?? ALL}
          onChange={changeFilter((value: string) => setChannel(value === ALL ? null : (value as VersionChannel)))}
          data={[
            { value: ALL, label: 'All' },
            ...(['release', 'beta', 'alpha'] as const).map((value) => ({ value, label: CHANNEL_LABELS[value] })),
          ]}
        />
        {canMatch && (
          <Switch
            label='Compatible only'
            checked={compatible}
            onChange={(event) => changeFilter(setCompatibleChoice)(event.currentTarget.checked)}
          />
        )}
      </Group>

      <Table
        columns={['Version', 'Type', 'Game versions', 'Loaders', 'Published', 'Downloads', 'Size', '']}
        loading={loading}
        error={error}
        pagination={pagination}
        onPageSelect={setPage}
        empty={<EmptyState flush icon={faCodeBranch} title='No versions match the filters' description='' />}
      >
        {pagination.data.map((version) => {
          const isInstalled = installed?.version?.id === version.id;
          const downloadable = !!version.file?.url;

          return (
            <TableRow key={version.id}>
              <TableData>
                <Stack gap={2}>
                  <Group gap={6} wrap='nowrap'>
                    <Text fw={500} size='sm'>
                      {version.name}
                    </Text>
                    {isInstalled && (
                      <Badge color='green' variant='filled' size='xs'>
                        Installed
                      </Badge>
                    )}
                  </Group>
                  {version.versionNumber !== version.name && (
                    <Text size='xs' c='dimmed' ff='monospace'>
                      {version.versionNumber}
                    </Text>
                  )}
                </Stack>
              </TableData>
              <TableData>
                <ChannelBadge channel={version.channel} />
              </TableData>
              <TableData>
                <Group gap={4} wrap='nowrap'>
                  {version.gameVersions.slice(0, SHOWN_GAME_VERSIONS).map((value) => (
                    <Badge key={value} color='gray' variant='light' size='sm'>
                      {value}
                    </Badge>
                  ))}
                  {version.gameVersions.length > SHOWN_GAME_VERSIONS && (
                    <Tooltip label={version.gameVersions.slice(SHOWN_GAME_VERSIONS).join(', ')}>
                      <Badge color='gray' variant='outline' size='sm'>
                        +{version.gameVersions.length - SHOWN_GAME_VERSIONS}
                      </Badge>
                    </Tooltip>
                  )}
                </Group>
              </TableData>
              <TableData>
                <Group gap={4} wrap='nowrap'>
                  {version.loaders.map((value) => (
                    <LoaderBadge key={value} loader={value} />
                  ))}
                </Group>
              </TableData>
              <TableData>
                <FormattedTimestamp timestamp={version.published} />
              </TableData>
              <TableData>{formatCount(version.downloads)}</TableData>
              <TableData>{version.file && version.file.size > 0 ? bytesToString(version.file.size) : '—'}</TableData>
              <TableData>
                <Group gap='xs' justify='flex-end' wrap='nowrap'>
                  {!isInstalled && (
                    <ServerCan action='files.create'>
                      <ConditionalTooltip
                        enabled={!downloadable}
                        label={
                          version.file
                            ? 'The author does not allow this version to be downloaded outside CurseForge.'
                            : 'This version has no jar to install.'
                        }
                      >
                        <Button
                          size='xs'
                          variant='light'
                          disabled={!downloadable}
                          leftSection={<FontAwesomeIcon icon={installed ? faCodeBranch : faDownload} />}
                          onClick={() => onInstall(version.id)}
                        >
                          {installed ? 'Switch' : 'Install'}
                        </Button>
                      </ConditionalTooltip>
                    </ServerCan>
                  )}
                </Group>
              </TableData>
            </TableRow>
          );
        })}
      </Table>
    </Stack>
  );
}
