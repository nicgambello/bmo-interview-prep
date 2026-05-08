import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushAndStoreToken(userId: string): Promise<string | null> {
  if (!Device.isDevice) return null; // simulator can't receive pushes

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#ff6b8a',
    });
  }

  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  if (!granted) return null;

  // For SDK 51 we don't strictly need a projectId for Expo Go testing, but
  // EAS production builds will use the projectId from app.json/app.config.
  const tokenResp = await Notifications.getExpoPushTokenAsync().catch(() => null);
  const token = tokenResp?.data ?? null;
  if (!token) return null;

  await supabase
    .from('expo_push_tokens')
    .upsert(
      { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    );

  return token;
}
