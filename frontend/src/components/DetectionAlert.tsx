import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Alert from '@/elements/feedback/Alert.tsx';
import Text from '@/elements/typography/Text.tsx';
import { useDetection } from '../lib/queries.ts';

/** Warns when the plugin loader or Minecraft version could not be detected. */
export default function DetectionAlert() {
  const { data } = useDetection();
  if (!data) return null;

  const missing = [
    data.loader ? null : 'Plugin Loader',
    data.versionApplicable && !data.minecraftVersion ? 'Minecraft version' : null,
  ].filter((item) => item !== null);

  if (missing.length === 0) return null;

  return (
    <Alert
      color='yellow'
      variant='light'
      mb='md'
      icon={<FontAwesomeIcon icon={faTriangleExclamation} />}
      title={`Couldn't detect the ${missing.join(' or ')}`}
    >
      <Text size='sm'>
        Start the server at least once so it generates its files, then use the refresh button to detect again. Until
        then, results are not narrowed to your server: pick the loader and Minecraft version yourself in the filters and
        when installing a plugin.
      </Text>
    </Alert>
  );
}
