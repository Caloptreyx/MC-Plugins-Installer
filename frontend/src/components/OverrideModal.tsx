import { Stack } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { httpErrorToHuman } from '@/api/axios.ts';
import Button from '@/elements/buttons/Button.tsx';
import Select from '@/elements/input/Select.tsx';
import TextInput from '@/elements/input/TextInput.tsx';
import { Modal, ModalFooter } from '@/elements/modals/Modal.tsx';
import Text from '@/elements/typography/Text.tsx';
import { useToast } from '@/providers/ToastProvider.tsx';
import { useServerStore } from '@/stores/server.ts';
import type { ServerDetection } from '../lib/detect-core.ts';
import { MINECRAFT_VERSION } from '../lib/format.ts';
import { pluginQueryKeys, useDetection } from '../lib/queries.ts';
import {
  type Family,
  isSoftware,
  SOFTWARE_IDS,
  type Software,
  softwareFamily,
  softwareLabel,
} from '../lib/software.ts';
import { saveOverride } from '../lib/stateFile.ts';
import { useExtTranslations } from '../translations.ts';

const FAMILY_ORDER: Family[] = ['plugins', 'hybrid', 'proxy', 'mods', 'vanilla'];
const LOADER_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;

function OverrideForm({ detection, onClose }: { detection: ServerDetection | undefined; onClose: () => void }) {
  const { t: tExt } = useExtTranslations();
  const uuid = useServerStore((state) => state.server.uuid);
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  // Start from the current override, else from what was detected.
  const [software, setSoftware] = useState<Software | null>(
    detection?.override?.software ?? detection?.software?.value ?? null,
  );
  const [minecraftVersion, setMinecraftVersion] = useState(
    detection?.override ? (detection.override.minecraftVersion ?? '') : (detection?.minecraftVersion?.value ?? ''),
  );
  const [loaderVersion, setLoaderVersion] = useState(
    detection?.override ? (detection.override.loaderVersion ?? '') : (detection?.loaderVersion?.value ?? ''),
  );
  const [saving, setSaving] = useState(false);

  const proxy = software !== null && softwareFamily(software) === 'proxy';
  const minecraft = minecraftVersion.trim();
  const loader = loaderVersion.trim();
  const minecraftError =
    !proxy && minecraft !== '' && !MINECRAFT_VERSION.test(minecraft)
      ? tExt('pages.server.plugins.software.modal.invalidMinecraftVersion', {})
      : null;
  const loaderError =
    loader !== '' && !LOADER_VERSION.test(loader)
      ? tExt('pages.server.plugins.software.modal.invalidLoaderVersion', {})
      : null;

  const data = FAMILY_ORDER.map((family) => ({
    group: tExt(`pages.server.plugins.software.families.${family}`, {}),
    items: SOFTWARE_IDS.filter((id) => softwareFamily(id) === family).map((id) => ({
      value: id,
      label: softwareLabel(id),
    })),
  }));

  const save = async () => {
    if (!software) return;
    setSaving(true);
    try {
      await saveOverride(uuid, {
        software,
        minecraftVersion: proxy || minecraft === '' ? null : minecraft,
        loaderVersion: loader === '' ? null : loader,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pluginQueryKeys.detection(uuid) }),
        queryClient.invalidateQueries({ queryKey: pluginQueryKeys.installed(uuid) }),
      ]);
      addToast(tExt('pages.server.plugins.software.saved', {}), 'success');
      onClose();
    } catch (error) {
      addToast(httpErrorToHuman(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap='sm'>
      <Text size='sm' c='dimmed'>
        {tExt('pages.server.plugins.software.modal.description', {})}
      </Text>
      <Select
        label={tExt('pages.server.plugins.software.modal.software', {})}
        data={data}
        value={software}
        onChange={(value) => setSoftware(value && isSoftware(value) ? value : null)}
        searchable
        withAsterisk
      />
      <TextInput
        label={tExt('pages.server.plugins.software.modal.minecraftVersion', {})}
        description={
          proxy
            ? tExt('pages.server.plugins.software.modal.proxyHint', {})
            : tExt('pages.server.plugins.software.modal.minecraftVersionDescription', {})
        }
        value={proxy ? '' : minecraftVersion}
        onChange={(event) => setMinecraftVersion(event.currentTarget.value)}
        disabled={proxy}
        error={minecraftError}
      />
      <TextInput
        label={tExt('pages.server.plugins.software.modal.loaderVersion', {})}
        description={tExt('pages.server.plugins.software.modal.loaderVersionDescription', {})}
        value={loaderVersion}
        onChange={(event) => setLoaderVersion(event.currentTarget.value)}
        error={loaderError}
      />
      <ModalFooter>
        <Button variant='default' onClick={onClose}>
          {tExt('pages.server.plugins.software.modal.cancel', {})}
        </Button>
        <Button onClick={save} loading={saving} disabled={!software || minecraftError !== null || loaderError !== null}>
          {tExt('pages.server.plugins.software.modal.save', {})}
        </Button>
      </ModalFooter>
    </Stack>
  );
}

/** Sets the server software by hand: written to the override file and preferred over the detection. */
export default function OverrideModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t: tExt } = useExtTranslations();
  const { data } = useDetection();

  return (
    <Modal opened={opened} onClose={onClose} title={tExt('pages.server.plugins.software.modal.title', {})}>
      {opened && <OverrideForm detection={data} onClose={onClose} />}
    </Modal>
  );
}
