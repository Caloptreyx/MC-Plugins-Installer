import { faCube, faMagnifyingGlass, faRotate } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Group } from '@mantine/core';
import ActionIcon from '@/elements/buttons/ActionIcon.tsx';
import Badge from '@/elements/data-display/Badge.tsx';
import ConditionalTooltip from '@/elements/overlays/ConditionalTooltip.tsx';
import Tooltip from '@/elements/overlays/Tooltip.tsx';
import { useDetection } from '../lib/queries.ts';
import LoaderBadge from './LoaderBadge.tsx';

/** Badges with the detected plugin loader and Minecraft version of the server, and a button to detect again. */
export default function DetectionBadges() {
  const { data, isPending, isFetching, refetch } = useDetection();

  const loader = data?.loader ?? null;
  const version = data?.minecraftVersion ?? null;
  const proxy = data ? !data.versionApplicable : false;

  const sources = [
    loader && data?.loaderSource ? `Plugin Loader detected from ${data.loaderSource}` : null,
    version && data?.versionSource ? `Minecraft version detected from ${data.versionSource}` : null,
    proxy ? 'Proxies run plugins for every Minecraft version' : null,
  ].filter((line) => line !== null);

  return (
    <Group gap={6} wrap='nowrap'>
      {isPending ? (
        <Badge color='gray' variant='light' size='md' leftSection={<FontAwesomeIcon icon={faMagnifyingGlass} />}>
          Detecting…
        </Badge>
      ) : !loader && !version && !proxy ? (
        <Badge color='gray' variant='light' size='md' leftSection={<FontAwesomeIcon icon={faMagnifyingGlass} />}>
          Not detected
        </Badge>
      ) : (
        <ConditionalTooltip enabled={sources.length > 0} label={sources.join(' · ')}>
          <Group gap={6} wrap='nowrap'>
            {loader && <LoaderBadge loader={loader} size='md' />}
            <Badge color='gray' variant='light' size='md' leftSection={<FontAwesomeIcon icon={faCube} />}>
              {proxy ? 'Any version' : (version ?? 'Unknown version')}
            </Badge>
          </Group>
        </ConditionalTooltip>
      )}
      <Tooltip label='Detect again'>
        <ActionIcon
          variant='subtle'
          color='gray'
          loading={isFetching}
          onClick={() => refetch()}
          aria-label='Detect again'
        >
          <FontAwesomeIcon icon={faRotate} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
