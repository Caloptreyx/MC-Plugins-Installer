import { faPen, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Stack } from '@mantine/core';
import { useState } from 'react';
import Button from '@/elements/buttons/Button.tsx';
import Alert from '@/elements/feedback/Alert.tsx';
import Text from '@/elements/typography/Text.tsx';
import { useDetection } from '../lib/queries.ts';
import { useExtTranslations } from '../translations.ts';
import OverrideModal from './OverrideModal.tsx';
import { useOverrideAccess } from './ServerSoftwarePanel.tsx';

/** Short warning when the server software or Minecraft version could not be detected, with the manual override. */
export default function DetectionAlert() {
  const { t: tExt } = useExtTranslations();
  const { data } = useDetection();
  const { canSet } = useOverrideAccess();
  const [opened, setOpened] = useState(false);

  if (!data) return null;
  const missingSoftware = !data.software;
  const missingVersion = data.versionApplicable && !data.minecraftVersion;
  if (!missingSoftware && !missingVersion) return null;

  return (
    <Alert
      color='yellow'
      variant='light'
      mb='md'
      icon={faTriangleExclamation}
      title={
        missingSoftware
          ? tExt('pages.server.plugins.software.alert.softwareTitle', {})
          : tExt('pages.server.plugins.software.alert.versionTitle', {})
      }
    >
      <Stack gap='xs' align='flex-start'>
        <Text size='sm'>{tExt('pages.server.plugins.software.alert.content', {})}</Text>
        {canSet && (
          <Button
            size='xs'
            variant='light'
            color='yellow'
            leftSection={<FontAwesomeIcon icon={faPen} />}
            onClick={() => setOpened(true)}
          >
            {tExt('pages.server.plugins.software.setManually', {})}
          </Button>
        )}
      </Stack>
      <OverrideModal opened={opened} onClose={() => setOpened(false)} />
    </Alert>
  );
}
