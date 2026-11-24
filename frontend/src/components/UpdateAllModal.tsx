import { faArrowUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Group, Stack } from '@mantine/core';
import { useState } from 'react';
import Button from '@/elements/buttons/Button.tsx';
import Badge from '@/elements/data-display/Badge.tsx';
import Alert from '@/elements/feedback/Alert.tsx';
import Checkbox from '@/elements/input/Checkbox.tsx';
import { Modal, ModalFooter } from '@/elements/modals/Modal.tsx';
import Text from '@/elements/typography/Text.tsx';
import { useServerStore } from '@/stores/server.ts';
import type { PluginLoader } from '../lib/loaders.ts';
import { fileAvailability, fileFor, type PluginVersion } from '../lib/catalog.ts';
import { InstallError, installPluginVersion } from '../lib/install.ts';
import { type InstalledPlugin, pluginDisplayName } from '../lib/plugins.ts';
import { useExtTranslations } from '../translations.ts';
import { useErrorMessage } from './useErrorMessage.ts';

interface Props {
  opened: boolean;
  onClose: () => void;
  updates: { plugin: InstalledPlugin; version: PluginVersion }[];
  loader: PluginLoader;
  onDone: () => void;
}

type Outcome = { state: 'done' } | { state: 'failed'; message: string };

/**
 * Review step before updating several plugins: the user picks which ones, then they are updated one at a time
 * (the panel allows a few downloads per minute; on its limit the run stops and says when to retry).
 */
export default function UpdateAllModal({ opened, onClose, updates, loader, onDone }: Props) {
  const { t: tExt } = useExtTranslations();
  const uuid = useServerStore((state) => state.server.uuid);
  const errorMessage = useErrorMessage();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Map<string, Outcome>>(new Map());
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState<string | null>(null);

  const installable = (version: PluginVersion) =>
    fileAvailability(version.source, fileFor(version, loader)) === 'download';
  const selected = updates.filter(
    ({ plugin, version }) => installable(version) && !skipped.has(plugin.fileName) && !outcomes.has(plugin.fileName),
  );

  const run = async () => {
    setRunning(true);
    setStopped(null);
    for (const { plugin, version } of selected) {
      try {
        await installPluginVersion(uuid, version, loader, plugin);
        setOutcomes((current) => new Map(current).set(plugin.fileName, { state: 'done' }));
      } catch (error) {
        const message = errorMessage(error);
        setOutcomes((current) => new Map(current).set(plugin.fileName, { state: 'failed', message }));
        if (error instanceof InstallError && error.kind === 'rateLimited') {
          setStopped(message);
          break;
        }
      }
    }
    setRunning(false);
    onDone();
  };

  return (
    <Modal
      opened={opened}
      onClose={running ? () => undefined : onClose}
      size='lg'
      title={tExt('pages.server.plugins.updateAll.title', {})}
    >
      <Stack gap='sm'>
        <Text size='sm'>{tExt('pages.server.plugins.updateAll.description', {})}</Text>
        {updates.map(({ plugin, version }) => {
          const outcome = outcomes.get(plugin.fileName);
          const canInstall = installable(version);
          return (
            <Group key={plugin.fileName} justify='space-between' wrap='nowrap'>
              <Checkbox
                disabled={!canInstall || running || !!outcome}
                checked={canInstall && !skipped.has(plugin.fileName)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setSkipped((current) => {
                    const next = new Set(current);
                    if (checked) next.delete(plugin.fileName);
                    else next.add(plugin.fileName);
                    return next;
                  });
                }}
                label={tExt('pages.server.plugins.updateAll.row', {
                  plugin: pluginDisplayName(plugin),
                  from: plugin.version?.versionNumber ?? plugin.fileName,
                  to: version.versionNumber,
                })}
                description={outcome?.state === 'failed' ? outcome.message : undefined}
              />
              {outcome?.state === 'done' ? (
                <Badge color='green' variant='light' size='sm'>
                  {tExt('pages.server.plugins.updateAll.updated', {})}
                </Badge>
              ) : outcome?.state === 'failed' ? (
                <Badge color='red' variant='light' size='sm'>
                  {tExt('pages.server.plugins.updateAll.failed', {})}
                </Badge>
              ) : !canInstall ? (
                <Badge color='orange' variant='light' size='sm'>
                  {tExt(
                    `pages.server.plugins.availability.${fileAvailability(version.source, fileFor(version, loader)) === 'external' ? 'external' : 'manual'}`,
                    {},
                  )}
                </Badge>
              ) : null}
            </Group>
          );
        })}
        {stopped && <Alert color='yellow'>{stopped}</Alert>}
        <ModalFooter>
          <Button
            leftSection={<FontAwesomeIcon icon={faArrowUp} />}
            loading={running}
            disabled={selected.length === 0}
            onClick={run}
          >
            {tExt('pages.server.plugins.updateAll.start', { count: selected.length })}
          </Button>
          <Button variant='default' disabled={running} onClick={onClose}>
            {tExt('pages.server.plugins.actions.close', {})}
          </Button>
        </ModalFooter>
      </Stack>
    </Modal>
  );
}
