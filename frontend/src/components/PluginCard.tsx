import { faClock, faDownload, faHeart } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Group, Stack } from '@mantine/core';
import Button from '@/elements/buttons/Button.tsx';
import { ServerCan } from '@/elements/Can.tsx';
import Badge from '@/elements/data-display/Badge.tsx';
import Card from '@/elements/data-display/Card.tsx';
import Tooltip from '@/elements/overlays/Tooltip.tsx';
import FormattedTimestamp from '@/elements/time/FormattedTimestamp.tsx';
import Text from '@/elements/typography/Text.tsx';
import type { PluginSummary } from '../lib/catalog.ts';
import type { InstalledPlugin } from '../lib/plugins.ts';
import { formatCount, gameVersionRange } from '../lib/format.ts';
import { useExtTranslations } from '../translations.ts';
import LoaderBadge from './LoaderBadge.tsx';
import PluginIcon from './PluginIcon.tsx';

interface Props {
  plugin: PluginSummary;
  installed: InstalledPlugin | null;
  onOpen: () => void;
  onInstall: () => void;
}

export default function PluginCard({ plugin, installed, onOpen, onInstall }: Props) {
  const { t: tExt } = useExtTranslations();
  const range = gameVersionRange(plugin.gameVersions);

  return (
    <Card hoverable onClick={onOpen} p='md' h='100%'>
      <Stack gap='sm' h='100%' justify='space-between'>
        <Stack gap='sm'>
          <Group wrap='nowrap' align='flex-start' gap='md'>
            <PluginIcon url={plugin.iconUrl} name={plugin.title} />
            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
              <Group gap={6} wrap='nowrap'>
                <Text fw={600} size='lg' truncate>
                  {plugin.title}
                </Text>
                {installed && (
                  <Badge color={installed.enabled ? 'green' : 'gray'} variant='filled' size='xs'>
                    {installed.enabled
                      ? tExt('pages.server.plugins.status.installed', {})
                      : tExt('pages.server.plugins.status.disabled', {})}
                  </Badge>
                )}
              </Group>
              {plugin.author && (
                <Text size='xs' c='dimmed' truncate>
                  {tExt('pages.server.plugins.common.byAuthor', { author: plugin.author })}
                </Text>
              )}
              <Text size='sm' lineClamp={2} mt={4}>
                {plugin.description}
              </Text>
            </Stack>
          </Group>

          <Group gap={6}>
            {plugin.loaders.map((loader) => (
              <LoaderBadge key={loader} loader={loader} />
            ))}
            {range && (
              <Badge color='gray' variant='light' size='sm'>
                {range}
              </Badge>
            )}
            {plugin.categories.slice(0, 3).map((category) => (
              <Badge key={category} color='gray' variant='outline' size='sm'>
                {category}
              </Badge>
            ))}
          </Group>
        </Stack>

        <Group justify='space-between' wrap='nowrap'>
          <Group gap='md' wrap='nowrap'>
            <Tooltip
              label={tExt('pages.server.plugins.common.downloadsCount', { count: plugin.downloads.toLocaleString() })}
            >
              <Text size='xs' c='dimmed'>
                <FontAwesomeIcon icon={faDownload} /> {formatCount(plugin.downloads)}
              </Text>
            </Tooltip>
            <Tooltip
              label={tExt(`pages.server.plugins.common.followsCount.${plugin.source}`, {
                count: plugin.follows.toLocaleString(),
              })}
            >
              <Text size='xs' c='dimmed'>
                <FontAwesomeIcon icon={faHeart} /> {formatCount(plugin.follows)}
              </Text>
            </Tooltip>
            {plugin.updated && (
              <Text size='xs' c='dimmed' component='span'>
                <FontAwesomeIcon icon={faClock} /> <FormattedTimestamp timestamp={plugin.updated} />
              </Text>
            )}
          </Group>
          {!installed && (
            <ServerCan action='files.create'>
              <Button
                size='xs'
                variant='light'
                leftSection={<FontAwesomeIcon icon={faDownload} />}
                onClick={(event) => {
                  event.stopPropagation();
                  onInstall();
                }}
              >
                {tExt('pages.server.plugins.actions.install', {})}
              </Button>
            </ServerCan>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
