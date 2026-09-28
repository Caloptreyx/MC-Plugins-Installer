import type { MantineColor, MantineSize } from '@mantine/core';
import Badge from '@/elements/data-display/Badge.tsx';
import { isPluginLoader, loaderLabel, type PluginLoader } from '../lib/loaders.ts';

const loaderColors: Record<PluginLoader, MantineColor> = {
  paper: 'blue',
  purpur: 'grape',
  folia: 'teal',
  spigot: 'orange',
  bukkit: 'red',
  velocity: 'cyan',
  bungeecord: 'yellow',
  waterfall: 'indigo',
  sponge: 'lime',
};

export default function LoaderBadge({ loader, size = 'sm' }: { loader: string; size?: MantineSize }) {
  return (
    <Badge color={isPluginLoader(loader) ? loaderColors[loader] : 'gray'} variant='light' size={size}>
      {loaderLabel(loader)}
    </Badge>
  );
}
