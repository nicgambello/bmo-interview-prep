import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import type { ImageStyle, StyleProp } from 'react-native';
import { getPhotoUrl } from '@/lib/storage';
import { theme } from '@/lib/theme';

type Props = {
  path: string;
  style?: StyleProp<ImageStyle>;
};

export function SignedImage({ path, style }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPhotoUrl(path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <Image
      source={url ? { uri: url } : undefined}
      style={[{ backgroundColor: theme.card2 }, style]}
      contentFit="cover"
      transition={200}
    />
  );
}
