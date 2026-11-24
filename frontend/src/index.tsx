import { faPlug } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Extension, ExtensionContext } from 'shared';
import AdminConfigPage from './pages/AdminConfigPage.tsx';
import BrowsePage from './pages/BrowsePage.tsx';
import ManagePage from './pages/ManagePage.tsx';
import PluginDetailsPage from './pages/PluginDetailsPage.tsx';
import { getExtTranslations } from './translations.ts';

// Browsing and listing only need `files.read`; identifying jars, reading logs and the override file use
// `files.read-content` when the user has it, and installs/changes are checked against the core file permissions.
const PERMISSION = 'files.read';

class McPluginsInstallerExtension extends Extension {
  public cardConfigurationPage: React.FC | null = AdminConfigPage;
  public cardIcon = <FontAwesomeIcon icon={faPlug} />;

  public initialize(ctx: ExtensionContext): void {
    ctx.extensionRegistry.enterRoutes((routes) =>
      routes
        .addServerRoute({
          name: () => getExtTranslations().t('pages.server.plugins.title', {}),
          icon: faPlug,
          path: '/plugins',
          element: BrowsePage,
          permission: PERMISSION,
        })
        .addServerRoute({
          name: undefined,
          path: '/plugins/installed',
          element: ManagePage,
          permission: PERMISSION,
        })
        .addServerRoute({
          name: undefined,
          path: '/plugins/project/:source/:projectId/:tab?',
          element: PluginDetailsPage,
          permission: PERMISSION,
        }),
    );

    ctx.extensionRegistry.enterPermissionIcons((icons) =>
      icons.addAdminPermissionIcon('mcplugins', <FontAwesomeIcon icon={faPlug} />),
    );
  }
}

export default new McPluginsInstallerExtension();
