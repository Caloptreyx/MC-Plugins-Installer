import { Group } from '@mantine/core';
import { type PluginSource, SOURCE_LABELS } from '../lib/catalog.ts';

const sourceColors: Record<PluginSource, string> = {
  modrinth: '#1bd96a',
  curseforge: '#f16436',
  hangar: '#004ee9',
};

/** A dot in the platform's brand color. */
export function ProviderDot({ source }: { source: PluginSource }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: sourceColors[source],
      }}
    />
  );
}

/** The platform name (a brand, not translated) with its brand color as a dot. */
export default function ProviderMark({ source }: { source: PluginSource }) {
  return (
    <Group gap={6} wrap='nowrap' component='span'>
      <ProviderDot source={source} />
      {SOURCE_LABELS[source]}
    </Group>
  );
}
