import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';

export default function NewGroup() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('create_group', { _name: trimmed });
    setBusy(false);
    if (error || !data) {
      Alert.alert('Could not create group', error?.message ?? 'Unknown error');
      return;
    }
    router.replace({ pathname: '/groups/[groupId]', params: { groupId: (data as any).id } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'New group' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.container}>
          <Text style={styles.label}>Group name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Roommates Closet Swap"
            placeholderTextColor={theme.dim}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={60}
          />
          <Text style={styles.hint}>
            You'll get an invite code to share. Anyone with the code can join and bid.
          </Text>

          <Pressable style={[styles.btn, (!name.trim() || busy) && { opacity: 0.5 }]} onPress={onCreate} disabled={!name.trim() || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create group</Text>}
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
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  hint: { color: theme.dim, fontSize: 13, lineHeight: 18 },
  btn: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
