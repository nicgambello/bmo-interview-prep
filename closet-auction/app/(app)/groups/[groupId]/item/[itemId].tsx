import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Countdown } from '@/components/Countdown';
import { SignedImage } from '@/components/SignedImage';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { isEnded } from '@/lib/time';
import type { Bid, Item, Profile } from '@/types/database';

type BidWithBidder = Bid & { bidder: Pick<Profile, 'id' | 'username' | 'display_name'> | null };

export default function ItemDetail() {
  const { itemId } = useLocalSearchParams<{ groupId: string; itemId: string }>();
  const { userId } = useAuth();

  const [item, setItem] = useState<Item | null>(null);
  const [seller, setSeller] = useState<Profile | null>(null);
  const [bids, setBids] = useState<BidWithBidder[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const minNext = useMemo(() => {
    if (!item) return 0;
    const cur = Number(item.current_bid ?? item.starting_bid);
    return item.current_bid == null ? Number(item.starting_bid) : cur + 1;
  }, [item]);

  const load = useCallback(async () => {
    if (!itemId) return;
    const [{ data: i }, { data: bs }] = await Promise.all([
      supabase.from('items').select('*').eq('id', itemId).single(),
      supabase
        .from('bids')
        .select('*, bidder:profiles!bids_bidder_id_fkey(id, username, display_name)')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (i) {
      setItem(i as Item);
      const { data: s } = await supabase.from('profiles').select('*').eq('id', (i as Item).seller_id).single();
      setSeller(s ?? null);
    }
    setBids((bs ?? []) as BidWithBidder[]);
    setLoading(false);
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: refresh on any bid or item update for this auction.
  useEffect(() => {
    if (!itemId) return;
    const ch = supabase
      .channel(`item:${itemId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bids', filter: `item_id=eq.${itemId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'items', filter: `id=eq.${itemId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [itemId, load]);

  async function placeBid() {
    if (!item) return;
    const amount = Number(bidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Bad bid', 'Enter a positive number.');
      return;
    }
    if (amount < minNext) {
      Alert.alert('Bid too low', `Minimum next bid is $${minNext.toFixed(2)}.`);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc('place_bid', { _item_id: item.id, _amount: amount });
    setSubmitting(false);
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Could not place bid', mapBidError(error.message));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBidAmount('');
    load();
  }

  async function settleNow() {
    await supabase.rpc('settle_due_auctions');
    load();
  }

  if (loading || !item) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Loading…' }} />
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const isSeller = item.seller_id === userId;
  const ended = isEnded(item.ends_at) || item.status !== 'live';
  const top = Number(item.current_bid ?? item.starting_bid);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: item.title }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <SignedImage path={item.image_path} style={styles.hero} />

          <View style={styles.body}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.seller}>Listed by @{seller?.username ?? '...'}</Text>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{item.current_bid != null ? 'Top bid' : 'Starting'}</Text>
                <Text style={styles.statBig}>${top.toFixed(2)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{ended ? 'Ended' : 'Ends in'}</Text>
                {ended ? (
                  <Text style={[styles.statBig, { color: theme.dim }]}>—</Text>
                ) : (
                  <Countdown
                    endsAt={item.ends_at}
                    style={{ fontSize: 22, fontWeight: '800' }}
                    onEnd={settleNow}
                  />
                )}
              </View>
            </View>

            {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}

            {ended ? (
              <View style={styles.endedCard}>
                {item.winner_id ? (
                  <>
                    <Text style={styles.endedTitle}>Sold!</Text>
                    <Text style={styles.endedSub}>
                      Winning bid ${Number(item.winning_bid ?? item.current_bid ?? 0).toFixed(2)}
                      {item.winner_id === userId ? " — that's you. " : '. '}
                      Coordinate handoff in your group chat.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.endedTitle}>No bids placed</Text>
                    <Text style={styles.endedSub}>This auction ended without any bids.</Text>
                  </>
                )}
              </View>
            ) : isSeller ? (
              <View style={styles.endedCard}>
                <Text style={styles.endedTitle}>You're the seller</Text>
                <Text style={styles.endedSub}>You can't bid on your own listing. Sit back and watch.</Text>
              </View>
            ) : (
              <View style={styles.bidPanel}>
                <Text style={styles.bidLabel}>Place a bid (min ${minNext.toFixed(2)})</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder={minNext.toFixed(2)}
                    placeholderTextColor={theme.dim}
                    keyboardType="decimal-pad"
                    value={bidAmount}
                    onChangeText={setBidAmount}
                  />
                  <Pressable
                    style={[styles.bidBtn, submitting && { opacity: 0.6 }]}
                    onPress={placeBid}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.bidBtnText}>Bid</Text>
                    )}
                  </Pressable>
                </View>
                <View style={styles.quickRow}>
                  {[0, 5, 10, 25].map((bump) => {
                    const v = (minNext + bump).toFixed(2);
                    return (
                      <Pressable key={bump} style={styles.quick} onPress={() => setBidAmount(v)}>
                        <Text style={styles.quickText}>${v}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={styles.history}>
              <Text style={styles.historyTitle}>Bid history</Text>
              {bids.length === 0 ? (
                <Text style={styles.historyEmpty}>No bids yet — be the first.</Text>
              ) : (
                bids.map((b, idx) => (
                  <View key={b.id} style={styles.bidRow}>
                    <Text style={[styles.bidName, idx === 0 && { color: theme.gold }]}>
                      @{b.bidder?.username ?? 'someone'}
                      {idx === 0 ? '  · top' : ''}
                    </Text>
                    <Text style={styles.bidAmt}>${Number(b.amount).toFixed(2)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function mapBidError(msg: string): string {
  if (msg.includes('bid_too_low')) return 'Someone outbid you. Try a higher amount.';
  if (msg.includes('auction_ended')) return 'This auction has already ended.';
  if (msg.includes('seller_cannot_bid')) return "You can't bid on your own listing.";
  if (msg.includes('not_group_member')) return "You're not a member of this group.";
  return msg;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { width: '100%', aspectRatio: 1 },
  body: { padding: 16, gap: 8 },
  title: { color: theme.bright, fontSize: 24, fontWeight: '800' },
  seller: { color: theme.dim },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  stat: {
    flex: 1,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  statLabel: { color: theme.dim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  statBig: { color: theme.bright, fontSize: 22, fontWeight: '800', marginTop: 4 },
  desc: { color: theme.text, lineHeight: 20, marginTop: 8 },
  bidPanel: {
    marginTop: 16,
    padding: 14,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 14,
    gap: 8,
  },
  bidLabel: { color: theme.dim, fontSize: 13 },
  input: {
    backgroundColor: theme.card2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    color: theme.text,
    fontSize: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bidBtn: {
    backgroundColor: theme.accent,
    paddingHorizontal: 22,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  quick: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.card2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 16,
  },
  quickText: { color: theme.text },
  endedCard: {
    marginTop: 16,
    padding: 14,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 14,
  },
  endedTitle: { color: theme.bright, fontWeight: '800', fontSize: 18 },
  endedSub: { color: theme.dim, marginTop: 4, lineHeight: 20 },
  history: { marginTop: 24 },
  historyTitle: { color: theme.bright, fontWeight: '700', marginBottom: 8 },
  historyEmpty: { color: theme.dim },
  bidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
  },
  bidName: { color: theme.text },
  bidAmt: { color: theme.bright, fontWeight: '700' },
});
