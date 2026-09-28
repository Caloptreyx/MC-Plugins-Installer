import type { MantineColor } from '@mantine/core';
import Badge from '@/elements/data-display/Badge.tsx';
import type { VersionChannel } from '../lib/catalog.ts';

export const CHANNEL_LABELS: Record<VersionChannel, string> = { release: 'Release', beta: 'Beta', alpha: 'Alpha' };

const colors: Record<VersionChannel, MantineColor> = { release: 'green', beta: 'yellow', alpha: 'red' };

export default function ChannelBadge({ channel }: { channel: VersionChannel }) {
  return (
    <Badge color={colors[channel]} variant='light' size='sm'>
      {CHANNEL_LABELS[channel]}
    </Badge>
  );
}
