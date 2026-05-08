import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import type { Profile } from '@/types/database';

type BlockedRow = {
  blocked_id: string;
  blocked: Pick<Profile, 'id' | 'username' | 'display_name'> | null;
};

export default function ProfileScreen() {
  const { userId, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [blocked, setBlocked] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [{ data: p }, { data: b }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase
        .from('blocked_users')
        .select('blocked_id, blocked:profiles!blocked_users_blocked_id_fkey(id, username, display_name)')
        .eq('blocker_id', userId),
    ]);
    if (p) {
      setProfile(p as Profile);
      setDisplayName(p.display_name ?? '');
    }
    setBlocked((b ?? []) as unknown as BlockedRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveDisplayName() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', userId);
    setSaving(false);
    if (error) Alert.alert('Could not save', error.message);
  }

  async function unblock(blockedId: string) {
    const { error } = await supabase.rpc('unblock_user', { _user_id: blockedId });
    if (error) {
      Alert.alert('Could not unblock', error.message);
      return;
    }
    load();
  }

  function confirmDelete() {
    Alert.alert(
      'Delete account?',
      'This permanently removes your account, all your listings, bids, and group memberships. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('delete_my_account');
            if (error) {
              Alert.alert('Could not delete', error.message);
              return;
            }
            await supabase.auth.signOut();
            router.replace('/sign-in');
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Profile' }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
            <Text style={styles.label}>Username</Text>
            <Text style={styles.readOnly}>@{profile?.username}</Text>

            <Text style={[styles.label, { marginTop: 16 }]}>Display name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="How others see you"
              placeholderTextColor={theme.dim}
              maxLength={40}
            />
            <Pressable style={[styles.btn, saving && { opacity: 0.5 }]} onPress={saveDisplayName} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save</Text>}
            </Pressable>

            <Text style={[styles.section, { marginTop: 28 }]}>Blocked users</Text>
            {blocked.length === 0 ? (
              <Text style={styles.dim}>You haven't blocked anyone.</Text>
            ) : (
              blocked.map((b) => (
                <View key={b.blocked_id} style={styles.blockRow}>
                  <Text style={styles.blockName}>@{b.blocked?.username ?? 'unknown'}</Text>
                  <Pressable onPress={() => unblock(b.blocked_id)}>
                    <Text style={{ color: theme.accent, fontWeight: '700' }}>Unblock</Text>
                  </Pressable>
                </View>
              ))
            )}

            <View style={{ marginTop: 36, gap: 10 }}>
              <Pressable style={styles.outlineBtn} onPress={signOut}>
                <Text style={styles.outlineBtnText}>Sign out</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={confirmDelete}>
                <Text style={styles.dangerBtnText}>Delete account</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { color: theme.dim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  section: { color: theme.bright, fontSize: 16, fontWeight: '700' },
  dim: { color: theme.dim },
  readOnly: { color: theme.text, fontSize: 18, fontWeight: '600' },
  input: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  btn: { backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  outlineBtn: {
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: theme.card,
  },
  outlineBtnText: { color: theme.text, fontWeight: '700' },
  dangerBtn: {
    borderColor: 'rgba(248,113,113,0.3)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  dangerBtnText: { color: theme.red, fontWeight: '700' },
  blockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  blockName: { color: theme.text, fontWeight: '600' },
});
