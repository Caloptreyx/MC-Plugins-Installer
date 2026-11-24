import { faBoxOpen, faCompass } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import ServerContentContainer from '@/elements/containers/ServerContentContainer.tsx';
import Badge from '@/elements/data-display/Badge.tsx';
import Tabs from '@/elements/layout/Tabs.tsx';
import { useServerStore } from '@/stores/server.ts';
import { useDetection, useInstalledPlugins } from '../lib/queries.ts';
import { pluginsUrl } from '../lib/routes.ts';
import { useExtTranslations } from '../translations.ts';
import DetectionAlert from './DetectionAlert.tsx';
import DetectionBadges from './DetectionBadges.tsx';
import UnsupportedServer from './UnsupportedServer.tsx';

type PluginsTab = 'browse' | 'installed';

/**
 * Shared frame of the Browse and Installed pages: title, detection badges/alert and tab bar. Servers that don't run
 * a plugin platform (mod loaders, vanilla, other games) get a short explanation instead.
 */
export default function PluginsLayout({ tab, children }: { tab: PluginsTab; children: ReactNode }) {
  const { t: tExt } = useExtTranslations();
  const serverId = useServerStore((state) => state.server.uuidShort);
  const navigate = useNavigate();
  const detection = useDetection();
  const { plugins } = useInstalledPlugins();

  const unsupported =
    !!detection.data &&
    (!detection.data.minecraft || detection.data.family === 'mods' || detection.data.family === 'vanilla');

  return (
    <ServerContentContainer
      title={tExt('pages.server.plugins.title', {})}
      subtitle={tExt('pages.server.plugins.subtitle', {})}
      contentRight={<DetectionBadges />}
    >
      {unsupported ? (
        <UnsupportedServer />
      ) : (
        <>
          <DetectionAlert />

          <Tabs
            value={tab}
            onChange={(value) => navigate(pluginsUrl(serverId, value === 'installed' ? '/installed' : ''))}
            mb='md'
          >
            <Tabs.List>
              <Tabs.Tab value='browse' leftSection={<FontAwesomeIcon icon={faCompass} />}>
                {tExt('pages.server.plugins.tabs.browse', {})}
              </Tabs.Tab>
              <Tabs.Tab
                value='installed'
                leftSection={<FontAwesomeIcon icon={faBoxOpen} />}
                rightSection={
                  plugins ? (
                    <Badge size='sm' variant='light' color='gray'>
                      {plugins.length}
                    </Badge>
                  ) : null
                }
              >
                {tExt('pages.server.plugins.tabs.installed', {})}
              </Tabs.Tab>
            </Tabs.List>
          </Tabs>

          {children}
        </>
      )}
    </ServerContentContainer>
  );
}
