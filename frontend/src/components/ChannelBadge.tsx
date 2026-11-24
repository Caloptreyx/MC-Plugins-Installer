import type { MantineColor } from '@mantine/core';
import Badge from '@/elements/data-display/Badge.tsx';
import type { VersionChannel } from '../lib/catalog.ts';
import { useExtTranslations } from '../translations.ts';

const colors: Record<VersionChannel, MantineColor> = { release: 'green', beta: 'yellow', alpha: 'red' };

export default function ChannelBadge({ channel }: { channel: VersionChannel }) {
  const { t: tExt } = useExtTranslations();

  return (
    <Badge color={colors[channel]} variant='light' size='sm'>
      {tExt(`pages.server.plugins.channel.${channel}`, {})}
    </Badge>
  );
}
