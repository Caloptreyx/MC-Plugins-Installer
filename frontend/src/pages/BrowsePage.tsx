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
import { useErrorMessage } from '../components/useErrorMessage.ts';
import { useLoaderOptions } from '../components/useLoaderOptions.ts';
import {
  hangarPlatformFor,
  isPluginSource,
  PLUGIN_SOURCES,
  type PluginSource,
  type PluginSummary,
  projectKey,
  type SearchSort,
  searchPlugins,
} from '../lib/catalog.ts';
import { HANGAR_CATEGORIES, type HangarCategory } from '../lib/hangar.ts';
import { isPluginLoader, isProxyLoader, loaderLabel, runsOn } from '../lib/loaders.ts';
import {
  pluginQueryKeys,
  useCategories,
  useCurseforgeEnabled,
  useDetection,
  useGameVersions,
  useInstalledPlugins,
} from '../lib/queries.ts';
import { pluginDetailsUrl } from '../lib/routes.ts';
import { useExtTranslations } from '../translations.ts';

const PER_PAGE = 18;
/** Hangar pages hold at most 25 results. */
const HANGAR_PER_PAGE = 24;

const SORTS: SearchSort[] = ['relevance', 'downloads', 'follows', 'newest', 'updated'];

const isHangarCategory = (value: string): value is HangarCategory =>
  (HANGAR_CATEGORIES as readonly string[]).includes(value);

export default function BrowsePage() {
  const { t: tExt } = useExtTranslations();
  const server = useServerStore((state) => state.server);
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const [params, setParams] = useSearchParams();
  const detection = useDetection();
  const curseforge = useCurseforgeEnabled();
  const { byProject } = useInstalledPlugins();
  const { data: gameVersions = [] } = useGameVersions();

  const requestedSource = params.get('source');
  const source: PluginSource =
    isPluginSource(requestedSource) && (requestedSource !== 'curseforge' || curseforge.enabled)
      ? requestedSource
      : 'modrinth';
  const { data: categories = [] } = useCategories(source);

  const detectedLoader = detection.data?.loader ?? null;
  const loaderOptions = useLoaderOptions(detectedLoader);
  const detectedVersion = detection.data?.versionApplicable ? (detection.data.minecraftVersion?.value ?? null) : null;
  const canMatch = !!detectedLoader || !!detectedVersion;
  // Filtering by the detected server is the default; `match=0` turns it off.
  const matchServer = canMatch && params.get('match') !== '0';
  const requestedLoader = params.get('loader');
  const loader = matchServer
    ? detectedLoader
    : requestedLoader && isPluginLoader(requestedLoader)
      ? requestedLoader
      : null;
  // Proxies run plugins for every Minecraft version.
  const versionFilter = !loader || !isProxyLoader(loader);
  const gameVersion = !versionFilter ? null : matchServer ? detectedVersion : params.get('version');
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

  // CurseForge only has a "Bukkit Plugins" section; Hangar only has Paper, Velocity and Waterfall downloads.
  const unsupportedLoader =
    loader &&
    ((source === 'curseforge' && !runsOn(['bukkit'], loader)) || (source === 'hangar' && !hangarPlatformFor(loader)))
      ? loader
      : null;

  const searchParams = {
    query,
    loader,
    gameVersion,
    category,
    sort,
    page,
    perPage: source === 'hangar' ? HANGAR_PER_PAGE : PER_PAGE,
  };

  const results = useQuery({
    queryKey: pluginQueryKeys.search(source, searchParams),
    queryFn: () => searchPlugins(source, server.uuid, searchParams),
    placeholderData: keepPreviousData,
    // Wait for detection so the first request is already narrowed to this server.
    enabled: !detection.isPending && !unsupportedLoader,
  });

  const hasFilters = !!(query || loader || gameVersion || category);

  const categoryLabel = (id: string, name: string) =>
    source === 'hangar' && isHangarCategory(id) ? tExt(`pages.server.plugins.hangarCategories.${id}`, {}) : name;

  const sortLabel = (value: SearchSort) =>
    value === 'follows'
      ? tExt(`pages.server.plugins.browse.sort.follows.${source}`, {})
      : tExt(`pages.server.plugins.browse.sort.${value}`, {});

  return (
    <PluginsLayout tab='browse'>
      <Stack gap='md'>
        <Card p='md'>
          <Stack gap='sm'>
            <Group gap='sm' wrap='wrap'>
              <SegmentedControl
                value={source}
                onChange={(value) => update({ source: value === 'modrinth' ? null : value, category: null })}
                data={PLUGIN_SOURCES.map((value) => ({
                  value,
                  disabled: value === 'curseforge' && !curseforge.enabled,
                  label: (
                    <ConditionalTooltip
                      enabled={value === 'curseforge' && !curseforge.enabled}
                      label={tExt('pages.server.plugins.browse.curseforgeDisabled', {})}
                    >
                      <ProviderMark source={value} />
                    </ConditionalTooltip>
                  ),
                }))}
              />
              <TextInput
                style={{ flex: 1, minWidth: 220 }}
                placeholder={tExt('pages.server.plugins.browse.searchPlaceholder', {})}
                leftSection={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select
                w={190}
                aria-label={tExt('pages.server.plugins.browse.sortLabel', {})}
                value={sort}
                onChange={(value) => update({ sort: value })}
                data={SORTS.map((value) => ({ value, label: sortLabel(value) }))}
              />
            </Group>

            <Group gap='sm' wrap='wrap' align='center'>
              <Select
                w={170}
                clearable
                aria-label={tExt('pages.server.plugins.browse.loaderLabel', {})}
                placeholder={tExt('pages.server.plugins.common.anyLoader', {})}
                value={loader}
                disabled={matchServer}
                onChange={(value) => update({ loader: value })}
                data={loaderOptions}
              />
              {versionFilter && (
                <Select
                  w={170}
                  clearable
                  searchable
                  aria-label={tExt('pages.server.plugins.browse.gameVersionLabel', {})}
                  placeholder={tExt('pages.server.plugins.common.anyVersion', {})}
                  value={gameVersion}
                  disabled={matchServer}
                  onChange={(value) => update({ version: value })}
                  data={
                    gameVersion && !gameVersions.includes(gameVersion) ? [gameVersion, ...gameVersions] : gameVersions
                  }
                />
              )}
              <Select
                w={190}
                clearable
                searchable
                aria-label={tExt('pages.server.plugins.browse.categoryLabel', {})}
                placeholder={tExt('pages.server.plugins.browse.anyCategory', {})}
                value={category}
                onChange={(value) => update({ category: value })}
                data={categories.map((option) => ({ value: option.id, label: categoryLabel(option.id, option.name) }))}
              />
              {canMatch && (
                <ConditionalTooltip
                  enabled
                  label={tExt('pages.server.plugins.browse.matchServerHint', {
                    loader: detectedLoader
                      ? loaderLabel(detectedLoader)
                      : tExt('pages.server.plugins.common.anyLoader', {}),
                    version: detectedVersion ?? tExt('pages.server.plugins.common.anyVersion', {}),
                  })}
                >
                  <Switch
                    label={tExt('pages.server.plugins.browse.matchServer', {})}
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
                  {tExt('pages.server.plugins.browse.clearFilters', {})}
                </Button>
              )}
            </Group>
          </Stack>
        </Card>

        {unsupportedLoader ? (
          <Alert
            color='yellow'
            icon={<FontAwesomeIcon icon={faTriangleExclamation} />}
            title={tExt('pages.server.plugins.browse.unsupported.title', {})}
          >
            <Text size='sm'>
              {source === 'curseforge'
                ? tExt('pages.server.plugins.browse.unsupported.curseforge', {
                    loader: loaderLabel(unsupportedLoader),
                  })
                : tExt('pages.server.plugins.browse.unsupported.hangar', { loader: loaderLabel(unsupportedLoader) })}
            </Text>
          </Alert>
        ) : results.error ? (
          <Alert color='red'>{errorMessage(results.error)}</Alert>
        ) : !results.data ? (
          <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} height={176} radius='md' />
            ))}
          </SimpleGrid>
        ) : results.data.total === 0 ? (
          <EmptyState
            icon={faBoxOpen}
            title={tExt('pages.server.plugins.browse.empty.title', {})}
            description={tExt('pages.server.plugins.browse.empty.description', {})}
          />
        ) : (
          <>
            <Group justify='space-between'>
              <Text size='sm' c='dimmed'>
                {tExt('pages.server.plugins.browse.total', { count: results.data.total.toLocaleString() })}
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
          slug: installTarget?.slug ?? '',
          title: installTarget?.title ?? '',
          iconUrl: installTarget?.iconUrl ?? null,
        }}
        installed={installTarget ? (byProject.get(projectKey(installTarget.source, installTarget.id)) ?? null) : null}
      />
    </PluginsLayout>
  );
}
