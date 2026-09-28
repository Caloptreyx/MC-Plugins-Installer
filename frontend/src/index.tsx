import { faPlug } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Extension, ExtensionContext } from 'shared';
import AdminConfigPage from './pages/AdminConfigPage.tsx';
import BrowsePage from './pages/BrowsePage.tsx';
import ManagePage from './pages/ManagePage.tsx';
import PluginDetailsPage from './pages/PluginDetailsPage.tsx';

// Detection and plugin identification read files (and hash them), so every page needs read-content.
const PERMISSION = 'files.read-content';

class McPluginsInstallerExtension extends Extension {
  public cardConfigurationPage: React.FC | null = AdminConfigPage;
  public cardIcon: React.ReactNode = <FontAwesomeIcon icon={faPlug} />;

  public initialize(ctx: ExtensionContext): void {
    ctx.extensionRegistry.enterRoutes((routes) =>
      routes
        .addServerRoute({
          name: 'Plugins',
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
