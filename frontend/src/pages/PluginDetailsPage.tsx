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
import type { ReactNode } from 'react';
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
import { FOLLOW_LABELS, type PluginSource, projectKey, SOURCE_LABELS } from '../lib/catalog.ts';
import { formatCount } from '../lib/format.ts';
import { useInstalledPlugins, useProject, useProjectVersions } from '../lib/queries.ts';
import { pluginDetailsUrl, pluginsUrl } from '../lib/routes.ts';
import RichText from './details/RichText.tsx';
import VersionsTab from './details/VersionsTab.tsx';

const TABS = ['description', 'versions'] as const;
type Tab = (typeof TABS)[number];

const LINK_ICONS: Record<string, IconDefinition> = {
  Source: faCode,
  Issues: faBug,
  Wiki: faBook,
  Discord: faDiscord,
};

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
  const params = useParams<'source' | 'projectId' | 'tab'>();
  const source: PluginSource = params.source === 'curseforge' ? 'curseforge' : 'modrinth';
  const projectId = params.projectId ?? '';
  const tab: Tab = TABS.find((value) => value === params.tab) ?? 'description';
  const serverId = useServerStore((state) => state.server.uuidShort);
  const navigate = useNavigate();
  const location = useLocation();

  const project = useProject(source, projectId);
  const versions = useProjectVersions(source, projectId);
  const { byProject } = useInstalledPlugins();

  // `undefined` keeps the install modal closed; `null` opens it without a preselected version.
  const [installVersionId, setInstallVersionId] = useState<string | null>();

  const data = project.data;
  const installed = data ? (byProject.get(projectKey(data.source, data.id)) ?? null) : null;

  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(pluginsUrl(serverId));
  };

  return (
    <ServerContentContainer title={data?.title ?? 'Plugin'} contentRight={<DetectionBadges />}>
      <Stack gap='md'>
        <DetectionAlert />

        <Group>
          <Button variant='subtle' color='gray' leftSection={<FontAwesomeIcon icon={faArrowLeft} />} onClick={goBack}>
            Back to plugins
          </Button>
        </Group>

        {project.error ? (
          <Alert color='red'>{project.error.message}</Alert>
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
                          {installed.enabled ? 'Installed' : 'Disabled'}
                        </Badge>
                      )}
                    </Group>
                    <Group gap='xs'>
                      {data.author && (
                        <Text size='sm' c='dimmed'>
                          by {data.author}
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
                      {installed ? 'Switch version' : 'Install'}
                    </Button>
                  </ServerCan>
                  <Anchor href={data.url} target='_blank' rel='noopener noreferrer' size='sm' ta='center'>
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} /> Open on {SOURCE_LABELS[data.source]}
                  </Anchor>
                </Stack>
              </Group>

              <Divider my='md' />

              <Group justify='space-between' wrap='wrap' gap='lg'>
                <Group gap='xl' wrap='wrap'>
                  <Stat icon={faDownload} label='Downloads'>
                    {formatCount(data.downloads)}
                  </Stat>
                  <Stat icon={faHeart} label={FOLLOW_LABELS[data.source]}>
                    {formatCount(data.follows)}
                  </Stat>
                  {data.updated && (
                    <Stat icon={faClock} label='Updated'>
                      <FormattedTimestamp timestamp={data.updated} />
                    </Stat>
                  )}
                  {data.license && (
                    <Stat icon={faScaleBalanced} label='License'>
                      {data.license}
                    </Stat>
                  )}
                </Group>
                {data.links.length > 0 && (
                  <Group gap='sm'>
                    {data.links.map((link) => (
                      <Anchor key={link.url} href={link.url} target='_blank' rel='noopener noreferrer' size='sm'>
                        <FontAwesomeIcon icon={LINK_ICONS[link.label] ?? faGlobe} /> {link.label}
                      </Anchor>
                    ))}
                  </Group>
                )}
              </Group>
            </Card>

            {installed && (
              <Alert color={installed.enabled ? 'green' : 'gray'}>
                {installed.version?.versionNumber
                  ? `Version ${installed.version.versionNumber} is installed on this server`
                  : 'This plugin is installed on this server'}
                {installed.enabled ? '.' : ', but disabled.'}
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
                <Tabs.Tab value='description'>Description</Tabs.Tab>
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
                  Versions
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value='description' pt='md'>
                <Card p='lg'>
                  {data.body.trim() ? (
                    <RichText content={data.body} format={data.bodyFormat} />
                  ) : (
                    <Text c='dimmed'>This plugin has no description.</Text>
                  )}
                </Card>
              </Tabs.Panel>
              <Tabs.Panel value='versions' pt='md'>
                <VersionsTab
                  versions={versions.data ?? []}
                  loading={versions.isPending}
                  error={versions.error?.message ?? null}
                  installed={installed}
                  onInstall={setInstallVersionId}
                />
              </Tabs.Panel>
            </Tabs>

            <InstallPluginModal
              opened={installVersionId !== undefined}
              onClose={() => setInstallVersionId(undefined)}
              project={{ source: data.source, id: data.id, title: data.title, iconUrl: data.iconUrl }}
              installed={installed}
              initialVersionId={installVersionId}
            />
          </>
        )}
      </Stack>
    </ServerContentContainer>
  );
}
