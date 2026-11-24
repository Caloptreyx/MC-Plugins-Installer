import { faPen, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { type MantineColor, type MantineSize, Paper, SimpleGrid, Stack } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { httpErrorToHuman } from '@/api/axios.ts';
import Button from '@/elements/buttons/Button.tsx';
import Badge from '@/elements/data-display/Badge.tsx';
import Alert from '@/elements/feedback/Alert.tsx';
import Spinner from '@/elements/feedback/Spinner.tsx';
import Group from '@/elements/layout/Group.tsx';
import { Modal } from '@/elements/modals/Modal.tsx';
import Code from '@/elements/typography/Code.tsx';
import Text from '@/elements/typography/Text.tsx';
import { useServerCan } from '@/plugins/usePermissions.ts';
import { useToast } from '@/providers/ToastProvider.tsx';
import { useServerStore } from '@/stores/server.ts';
import type { DetectedValue, Evidence, ServerDetection } from '../lib/detect-core.ts';
import { pluginQueryKeys, useDetection } from '../lib/queries.ts';
import { type Family, type Software, softwareFamily, softwareLabel } from '../lib/software.ts';
import { saveOverride } from '../lib/stateFile.ts';
import { useExtTranslations } from '../translations.ts';
import OverrideModal from './OverrideModal.tsx';

const familyColors: Record<Family, MantineColor> = {
  plugins: 'blue',
  hybrid: 'grape',
  proxy: 'cyan',
  mods: 'orange',
  vanilla: 'green',
};

export function SoftwareBadge({ software, size = 'md' }: { software: Software; size?: MantineSize }) {
  return (
    <Badge color={familyColors[softwareFamily(software)]} variant='light' size={size}>
      {softwareLabel(software)}
    </Badge>
  );
}

/** Who may set and clear the override file (core enforces the same permissions on the file routes). */
export function useOverrideAccess() {
  const canSet = useServerCan(['files.read-content', 'files.create', 'files.update'], false);
  const canClear = useServerCan(['files.read-content', 'files.create', 'files.delete'], false);
  return { canSet, canClear };
}

/** Findings as a list: source, the path or log line, and what it points to. */
export function EvidenceList({ evidence, detection }: { evidence: Evidence[]; detection: ServerDetection }) {
  const { t: tExt } = useExtTranslations();

  return (
    <Stack gap='xs'>
      {evidence.map((entry, index) => (
        <Group key={`${entry.source}-${entry.detail}-${index}`} gap='xs' wrap='wrap' align='center'>
          <Badge color='gray' variant='light' size='sm'>
            {tExt(`pages.server.plugins.software.sourceNames.${entry.source}`, {})}
          </Badge>
          <Code style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{entry.detail}</Code>
          <Text size='sm' fw={500}>
            {entry.source === 'override' && detection.overrideProblem && entry.value === detection.overrideProblem
              ? tExt(`pages.server.plugins.software.overrideProblem.${detection.overrideProblem}`, {})
              : entry.value}
          </Text>
          {entry.stale && (
            <Badge color='yellow' variant='outline' size='sm'>
              {tExt('pages.server.plugins.software.staleBadge', {})}
            </Badge>
          )}
        </Group>
      ))}
    </Stack>
  );
}

function Field({ label, value, fallback }: { label: string; value: DetectedValue<string> | null; fallback: string }) {
  const { t: tExt } = useExtTranslations();

  return (
    <Paper withBorder p='sm' radius='md'>
      <Text size='xs' c='dimmed'>
        {label}
      </Text>
      <Text fw={600} style={{ wordBreak: 'break-word' }}>
        {value?.value ?? fallback}
      </Text>
      {value && (
        <Text size='xs' c='dimmed'>
          {tExt('pages.server.plugins.software.from', {
            source: tExt(`pages.server.plugins.software.sources.${value.source}`, {}),
            confidence: tExt(`pages.server.plugins.software.confidence.${value.confidence}`, {}),
          })}
        </Text>
      )}
    </Paper>
  );
}

function PanelContent({ detection }: { detection: ServerDetection }) {
  const { t: tExt } = useExtTranslations();
  const uuid = useServerStore((state) => state.server.uuid);
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { canSet, canClear } = useOverrideAccess();
  const [overrideOpened, setOverrideOpened] = useState(false);
  const [clearing, setClearing] = useState(false);

  const software = detection.software;
  const notDetected = tExt('pages.server.plugins.software.notDetected', {});
  // Name only what is older than the install: the log, version_history.json, or both.
  const staleNote = detection.staleSources.length > 1 ? 'both' : (detection.staleSources[0] ?? null);

  const clearOverride = async () => {
    setClearing(true);
    try {
      await saveOverride(uuid, null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pluginQueryKeys.detection(uuid) }),
        queryClient.invalidateQueries({ queryKey: pluginQueryKeys.installed(uuid) }),
      ]);
      addToast(tExt('pages.server.plugins.software.cleared', {}), 'success');
    } catch (error) {
      addToast(httpErrorToHuman(error), 'error');
    } finally {
      setClearing(false);
    }
  };

  return (
    <Stack gap='md'>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing='sm'>
        <Field
          label={tExt('pages.server.plugins.software.fields.software', {})}
          value={software ? { ...software, value: softwareLabel(software.value) } : null}
          fallback={notDetected}
        />
        <Field
          label={tExt('pages.server.plugins.software.fields.minecraftVersion', {})}
          value={detection.minecraftVersion}
          fallback={detection.versionApplicable ? notDetected : tExt('pages.server.plugins.software.proxyVersion', {})}
        />
        <Field
          label={tExt('pages.server.plugins.software.fields.loaderVersion', {})}
          value={detection.loaderVersion}
          fallback={notDetected}
        />
      </SimpleGrid>

      {detection.override && detection.overrideSetAt && (
        <Text size='sm' c='dimmed'>
          {tExt('pages.server.plugins.software.overrideSetAt', {
            date: new Date(detection.overrideSetAt).toLocaleString(),
          })}
        </Text>
      )}

      {detection.overrideDisagrees && (
        <Alert
          color='yellow'
          icon={faTriangleExclamation}
          title={tExt('pages.server.plugins.software.overrideDisagrees.title', {})}
        >
          <Text size='sm'>{tExt('pages.server.plugins.software.overrideDisagrees.content', {})}</Text>
        </Alert>
      )}

      {detection.overrideProblem && (
        <Alert color='yellow' icon={faTriangleExclamation}>
          <Text size='sm'>
            {tExt(`pages.server.plugins.software.overrideProblem.${detection.overrideProblem}`, {})}
          </Text>
        </Alert>
      )}

      {detection.conflicts.length > 0 && (
        <Alert
          color='yellow'
          icon={faTriangleExclamation}
          title={tExt('pages.server.plugins.software.conflicts.title', {})}
        >
          <Stack gap='xs'>
            <Text size='sm'>{tExt('pages.server.plugins.software.conflicts.description', {})}</Text>
            <EvidenceList evidence={detection.conflicts} detection={detection} />
          </Stack>
        </Alert>
      )}

      {staleNote && (
        <Alert color='blue' title={tExt(`pages.server.plugins.software.stale.${staleNote}.title`, {})}>
          <Text size='sm'>{tExt(`pages.server.plugins.software.stale.${staleNote}.content`, {})}</Text>
        </Alert>
      )}

      {!detection.contentReadable && (
        <Text size='sm' c='dimmed'>
          {tExt('pages.server.plugins.software.noContent', {})}
        </Text>
      )}

      <Stack gap='xs'>
        <Text fw={600}>{tExt('pages.server.plugins.software.evidence.title', {})}</Text>
        {detection.evidence.length > 0 ? (
          <EvidenceList evidence={detection.evidence} detection={detection} />
        ) : (
          <Text size='sm' c='dimmed'>
            {tExt('pages.server.plugins.software.evidence.empty', {})}
          </Text>
        )}
      </Stack>

      {(!canSet || (detection.override && !canClear)) && (
        <Text size='xs' c='dimmed'>
          {tExt('pages.server.plugins.software.noPermission', {})}
        </Text>
      )}

      <Group justify='flex-end' gap='sm' wrap='wrap'>
        {detection.override && (
          <Button
            variant='default'
            leftSection={<FontAwesomeIcon icon={faXmark} />}
            disabled={!canClear}
            loading={clearing}
            onClick={clearOverride}
          >
            {tExt('pages.server.plugins.software.clearOverride', {})}
          </Button>
        )}
        <Button
          leftSection={<FontAwesomeIcon icon={faPen} />}
          disabled={!canSet}
          onClick={() => setOverrideOpened(true)}
        >
          {tExt('pages.server.plugins.software.setManually', {})}
        </Button>
      </Group>

      <OverrideModal opened={overrideOpened} onClose={() => setOverrideOpened(false)} />
    </Stack>
  );
}

/**
 * The "Server software" panel: software, Minecraft version and build/loader version with their source and confidence,
 * everything that was found, disagreeing findings, and the manual override.
 */
export default function ServerSoftwarePanel({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t: tExt } = useExtTranslations();
  const { data } = useDetection();

  return (
    <Modal opened={opened} onClose={onClose} size='xl' title={tExt('pages.server.plugins.software.title', {})}>
      {data ? <PanelContent detection={data} /> : <Spinner.Centered />}
    </Modal>
  );
}
