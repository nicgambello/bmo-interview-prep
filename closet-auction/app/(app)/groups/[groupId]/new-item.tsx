import * as ImagePicker from 'expo-image-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { uploadItemPhoto } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { DURATION_OPTIONS } from '@/lib/time';

export default function NewItem() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { userId } = useAuth();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startingBid, setStartingBid] = useState('5');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [busy, setBusy] = useState(false);

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'We need photo library access to attach an image.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!r.canceled) setImageUri(r.assets[0].uri);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'We need camera access to take a photo.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!r.canceled) setImageUri(r.assets[0].uri);
  }

  async function onSubmit() {
    if (!imageUri || !title.trim() || !groupId || !userId) {
      Alert.alert('Missing info', 'Add a photo and a title to list the item.');
      return;
    }
    const start = Number(startingBid) || 0;
    if (start < 0) {
      Alert.alert('Bad starting bid', 'Starting bid must be 0 or greater.');
      return;
    }
    setBusy(true);
    try {
      const path = await uploadItemPhoto(imageUri, userId);
      const endsAt = new Date(Date.now() + durationMinutes * 60_000).toISOString();
      const { data, error } = await supabase
        .from('items')
        .insert({
          group_id: groupId,
          seller_id: userId,
          title: title.trim(),
          description: description.trim() || null,
          image_path: path,
          starting_bid: start,
          ends_at: endsAt,
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Could not create listing');
      router.replace({
        pathname: '/groups/[groupId]/item/[itemId]',
        params: { groupId, itemId: data.id },
      });
    } catch (e: any) {
      Alert.alert('Could not list item', e.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'List an item' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.imagePicker} onPress={pickFromLibrary}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.image} />
            ) : (
              <Text style={styles.imagePickerText}>Tap to choose a photo</Text>
            )}
          </Pressable>

          <View style={styles.inlineRow}>
            <Pressable style={styles.linkBtn} onPress={takePhoto}>
              <Text style={styles.linkBtnText}>Use camera</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={pickFromLibrary}>
              <Text style={styles.linkBtnText}>Choose from library</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Vintage Levi's denim jacket"
            placeholderTextColor={theme.dim}
            value={title}
            onChangeText={setTitle}
            maxLength={120}
          />

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
            placeholder="Size, condition, fit notes..."
            placeholderTextColor={theme.dim}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text style={styles.label}>Starting bid (USD)</Text>
          <TextInput
            style={styles.input}
            placeholder="5"
            placeholderTextColor={theme.dim}
            keyboardType="decimal-pad"
            value={startingBid}
            onChangeText={setStartingBid}
          />

          <Text style={styles.label}>Auction length</Text>
          <View style={styles.chipRow}>
            {DURATION_OPTIONS.map((opt) => (
              <Pressable
                key={opt.minutes}
                style={[styles.chip, durationMinutes === opt.minutes && styles.chipActive]}
                onPress={() => setDurationMinutes(opt.minutes)}
              >
                <Text style={[styles.chipText, durationMinutes === opt.minutes && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.btn, (busy || !imageUri || !title.trim()) && { opacity: 0.5 }]}
            onPress={onSubmit}
            disabled={busy || !imageUri || !title.trim()}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Start the auction</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 16, gap: 8, paddingBottom: 60 },
  imagePicker: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePickerText: { color: theme.dim, fontSize: 16 },
  image: { width: '100%', height: '100%' },
  inlineRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 },
  linkBtn: { paddingVertical: 6 },
  linkBtnText: { color: theme.accent, fontWeight: '600' },
  label: { color: theme.dim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 20,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { color: theme.text, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  btn: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
