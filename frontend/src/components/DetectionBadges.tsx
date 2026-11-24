import { faCube, faMagnifyingGlass, faRotate, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState } from 'react';
import ActionIcon from '@/elements/buttons/ActionIcon.tsx';
import UnstyledButton from '@/elements/buttons/UnstyledButton.tsx';
import Badge from '@/elements/data-display/Badge.tsx';
import Group from '@/elements/layout/Group.tsx';
import Tooltip from '@/elements/overlays/Tooltip.tsx';
import Text from '@/elements/typography/Text.tsx';
import { useDetection } from '../lib/queries.ts';
import { useExtTranslations } from '../translations.ts';
import ServerSoftwarePanel, { SoftwareBadge } from './ServerSoftwarePanel.tsx';

/**
 * Badges with the detected server software and Minecraft version (plus the build or loader version); clicking them
 * opens the Server software panel. The button next to them detects again.
 */
export default function DetectionBadges() {
  const { t: tExt } = useExtTranslations();
  const { data, isPending, isFetching, refetch } = useDetection();
  const [opened, setOpened] = useState(false);

  const warn = !!data && (data.overrideDisagrees || data.conflicts.length > 0 || data.overrideProblem !== null);

  return (
    <Group gap={6} wrap='nowrap'>
      {isPending ? (
        <Badge color='gray' variant='light' size='md' leftSection={<FontAwesomeIcon icon={faMagnifyingGlass} />}>
          {tExt('pages.server.plugins.software.detecting', {})}
        </Badge>
      ) : (
        <Tooltip
          label={
            warn ? tExt('pages.server.plugins.software.warning', {}) : tExt('pages.server.plugins.software.open', {})
          }
        >
          <UnstyledButton onClick={() => setOpened(true)} aria-label={tExt('pages.server.plugins.software.open', {})}>
            <Group gap={6} wrap='nowrap'>
              {warn && <FontAwesomeIcon icon={faTriangleExclamation} color='var(--mantine-color-yellow-5)' />}
              {data?.software ? (
                <SoftwareBadge software={data.software.value} />
              ) : (
                <Badge
                  color='gray'
                  variant='light'
                  size='md'
                  leftSection={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                >
                  {tExt('pages.server.plugins.software.notDetected', {})}
                </Badge>
              )}
              <Badge color='gray' variant='light' size='md' leftSection={<FontAwesomeIcon icon={faCube} />}>
                {data && !data.versionApplicable
                  ? tExt('pages.server.plugins.software.anyVersion', {})
                  : data?.minecraftVersion
                    ? data.minecraftVersion.value
                    : tExt('pages.server.plugins.software.unknownVersion', {})}
              </Badge>
              {data?.loaderVersion && (
                <Text size='xs' c='dimmed' visibleFrom='sm' style={{ whiteSpace: 'nowrap' }}>
                  {data.loaderVersion.value}
                </Text>
              )}
            </Group>
          </UnstyledButton>
        </Tooltip>
      )}
      <Tooltip label={tExt('pages.server.plugins.software.refresh', {})}>
        <ActionIcon
          variant='subtle'
          color='gray'
          loading={isFetching}
          onClick={() => refetch()}
          aria-label={tExt('pages.server.plugins.software.refresh', {})}
        >
          <FontAwesomeIcon icon={faRotate} />
        </ActionIcon>
      </Tooltip>
      <ServerSoftwarePanel opened={opened} onClose={() => setOpened(false)} />
    </Group>
  );
}
