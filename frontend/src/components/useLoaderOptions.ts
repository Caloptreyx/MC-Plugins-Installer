import { loaderLabel, PLUGIN_LOADER_IDS, type PluginLoader } from '../lib/loaders.ts';
import { useExtTranslations } from '../translations.ts';

/** Select options for picking a server platform, marking the detected one. */
export function useLoaderOptions(detected: PluginLoader | null) {
  const { t: tExt } = useExtTranslations();

  return PLUGIN_LOADER_IDS.map((value) => ({
    value,
    label:
      value === detected
        ? tExt('pages.server.plugins.common.detectedOption', { value: loaderLabel(value) })
        : loaderLabel(value),
  }));
}
