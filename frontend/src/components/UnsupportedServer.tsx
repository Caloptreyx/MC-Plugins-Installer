import { faPen, faPlug } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Paper, Stack } from '@mantine/core';
import { useState } from 'react';
import Button from '@/elements/buttons/Button.tsx';
import Group from '@/elements/layout/Group.tsx';
import Text from '@/elements/typography/Text.tsx';
import Title from '@/elements/typography/Title.tsx';
import { useDetection } from '../lib/queries.ts';
import { softwareLabel } from '../lib/software.ts';
import { useExtTranslations } from '../translations.ts';
import OverrideModal from './OverrideModal.tsx';
import { EvidenceList, SoftwareBadge, useOverrideAccess } from './ServerSoftwarePanel.tsx';

/**
 * Shown instead of the Plugins pages on servers that don't load plugins (mod loaders, vanilla, other games): what was
 * detected and why, and the manual override for when the detection is wrong.
 */
export default function UnsupportedServer() {
  const { t: tExt, tReact } = useExtTranslations();
  const { data } = useDetection();
  const { canSet } = useOverrideAccess();
  const [opened, setOpened] = useState(false);

  if (!data) return null;
  const software = data.software?.value ?? null;

  let reason: string | null = null;
  if (!data.minecraft) reason = tExt('pages.server.plugins.software.unsupported.notMinecraft', {});
  else if (data.family === 'vanilla') reason = tExt('pages.server.plugins.software.unsupported.vanilla', {});
  else if (software && data.family === 'mods') {
    reason = tExt('pages.server.plugins.software.unsupported.mods', { software: softwareLabel(software) });
  }

  return (
    <Paper withBorder radius='md' p={{ base: 'md', sm: 'lg' }}>
      <Stack gap='md'>
        <Group gap='sm' wrap='nowrap' align='flex-start'>
          <FontAwesomeIcon icon={faPlug} size='lg' style={{ marginTop: 4 }} />
          <Stack gap={4}>
            <Title order={4}>{tExt('pages.server.plugins.software.unsupported.title', {})}</Title>
            {reason && <Text size='sm'>{reason}</Text>}
          </Stack>
        </Group>

        {software && (
          <Group gap='xs' wrap='wrap'>
            <Text size='sm' component='div'>
              {tReact('pages.server.plugins.software.unsupported.detected', {
                software: <SoftwareBadge software={software} />,
              })}
            </Text>
            {data.minecraftVersion && (
              <Text size='sm' c='dimmed'>
                {tExt('pages.server.plugins.software.minecraft', { version: data.minecraftVersion.value })}
              </Text>
            )}
          </Group>
        )}

        {data.evidence.length > 0 && (
          <Stack gap='xs'>
            <Text fw={600} size='sm'>
              {tExt('pages.server.plugins.software.evidence.title', {})}
            </Text>
            <EvidenceList evidence={data.evidence} detection={data} />
          </Stack>
        )}

        <Group justify='space-between' gap='sm' wrap='wrap'>
          <Text size='sm' c='dimmed'>
            {tExt('pages.server.plugins.software.unsupported.wrong', {})}
          </Text>
          <Button leftSection={<FontAwesomeIcon icon={faPen} />} disabled={!canSet} onClick={() => setOpened(true)}>
            {tExt('pages.server.plugins.software.setManually', {})}
          </Button>
        </Group>

        <Text size='xs' c='dimmed'>
          {tExt('pages.server.plugins.software.unsupported.adminHint', {})}
        </Text>
      </Stack>
      <OverrideModal opened={opened} onClose={() => setOpened(false)} />
    </Paper>
  );
}
