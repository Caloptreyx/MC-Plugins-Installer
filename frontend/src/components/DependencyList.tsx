import { faArrowUpRightFromSquare, faCheck, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Group, Stack } from '@mantine/core';
import { useQueries } from '@tanstack/react-query';
import Badge from '@/elements/data-display/Badge.tsx';
import Alert from '@/elements/feedback/Alert.tsx';
import Checkbox from '@/elements/input/Checkbox.tsx';
import Anchor from '@/elements/typography/Anchor.tsx';
import Text from '@/elements/typography/Text.tsx';
import { useServerStore } from '@/stores/server.ts';
import type { PluginLoader } from '../lib/loaders.ts';
import type { InstalledPlugin } from '../lib/plugins.ts';
import { getProject, hangarPlatformFor, type PluginSource, type PluginVersion, projectKey } from '../lib/catalog.ts';
import { safeHref } from '../lib/fileRules.ts';
import { pluginQueryKeys } from '../lib/queries.ts';
import { useExtTranslations } from '../translations.ts';

export interface DependencyRow {
  /** `null` for dependencies outside the source (Hangar external links). */
  projectId: string | null;
  name: string;
  kind: 'required' | 'incompatible';
  installed: boolean;
  externalUrl: string | null;
}

/**
 * Required and incompatible dependencies of `version` on `loader` (Hangar lists them per platform), with their names
 * and whether a plugin of that project is already installed (matched by project, so any version counts).
 */
export function useDependencies(
  source: PluginSource,
  version: PluginVersion | null,
  loader: PluginLoader | null,
  byProject: Map<string, InstalledPlugin>,
): DependencyRow[] {
  const uuid = useServerStore((state) => state.server.uuid);
  const platform = hangarPlatformFor(loader);
  const dependencies = (version?.dependencies ?? []).filter(
    (dependency) =>
      dependency.kind !== 'optional' && (dependency.platform === null || dependency.platform === platform),
  );

  const projects = useQueries({
    queries: dependencies.map((dependency) => ({
      queryKey: pluginQueryKeys.project(source, dependency.projectId ?? ''),
      queryFn: () => getProject(source, uuid, dependency.projectId!),
      enabled: !!dependency.projectId && !dependency.name,
      staleTime: 5 * 60 * 1000,
    })),
  });

  return dependencies.map((dependency, index) => ({
    projectId: dependency.projectId,
    name: dependency.name ?? projects[index]?.data?.title ?? dependency.projectId ?? '',
    kind: dependency.kind === 'incompatible' ? 'incompatible' : 'required',
    installed: !!dependency.projectId && byProject.has(projectKey(source, dependency.projectId)),
    externalUrl: dependency.externalUrl,
  }));
}

interface Props {
  rows: DependencyRow[];
  /** Project ids the user unticked. */
  skipped: Set<string>;
  onToggle: (projectId: string, install: boolean) => void;
}

/** Lists required dependencies (ticked to be installed too unless already present) and installed incompatible plugins. */
export default function DependencyList({ rows, skipped, onToggle }: Props) {
  const { t: tExt } = useExtTranslations();

  const required = rows.filter((row) => row.kind === 'required');
  const conflicts = rows.filter((row) => row.kind === 'incompatible' && row.installed);
  if (required.length === 0 && conflicts.length === 0) return null;

  return (
    <Stack gap='xs'>
      {required.length > 0 && (
        <Stack gap={6}>
          <Text size='sm' fw={500}>
            {tExt('pages.server.plugins.install.dependencies.title', {})}
          </Text>
          {required.map((row) =>
            row.installed ? (
              <Group key={row.name} gap='xs' wrap='nowrap'>
                <FontAwesomeIcon icon={faCheck} />
                <Text size='sm'>{row.name}</Text>
                <Badge size='xs' color='green' variant='light'>
                  {tExt('pages.server.plugins.status.installed', {})}
                </Badge>
              </Group>
            ) : row.projectId ? (
              <Checkbox
                key={row.projectId}
                label={tExt('pages.server.plugins.install.dependencies.alsoInstall', { plugin: row.name })}
                checked={!skipped.has(row.projectId)}
                onChange={(event) => onToggle(row.projectId!, event.currentTarget.checked)}
              />
            ) : (
              <Group key={row.name} gap='xs' wrap='nowrap'>
                <Text size='sm'>
                  {tExt('pages.server.plugins.install.dependencies.external', { plugin: row.name })}
                </Text>
                {safeHref(row.externalUrl) && (
                  <Anchor href={safeHref(row.externalUrl)!} target='_blank' rel='noopener noreferrer' size='sm'>
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                  </Anchor>
                )}
              </Group>
            ),
          )}
        </Stack>
      )}
      {conflicts.length > 0 && (
        <Alert color='yellow' icon={<FontAwesomeIcon icon={faTriangleExclamation} />}>
          <Text size='sm'>
            {tExt('pages.server.plugins.install.dependencies.incompatible', {
              list: conflicts.map((row) => row.name).join(', '),
            })}
          </Text>
        </Alert>
      )}
    </Stack>
  );
}
