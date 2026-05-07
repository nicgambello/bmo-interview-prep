import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Countdown } from '@/components/Countdown';
import { SignedImage } from '@/components/SignedImage';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import type { Group, Item } from '@/types/database';

export default function GroupDetail() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;

    // Best-effort settle of any expired auctions; safe to ignore errors.
    await supabase.rpc('settle_due_auctions');

    const [{ data: g }, { data: its }] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      supabase
        .from('items')
        .select('*')
        .eq('group_id', groupId)
        .order('status', { ascending: true })
        .order('ends_at', { ascending: true }),
    ]);

    setGroup(g ?? null);
    setItems((its ?? []) as Item[]);
    setLoading(false);
    setRefreshing(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  // Subscribe to live changes on items in this group.
  useEffect(() => {
    if (!groupId) return;
    const ch = supabase
      .channel(`items:${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `group_id=eq.${groupId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, load]);

  async function shareInvite() {
    if (!group) return;
    await Share.share({
      message: `Join my closet auction group "${group.name}" — code: ${group.invite_code}`,
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: group?.name ?? 'Group',
          headerRight: () => (
            <Pressable onPress={shareInvite} hitSlop={8} disabled={!group}>
              <Text style={{ color: theme.accent, fontWeight: '700' }}>Invite</Text>
            </Pressable>
          ),
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              tintColor={theme.dim}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Pressable onPress={shareInvite}>
                <Text style={styles.codeLabel}>Invite code</Text>
                <Text style={styles.code}>{group?.invite_code}</Text>
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Closet's empty</Text>
              <Text style={styles.emptySub}>List the first item to start the auction.</Text>
            </View>
          }
          renderItem={({ item }) => <ItemTile item={item} groupId={groupId!} />}
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={() => router.push({ pathname: '/groups/[groupId]/new-item', params: { groupId: groupId! } })}
      >
        <Text style={styles.fabText}>+ List an item</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function ItemTile({ item, groupId }: { item: Item; groupId: string }) {
  const top = item.current_bid ?? item.starting_bid;
  return (
    <Pressable
      style={styles.tile}
      onPress={() =>
        router.push({
          pathname: '/groups/[groupId]/item/[itemId]',
          params: { groupId, itemId: item.id },
        })
      }
    >
      <SignedImage path={item.image_path} style={styles.tileImage} />
      <View style={styles.tileBody}>
        <Text style={styles.tileTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.tileRow}>
          <Text style={styles.tileBid}>${Number(top).toFixed(2)}</Text>
          {item.status === 'live' ? (
            <Countdown endsAt={item.ends_at} style={{ fontSize: 12 }} />
          ) : (
            <Text style={styles.tileEnded}>
              {item.status === 'settled' ? (item.winner_id ? 'Sold' : 'No bids') : 'Cancelled'}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 4, paddingBottom: 12 },
  codeLabel: { color: theme.dim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  code: { color: theme.accent, fontSize: 22, fontWeight: '800', letterSpacing: 3, marginTop: 2 },
  empty: { padding: 40, alignItems: 'center' },
  emptyTitle: { color: theme.bright, fontSize: 18, fontWeight: '700' },
  emptySub: { color: theme.dim, marginTop: 8, textAlign: 'center' },
  tile: {
    flex: 1,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  tileImage: { width: '100%', aspectRatio: 1, backgroundColor: theme.card2 },
  tileBody: { padding: 10 },
  tileTitle: { color: theme.bright, fontWeight: '700' },
  tileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  tileBid: { color: theme.text, fontWeight: '700' },
  tileEnded: { color: theme.dim, fontSize: 12 },
  fab: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: theme.accent,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 14,
    shadowColor: theme.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
