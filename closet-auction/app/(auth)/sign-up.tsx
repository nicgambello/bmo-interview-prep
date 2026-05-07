import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!email || !password || !username) {
      Alert.alert('Missing info', 'Email, username, and password are all required.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username: username.trim(), display_name: username.trim() },
      },
    });
    setBusy(false);
    if (error) {
      Alert.alert('Could not sign up', error.message);
      return;
    }
    Alert.alert(
      'Almost there',
      'Check your email to confirm, then sign in. (You can disable email confirmation in Supabase Auth settings while testing.)',
      [{ text: 'OK', onPress: () => router.replace('/sign-in') }],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.container}>
          <Text style={styles.brand}>Create account</Text>
          <Text style={styles.tag}>You'll need this to bid in groups.</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={theme.dim}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor={theme.dim}
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />
            <TextInput
              style={styles.input}
              placeholder="Password (min 6 chars)"
              placeholderTextColor={theme.dim}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Pressable style={[styles.btn, busy && { opacity: 0.5 }]} onPress={onSubmit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
            </Pressable>

            <Link href="/sign-in" asChild>
              <Pressable style={styles.linkWrap}>
                <Text style={styles.linkText}>
                  Have one? <Text style={{ color: theme.accent }}>Sign in</Text>
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  brand: { color: theme.bright, fontSize: 32, fontWeight: '800' },
  tag: { color: theme.dim, marginTop: 4, fontSize: 15 },
  form: { marginTop: 32, gap: 12 },
  input: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  btn: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkWrap: { marginTop: 12, alignItems: 'center' },
  linkText: { color: theme.dim, fontSize: 14 },
});
