// Hand-maintained mirror of the Supabase schema for type safety in the app.
// If you change the SQL migration, update these too (or regenerate with
// `supabase gen types typescript`).

export type AuctionStatus = 'live' | 'settled' | 'cancelled';

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type Group = {
  id: string;
  name: string;
  created_by: string;
  invite_code: string;
  created_at: string;
};

export type GroupMember = {
  group_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
};

export type Item = {
  id: string;
  group_id: string;
  seller_id: string;
  title: string;
  description: string | null;
  image_path: string;
  starting_bid: number;
  current_bid: number | null;
  current_bidder_id: string | null;
  ends_at: string;
  status: AuctionStatus;
  winner_id: string | null;
  winning_bid: number | null;
  created_at: string;
};

export type Bid = {
  id: string;
  item_id: string;
  bidder_id: string;
  amount: number;
  created_at: string;
};
