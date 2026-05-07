import { supabase } from './supabase';

export const ITEM_PHOTOS_BUCKET = 'item-photos';

// Upload a local image (file:// uri from expo-image-picker) to Supabase Storage.
// Returns the storage path (used as items.image_path).
export async function uploadItemPhoto(localUri: string, userId: string): Promise<string> {
  const ext = (localUri.split('.').pop() ?? 'jpg').toLowerCase().split('?')[0];
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const res = await fetch(localUri);
  const blob = await res.blob();

  const { error } = await supabase.storage
    .from(ITEM_PHOTOS_BUCKET)
    .upload(path, blob, {
      contentType: blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      upsert: false,
    });
  if (error) throw error;
  return path;
}

// Generates a temporary signed URL the app can use to display a private photo.
export async function getPhotoUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(ITEM_PHOTOS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}
