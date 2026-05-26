import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const akey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, akey);

// ── Types ────────────────────────────────────────────────────────────────────

export interface DbGame {
  id: string;
  created_at: string;
  user_id: string | null;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  quarter_scores: { q: number; home: number; away: number }[];
  event_count: number;
  duration: number;
  source: "live" | "review";
}

export interface DbEvent {
  id: string;
  game_id: string;
  seq: number;
  player_id: string;
  player_name: string;
  player_num: string;
  team: "home" | "away";
  cat: string;
  pts: number;
  quarter: number;
  game_clock: number;
  video_ts: number;
  note: string;
}

export interface DbClip {
  id: string;
  game_id: string;
  created_at: string;
  file_path: string;
  public_url: string;
  size_bytes: number;
  label: string;
}
