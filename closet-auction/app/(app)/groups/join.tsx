import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';

export default function JoinGroup() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function onJoin() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('join_group', { _invite_code: trimmed });
    setBusy(false);
    if (error || !data) {
      Alert.alert('Could not join', error?.message ?? 'Invalid code');
      return;
    }
    router.replace({ pathname: '/groups/[groupId]', params: { groupId: (data as any).id } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Join a group' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.container}>
          <Text style={styles.label}>Invite code</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 7K2X9P"
            placeholderTextColor={theme.dim}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={12}
          />

          <Pressable
            style={[styles.btn, (!code.trim() || busy) && { opacity: 0.5 }]}
            onPress={onJoin}
            disabled={!code.trim() || busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Join group</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 20, gap: 12 },
  label: { color: theme.dim, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  btn: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
