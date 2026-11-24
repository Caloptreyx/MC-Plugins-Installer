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
import type { InstalledPlugin } from '../../lib/plugins.ts';
import ChannelBadge from '../../components/ChannelBadge.tsx';
import LoaderBadge from '../../components/LoaderBadge.tsx';
import { useLoaderOptions } from '../../components/useLoaderOptions.ts';
import { fileAvailability, fileFor, type PluginVersion, type VersionChannel } from '../../lib/catalog.ts';
import { formatCount, newestFirst } from '../../lib/format.ts';
import { isPluginLoader, loaderLabel, type PluginLoader, runsOn } from '../../lib/loaders.ts';
import { useDetection } from '../../lib/queries.ts';
import { useExtTranslations } from '../../translations.ts';

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
  const { t: tExt } = useExtTranslations();
  const { data: detection } = useDetection();

  const detectedLoader = detection?.loader ?? null;
  const detectedVersion = detection?.versionApplicable ? (detection.minecraftVersion?.value ?? null) : null;
  const canMatch = !!detectedLoader || !!detectedVersion;
  const loaderOptions = useLoaderOptions(detectedLoader);

  const [search, setSearch] = useState('');
  const [loaderFilter, setLoaderFilter] = useState<PluginLoader | null>(null);
  const [gameVersionFilter, setGameVersionFilter] = useState<string | null>(null);
  // Release versions only by default; beta and alpha builds are one click away.
  const [channel, setChannel] = useState<VersionChannel | null>('release');
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
          placeholder={tExt('pages.server.plugins.versions.searchPlaceholder', {})}
          leftSection={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          value={search}
          onChange={(event) => changeFilter(setSearch)(event.target.value)}
        />
        <Select
          w={170}
          clearable
          placeholder={tExt('pages.server.plugins.common.anyLoader', {})}
          value={loader}
          disabled={compatible}
          onChange={changeFilter((value: string | null) =>
            setLoaderFilter(value && isPluginLoader(value) ? value : null),
          )}
          data={loaderOptions}
        />
        <Select
          w={200}
          clearable
          searchable
          placeholder={tExt('pages.server.plugins.common.anyVersion', {})}
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
            ...(['release', 'beta', 'alpha'] as const).map((value) => ({
              value,
              label: tExt(`pages.server.plugins.channel.${value}`, {}),
            })),
            { value: ALL, label: tExt('pages.server.plugins.versions.allChannels', {}) },
          ]}
        />
        {canMatch && (
          <Switch
            label={tExt('pages.server.plugins.versions.compatibleOnly', {})}
            checked={compatible}
            onChange={(event) => changeFilter(setCompatibleChoice)(event.currentTarget.checked)}
          />
        )}
      </Group>

      <Table
        columns={[
          tExt('pages.server.plugins.versions.columns.version', {}),
          tExt('pages.server.plugins.versions.columns.channel', {}),
          tExt('pages.server.plugins.versions.columns.gameVersions', {}),
          tExt('pages.server.plugins.versions.columns.loaders', {}),
          tExt('pages.server.plugins.versions.columns.published', {}),
          tExt('pages.server.plugins.versions.columns.downloads', {}),
          tExt('pages.server.plugins.versions.columns.size', {}),
          '',
        ]}
        loading={loading}
        error={error}
        pagination={pagination}
        onPageSelect={setPage}
        empty={
          <EmptyState
            flush
            icon={faCodeBranch}
            title={tExt('pages.server.plugins.versions.empty', {})}
            description=''
          />
        }
      >
        {pagination.data.map((version) => {
          const isInstalled = installed?.version?.id === version.id;
          const file = fileFor(version, detectedLoader);
          const availability = fileAvailability(version.source, file);
          const wrongPlatform = !!detectedLoader && !runsOn(version.loaders, detectedLoader);
          const blocked = wrongPlatform
            ? tExt('pages.server.plugins.install.blocked.wrongPlatform', {
                platforms: version.loaders.map(loaderLabel).join(', '),
                server: detectedLoader ? loaderLabel(detectedLoader) : '',
              })
            : availability === 'none'
              ? tExt('pages.server.plugins.install.blocked.noFile', {})
              : availability === 'external'
                ? tExt('pages.server.plugins.install.blocked.external', {})
                : null;

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
                        {tExt('pages.server.plugins.status.installed', {})}
                      </Badge>
                    )}
                    {(availability === 'manual' || availability === 'external') && (
                      <Badge color='orange' variant='light' size='xs'>
                        {tExt(`pages.server.plugins.availability.${availability}`, {})}
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
              <TableData>{file && file.size > 0 ? bytesToString(file.size) : '—'}</TableData>
              <TableData>
                <Group gap='xs' justify='flex-end' wrap='nowrap'>
                  {!isInstalled && (
                    <ServerCan action='files.create'>
                      <ConditionalTooltip enabled={!!blocked} label={blocked ?? ''}>
                        <Button
                          size='xs'
                          variant='light'
                          disabled={!!blocked}
                          leftSection={<FontAwesomeIcon icon={installed ? faCodeBranch : faDownload} />}
                          onClick={() => onInstall(version.id)}
                        >
                          {installed
                            ? tExt('pages.server.plugins.actions.switch', {})
                            : tExt('pages.server.plugins.actions.install', {})}
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
