import {
  faBoxOpen,
  faFilterCircleXmark,
  faMagnifyingGlass,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Group, SimpleGrid, Skeleton, Stack } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import Button from '@/elements/buttons/Button.tsx';
import Card from '@/elements/data-display/Card.tsx';
import { Pagination } from '@/elements/data-display/Table.tsx';
import Alert from '@/elements/feedback/Alert.tsx';
import EmptyState from '@/elements/feedback/EmptyState.tsx';
import Select from '@/elements/input/Select.tsx';
import Switch from '@/elements/input/Switch.tsx';
import TextInput from '@/elements/input/TextInput.tsx';
import SegmentedControl from '@/elements/layout/SegmentedControl.tsx';
import ConditionalTooltip from '@/elements/overlays/ConditionalTooltip.tsx';
import Text from '@/elements/typography/Text.tsx';
import { useServerStore } from '@/stores/server.ts';
import InstallPluginModal from '../components/InstallPluginModal.tsx';
import PluginCard from '../components/PluginCard.tsx';
import PluginsLayout from '../components/PluginsLayout.tsx';
import ProviderMark from '../components/ProviderMark.tsx';
import { type PluginSource, type PluginSummary, projectKey, type SearchSort, searchPlugins } from '../lib/catalog.ts';
import { compatibleLoaders, isPluginLoader, loaderLabel, loaderSelectData, runsOn } from '../lib/loaders.ts';
import {
  pluginQueryKeys,
  useCategories,
  useCurseforgeEnabled,
  useDetection,
  useGameVersions,
  useInstalledPlugins,
} from '../lib/queries.ts';
import { pluginDetailsUrl } from '../lib/routes.ts';

const PER_PAGE = 18;

const SORTS: SearchSort[] = ['relevance', 'downloads', 'follows', 'newest', 'updated'];

const sortLabel = (sort: SearchSort, source: PluginSource) =>
  ({
    relevance: 'Relevance',
    downloads: 'Downloads',
    // CurseForge has no followers; its equivalent order is by rating.
    follows: source === 'curseforge' ? 'Rating' : 'Followers',
    newest: 'Newest',
    updated: 'Recently updated',
  })[sort];

export default function BrowsePage() {
  const server = useServerStore((state) => state.server);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const detection = useDetection();
  const curseforge = useCurseforgeEnabled();
  const { byProject } = useInstalledPlugins();
  const { data: gameVersions = [] } = useGameVersions();

  const source: PluginSource = curseforge.enabled && params.get('source') === 'curseforge' ? 'curseforge' : 'modrinth';
  const { data: categories = [] } = useCategories(source);

  const detectedLoader = detection.data?.loader ?? null;
  const detectedVersion = detection.data?.minecraftVersion ?? null;
  const canMatch = !!detectedLoader || !!detectedVersion;
  // Filtering by the detected server is the default; `match=0` turns it off.
  const matchServer = canMatch && params.get('match') !== '0';
  const requestedLoader = params.get('loader');
  const loader = matchServer
    ? detectedLoader
    : requestedLoader && isPluginLoader(requestedLoader)
      ? requestedLoader
      : null;
  const gameVersion = matchServer ? detectedVersion : params.get('version');
  const category = params.get('category');
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const query = params.get('q') ?? '';
  const requestedSort = params.get('sort') as SearchSort | null;
  // Relevance only means something for a search term; otherwise show the most popular plugins.
  const sort: SearchSort =
    requestedSort && SORTS.includes(requestedSort) ? requestedSort : query ? 'relevance' : 'downloads';

  const [search, setSearch] = useState(query);
  const [debouncedSearch] = useDebouncedValue(search, 350);
  // The target outlives the open flag so the modal content stays intact during its close animation.
  const [installTarget, setInstallTarget] = useState<PluginSummary | null>(null);
  const [installOpen, setInstallOpen] = useState(false);

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        if (resetPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (debouncedSearch !== query) update({ q: debouncedSearch });
  }, [debouncedSearch]);

  // CurseForge only has a "Bukkit Plugins" section, which nothing outside the Bukkit family runs.
  const unsupportedLoader = source === 'curseforge' && loader && !runsOn(['bukkit'], loader) ? loader : null;

  const searchParams = {
    query,
    loaders: loader ? compatibleLoaders(loader) : [],
    gameVersion,
    category,
    sort,
    page,
    perPage: PER_PAGE,
  };

  const results = useQuery({
    queryKey: pluginQueryKeys.search(source, searchParams),
    queryFn: () => searchPlugins(source, server.uuid, searchParams),
    placeholderData: keepPreviousData,
    // Wait for detection so the first request is already narrowed to this server.
    enabled: !detection.isPending && !unsupportedLoader,
  });

  const hasFilters = !!(query || loader || gameVersion || category);

  return (
    <PluginsLayout tab='browse'>
      <Stack gap='md'>
        <Card p='md'>
          <Stack gap='sm'>
            <Group gap='sm' wrap='wrap'>
              <SegmentedControl
                value={source}
                onChange={(value) => update({ source: value === 'modrinth' ? null : value, category: null })}
                data={(['modrinth', 'curseforge'] as const).map((value) => ({
                  value,
                  disabled: value === 'curseforge' && !curseforge.enabled,
                  label: (
                    <ConditionalTooltip
                      enabled={value === 'curseforge' && !curseforge.enabled}
                      label='An administrator has not set up CurseForge.'
                    >
                      <ProviderMark source={value} />
                    </ConditionalTooltip>
                  ),
                }))}
              />
              <TextInput
                style={{ flex: 1, minWidth: 220 }}
                placeholder='Search plugins…'
                leftSection={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select
                w={190}
                aria-label='Sort by'
                value={sort}
                onChange={(value) => update({ sort: value })}
                data={SORTS.map((value) => ({ value, label: sortLabel(value, source) }))}
              />
            </Group>

            <Group gap='sm' wrap='wrap' align='center'>
              <Select
                w={170}
                clearable
                aria-label='Plugin Loader'
                placeholder='Any loader'
                value={loader}
                disabled={matchServer}
                onChange={(value) => update({ loader: value })}
                data={loaderSelectData(detectedLoader)}
              />
              <Select
                w={170}
                clearable
                searchable
                aria-label='Minecraft version'
                placeholder='Any version'
                value={gameVersion}
                disabled={matchServer}
                onChange={(value) => update({ version: value })}
                data={
                  gameVersion && !gameVersions.includes(gameVersion) ? [gameVersion, ...gameVersions] : gameVersions
                }
              />
              <Select
                w={190}
                clearable
                searchable
                aria-label='Category'
                placeholder='Any category'
                value={category}
                onChange={(value) => update({ category: value })}
                data={categories.map((option) => ({ value: option.id, label: option.name }))}
              />
              {canMatch && (
                <ConditionalTooltip
                  enabled
                  label={`Only show plugins for ${detectedLoader ? loaderLabel(detectedLoader) : 'any loader'} on ${
                    detectedVersion ? `Minecraft ${detectedVersion}` : 'any Minecraft version'
                  }`}
                >
                  <Switch
                    label='Match server'
                    checked={matchServer}
                    onChange={(event) => update({ match: event.currentTarget.checked ? null : '0' })}
                  />
                </ConditionalTooltip>
              )}
              {hasFilters && (
                <Button
                  variant='subtle'
                  color='gray'
                  leftSection={<FontAwesomeIcon icon={faFilterCircleXmark} />}
                  onClick={() => {
                    setSearch('');
                    update({ q: null, loader: null, version: null, category: null, match: '0' });
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Group>
          </Stack>
        </Card>

        {unsupportedLoader ? (
          <Alert
            color='yellow'
            icon={<FontAwesomeIcon icon={faTriangleExclamation} />}
            title='Not available on CurseForge'
          >
            <Text size='sm'>
              CurseForge only lists Bukkit plugins, which do not run on {loaderLabel(unsupportedLoader)}. Browse
              Modrinth instead, or pick a Bukkit-based loader (Paper, Purpur, Spigot or Bukkit).
            </Text>
          </Alert>
        ) : results.error ? (
          <Alert color='red'>{results.error.message}</Alert>
        ) : !results.data ? (
          <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} height={176} radius='md' />
            ))}
          </SimpleGrid>
        ) : results.data.total === 0 ? (
          <EmptyState
            icon={faBoxOpen}
            title='No plugins found'
            description='Try another search term, or loosen the loader, version and category filters.'
          />
        ) : (
          <>
            <Group justify='space-between'>
              <Text size='sm' c='dimmed'>
                {results.data.total.toLocaleString()} plugins
              </Text>
              <Pagination data={results.data} onPageSelect={(next) => update({ page: String(next) }, false)} />
            </Group>
            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} style={{ opacity: results.isPlaceholderData ? 0.6 : 1 }}>
              {results.data.data.map((plugin) => (
                <PluginCard
                  key={`${plugin.source}-${plugin.id}`}
                  plugin={plugin}
                  installed={byProject.get(projectKey(plugin.source, plugin.id)) ?? null}
                  onOpen={() => navigate(pluginDetailsUrl(server.uuidShort, plugin.source, plugin.id))}
                  onInstall={() => {
                    setInstallTarget(plugin);
                    setInstallOpen(true);
                  }}
                />
              ))}
            </SimpleGrid>
            <Group justify='flex-end'>
              <Pagination data={results.data} onPageSelect={(next) => update({ page: String(next) }, false)} />
            </Group>
          </>
        )}
      </Stack>

      <InstallPluginModal
        opened={installOpen}
        onClose={() => setInstallOpen(false)}
        project={{
          source: installTarget?.source ?? source,
          id: installTarget?.id ?? '',
          title: installTarget?.title ?? '',
          iconUrl: installTarget?.iconUrl ?? null,
        }}
        installed={installTarget ? (byProject.get(projectKey(installTarget.source, installTarget.id)) ?? null) : null}
      />
    </PluginsLayout>
  );
}
