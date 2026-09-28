import { faBoxOpen, faCompass } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import ServerContentContainer from '@/elements/containers/ServerContentContainer.tsx';
import Badge from '@/elements/data-display/Badge.tsx';
import Tabs from '@/elements/layout/Tabs.tsx';
import { useServerStore } from '@/stores/server.ts';
import { useCurseforgeEnabled, useInstalledPlugins } from '../lib/queries.ts';
import { pluginsUrl } from '../lib/routes.ts';
import DetectionAlert from './DetectionAlert.tsx';
import DetectionBadges from './DetectionBadges.tsx';

type PluginsTab = 'browse' | 'installed';

/** Shared frame of the Browse and Installed pages: title, detection badges/alert and tab bar. */
export default function PluginsLayout({ tab, children }: { tab: PluginsTab; children: ReactNode }) {
  const serverId = useServerStore((state) => state.server.uuidShort);
  const navigate = useNavigate();
  const { data: installed } = useInstalledPlugins();
  const curseforge = useCurseforgeEnabled();

  return (
    <ServerContentContainer
      title='Plugins'
      subtitle={`Find, install and manage the plugins on this server. Plugins are provided by ${curseforge.enabled ? 'Modrinth and CurseForge' : 'Modrinth'}.`}
      contentRight={<DetectionBadges />}
    >
      <DetectionAlert />

      <Tabs
        value={tab}
        onChange={(value) => navigate(pluginsUrl(serverId, value === 'installed' ? '/installed' : ''))}
        mb='md'
      >
        <Tabs.List>
          <Tabs.Tab value='browse' leftSection={<FontAwesomeIcon icon={faCompass} />}>
            Browse
          </Tabs.Tab>
          <Tabs.Tab
            value='installed'
            leftSection={<FontAwesomeIcon icon={faBoxOpen} />}
            rightSection={
              installed ? (
                <Badge size='sm' variant='light' color='gray'>
                  {installed.length}
                </Badge>
              ) : null
            }
          >
            Installed
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {children}
    </ServerContentContainer>
  );
}
