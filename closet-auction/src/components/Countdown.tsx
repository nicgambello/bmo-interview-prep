import { useEffect, useState } from 'react';
import { Text, type TextStyle, type StyleProp } from 'react-native';
import { formatRemaining, isEnded } from '@/lib/time';
import { theme } from '@/lib/theme';

type Props = {
  endsAt: string;
  style?: StyleProp<TextStyle>;
  onEnd?: () => void;
};

export function Countdown({ endsAt, style, onEnd }: Props) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (isEnded(endsAt)) {
      onEnd?.();
      return;
    }
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (isEnded(endsAt)) {
        clearInterval(id);
        onEnd?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt, onEnd]);

  const ended = isEnded(endsAt);
  return (
    <Text style={[{ color: ended ? theme.dim : theme.gold, fontWeight: '700' }, style]}>
      {formatRemaining(endsAt)}
    </Text>
  );
}
