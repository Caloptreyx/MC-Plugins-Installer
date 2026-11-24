import type { ReactNode } from 'react';
import { faDiscord } from '@fortawesome/free-brands-svg-icons';
import {
  faArrowLeft,
  faArrowUpRightFromSquare,
  faBook,
  faBug,
  faClock,
  faCode,
  faCodeBranch,
  faDownload,
  faGlobe,
  faHeart,
  faScaleBalanced,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Anchor, Center, Divider, Group, Stack } from '@mantine/core';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import Button from '@/elements/buttons/Button.tsx';
import { ServerCan } from '@/elements/Can.tsx';
import ServerContentContainer from '@/elements/containers/ServerContentContainer.tsx';
import Badge from '@/elements/data-display/Badge.tsx';
import Card from '@/elements/data-display/Card.tsx';
import Alert from '@/elements/feedback/Alert.tsx';
import Spinner from '@/elements/feedback/Spinner.tsx';
import Tabs from '@/elements/layout/Tabs.tsx';
import FormattedTimestamp from '@/elements/time/FormattedTimestamp.tsx';
import Text from '@/elements/typography/Text.tsx';
import Title from '@/elements/typography/Title.tsx';
import { useServerStore } from '@/stores/server.ts';
import DetectionAlert from '../components/DetectionAlert.tsx';
import DetectionBadges from '../components/DetectionBadges.tsx';
import InstallPluginModal from '../components/InstallPluginModal.tsx';
import LoaderBadge from '../components/LoaderBadge.tsx';
import PluginIcon from '../components/PluginIcon.tsx';
import ProviderMark from '../components/ProviderMark.tsx';
import { useErrorMessage } from '../components/useErrorMessage.ts';
import { isPluginSource, type PluginSource, projectKey, SOURCE_LABELS } from '../lib/catalog.ts';
import { safeHref } from '../lib/fileRules.ts';
import { formatCount } from '../lib/format.ts';
import { useInstalledPlugins, useProject, useProjectVersions } from '../lib/queries.ts';
import { pluginDetailsUrl, pluginsUrl } from '../lib/routes.ts';
import { useExtTranslations } from '../translations.ts';
import RichText from './details/RichText.tsx';
import VersionsTab from './details/VersionsTab.tsx';

const TABS = ['description', 'versions'] as const;
type Tab = (typeof TABS)[number];

const KNOWN_LINKS = ['source', 'issues', 'wiki', 'discord'] as const;
type KnownLink = (typeof KNOWN_LINKS)[number];

const LINK_ICONS: Record<KnownLink, IconDefinition> = {
  source: faCode,
  issues: faBug,
  wiki: faBook,
  discord: faDiscord,
};

const knownLink = (label: string): KnownLink | null =>
  KNOWN_LINKS.find((known) => known === label.toLowerCase()) ?? null;

function Stat({ icon, label, children }: { icon: IconDefinition; label: string; children: ReactNode }) {
  return (
    <Stack gap={0}>
      <Text size='xs' c='dimmed' tt='uppercase' fw={600}>
        <FontAwesomeIcon icon={icon} /> {label}
      </Text>
      <Text size='sm' fw={500} component='div'>
        {children}
      </Text>
    </Stack>
  );
}

export default function PluginDetailsPage() {
  const { t: tExt } = useExtTranslations();
  const params = useParams<'source' | 'projectId' | 'tab'>();
  const source: PluginSource = isPluginSource(params.source) ? params.source : 'modrinth';
  const projectId = params.projectId ?? '';
  const tab: Tab = TABS.find((value) => value === params.tab) ?? 'description';
  const serverId = useServerStore((state) => state.server.uuidShort);
  const navigate = useNavigate();
  const location = useLocation();
  const errorMessage = useErrorMessage();

  const project = useProject(source, projectId);
  const versions = useProjectVersions(source, projectId);
  const { byProject } = useInstalledPlugins();

  // `undefined` keeps the install modal closed; `null` opens it without a preselected version.
  const [installVersionId, setInstallVersionId] = useState<string | null>();

  const data = project.data;
  const installed = data ? (byProject.get(projectKey(data.source, data.id)) ?? null) : null;
  const projectUrl = data ? safeHref(data.url) : null;

  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(pluginsUrl(serverId));
  };

  return (
    <ServerContentContainer
      title={data?.title ?? tExt('pages.server.plugins.details.fallbackTitle', {})}
      contentRight={<DetectionBadges />}
    >
      <Stack gap='md'>
        <DetectionAlert />

        <Group>
          <Button variant='subtle' color='gray' leftSection={<FontAwesomeIcon icon={faArrowLeft} />} onClick={goBack}>
            {tExt('pages.server.plugins.details.back', {})}
          </Button>
        </Group>

        {project.error ? (
          <Alert color='red'>{errorMessage(project.error)}</Alert>
        ) : !data ? (
          <Center py='xl'>
            <Spinner />
          </Center>
        ) : (
          <>
            <Card p='lg'>
              <Group justify='space-between' align='flex-start' wrap='wrap' gap='lg'>
                <Group wrap='nowrap' align='flex-start' gap='lg' style={{ minWidth: 0, flex: 1 }}>
                  <PluginIcon url={data.iconUrl} name={data.title} size={96} />
                  <Stack gap={6} style={{ minWidth: 0 }}>
                    <Group gap='sm'>
                      <Title order={2}>{data.title}</Title>
                      {installed && (
                        <Badge color={installed.enabled ? 'green' : 'gray'} variant='filled'>
                          {installed.enabled
                            ? tExt('pages.server.plugins.status.installed', {})
                            : tExt('pages.server.plugins.status.disabled', {})}
                        </Badge>
                      )}
                    </Group>
                    <Group gap='xs'>
                      {data.author && (
                        <Text size='sm' c='dimmed'>
                          {tExt('pages.server.plugins.common.byAuthor', { author: data.author })}
                        </Text>
                      )}
                      <Text size='sm' c='dimmed' component='div'>
                        <ProviderMark source={data.source} />
                      </Text>
                    </Group>
                    <Text>{data.description}</Text>
                    <Group gap={6}>
                      {data.loaders.map((loader) => (
                        <LoaderBadge key={loader} loader={loader} />
                      ))}
                      {data.categories.map((category) => (
                        <Badge key={category} color='gray' variant='outline' size='sm'>
                          {category}
                        </Badge>
                      ))}
                    </Group>
                  </Stack>
                </Group>

                <Stack gap='xs' align='stretch'>
                  <ServerCan action='files.create'>
                    <Button
                      size='md'
                      color='blue'
                      leftSection={<FontAwesomeIcon icon={installed ? faCodeBranch : faDownload} />}
                      onClick={() => setInstallVersionId(null)}
                    >
                      {installed
                        ? tExt('pages.server.plugins.actions.switchVersion', {})
                        : tExt('pages.server.plugins.actions.install', {})}
                    </Button>
                  </ServerCan>
                  {projectUrl && (
                    <Anchor href={projectUrl} target='_blank' rel='noopener noreferrer' size='sm' ta='center'>
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} />{' '}
                      {tExt('pages.server.plugins.details.openOn', { source: SOURCE_LABELS[data.source] })}
                    </Anchor>
                  )}
                </Stack>
              </Group>

              <Divider my='md' />

              <Group justify='space-between' wrap='wrap' gap='lg'>
                <Group gap='xl' wrap='wrap'>
                  <Stat icon={faDownload} label={tExt('pages.server.plugins.details.downloads', {})}>
                    {formatCount(data.downloads)}
                  </Stat>
                  <Stat icon={faHeart} label={tExt(`pages.server.plugins.details.follows.${data.source}`, {})}>
                    {formatCount(data.follows)}
                  </Stat>
                  {data.updated && (
                    <Stat icon={faClock} label={tExt('pages.server.plugins.details.updated', {})}>
                      <FormattedTimestamp timestamp={data.updated} />
                    </Stat>
                  )}
                  {data.license && (
                    <Stat icon={faScaleBalanced} label={tExt('pages.server.plugins.details.license', {})}>
                      {data.license}
                    </Stat>
                  )}
                </Group>
                {data.links.length > 0 && (
                  <Group gap='sm'>
                    {data.links.map((link) => {
                      const href = safeHref(link.url);
                      const known = knownLink(link.label);
                      return href ? (
                        <Anchor key={link.url} href={href} target='_blank' rel='noopener noreferrer' size='sm'>
                          <FontAwesomeIcon icon={known ? LINK_ICONS[known] : faGlobe} />{' '}
                          {known ? tExt(`pages.server.plugins.details.links.${known}`, {}) : link.label}
                        </Anchor>
                      ) : null;
                    })}
                  </Group>
                )}
              </Group>
            </Card>

            {installed && (
              <Alert color={installed.enabled ? 'green' : 'gray'}>
                {installed.version?.versionNumber
                  ? installed.enabled
                    ? tExt('pages.server.plugins.details.installedVersion', {
                        version: installed.version.versionNumber,
                      })
                    : tExt('pages.server.plugins.details.installedVersionDisabled', {
                        version: installed.version.versionNumber,
                      })
                  : installed.enabled
                    ? tExt('pages.server.plugins.details.installedUnknown', {})
                    : tExt('pages.server.plugins.details.installedUnknownDisabled', {})}
              </Alert>
            )}

            <Tabs
              value={tab}
              onChange={(value) =>
                navigate(
                  `${pluginDetailsUrl(serverId, data.source, projectId)}${value && value !== 'description' ? `/${value}` : ''}`,
                  { replace: true },
                )
              }
            >
              <Tabs.List>
                <Tabs.Tab value='description'>{tExt('pages.server.plugins.details.tabs.description', {})}</Tabs.Tab>
                <Tabs.Tab
                  value='versions'
                  rightSection={
                    versions.data ? (
                      <Badge size='xs' variant='light' color='gray'>
                        {versions.data.length}
                      </Badge>
                    ) : null
                  }
                >
                  {tExt('pages.server.plugins.details.tabs.versions', {})}
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value='description' pt='md'>
                <Card p='lg'>
                  {data.body.trim() ? (
                    <RichText content={data.body} format={data.bodyFormat} />
                  ) : (
                    <Text c='dimmed'>{tExt('pages.server.plugins.details.noDescription', {})}</Text>
                  )}
                </Card>
              </Tabs.Panel>
              <Tabs.Panel value='versions' pt='md'>
                <VersionsTab
                  versions={versions.data ?? []}
                  loading={versions.isPending}
                  error={versions.error ? errorMessage(versions.error) : null}
                  installed={installed}
                  onInstall={setInstallVersionId}
                />
              </Tabs.Panel>
            </Tabs>

            <InstallPluginModal
              opened={installVersionId !== undefined}
              onClose={() => setInstallVersionId(undefined)}
              project={{
                source: data.source,
                id: data.id,
                slug: data.slug,
                title: data.title,
                iconUrl: data.iconUrl,
              }}
              installed={installed}
              initialVersionId={installVersionId}
            />
          </>
        )}
      </Stack>
    </ServerContentContainer>
  );
}
