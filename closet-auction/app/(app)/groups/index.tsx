import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import type { Group } from '@/types/database';

type GroupRow = Group & { member_count: number; live_count: number };

export default function GroupsList() {
  // signOut moved to profile screen
  useAuth();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, created_by, invite_code, created_at, group_members(count), items(count)')
      .order('created_at', { ascending: false });

    if (error) {
      // eslint-disable-next-line no-console
      console.warn(error);
      setGroups([]);
    } else {
      const rows: GroupRow[] = (data ?? []).map((g: any) => ({
        id: g.id,
        name: g.name,
        created_by: g.created_by,
        invite_code: g.invite_code,
        created_at: g.created_at,
        member_count: g.group_members?.[0]?.count ?? 0,
        live_count: g.items?.[0]?.count ?? 0,
      }));
      setGroups(rows);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen
        options={{
          title: 'Your groups',
          headerRight: () => (
            <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
              <Text style={{ color: theme.accent, fontWeight: '700' }}>Profile</Text>
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
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          data={groups}
          keyExtractor={(g) => g.id}
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
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptySub}>
                Create one and share the invite code, or join with a friend's code.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: '/groups/[groupId]', params: { groupId: item.id } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>
                  {item.member_count} {item.member_count === 1 ? 'member' : 'members'} · {item.live_count} listings
                </Text>
              </View>
              <Text style={styles.code}>{item.invite_code}</Text>
            </Pressable>
          )}
        />
      )}

      <View style={styles.fabRow}>
        <Pressable style={[styles.fab, styles.fabSecondary]} onPress={() => router.push('/groups/join')}>
          <Text style={styles.fabSecondaryText}>Join</Text>
        </Pressable>
        <Pressable style={styles.fab} onPress={() => router.push('/groups/new')}>
          <Text style={styles.fabText}>+ New group</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 40, alignItems: 'center' },
  emptyTitle: { color: theme.bright, fontSize: 18, fontWeight: '700' },
  emptySub: { color: theme.dim, textAlign: 'center', marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    gap: 12,
  },
  rowTitle: { color: theme.bright, fontSize: 17, fontWeight: '700' },
  rowSub: { color: theme.dim, marginTop: 4 },
  code: {
    color: theme.accent,
    backgroundColor: 'rgba(255,107,138,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  fabRow: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 10,
  },
  fab: {
    flex: 1,
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: theme.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  fabSecondary: { backgroundColor: theme.card2, borderWidth: 1, borderColor: theme.border, shadowOpacity: 0 },
  fabSecondaryText: { color: theme.text, fontWeight: '700', fontSize: 16 },
});
