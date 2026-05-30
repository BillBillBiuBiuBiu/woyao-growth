// Client-side helpers for GC backend API
import type { GameRecord } from "./gc-teams";
import type { DbEvent } from "./supabase";

export interface StoredEvent {
  id: string;
  seq: number;
  playerId: string;
  playerName: string;
  playerNum: string;
  team: "home" | "away";
  cat: string;
  pts: number;
  quarter: number;
  gameClock: number;
  videoTs: number;
  note: string;
}

// ── In-memory cache ──────────────────────────────────────────────────────────
// Persists across client-side tab switches so revisiting a page is instant
// (no repeat network round-trip). TTL keeps it fresh; mutations invalidate.
const GC_CACHE_TTL = 30000;
let _gamesCache: { data: GameRecord[]; ts: number } | null = null;
const _eventsCache = new Map<string, { data: StoredEvent[]; ts: number }>();
const _clipsCache = new Map<string, { data: ClipRecord[]; ts: number }>();
const _fresh = (ts: number) => Date.now() - ts < GC_CACHE_TTL;
export function invalidateGcCache() { _gamesCache = null; _eventsCache.clear(); _clipsCache.clear(); }

// ── Games ────────────────────────────────────────────────────────────────────

export async function apiSaveGame(record: GameRecord & { source?: "live" | "review" }): Promise<void> {
  invalidateGcCache();
  await fetch("/api/gc/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: record.id,
      user_id: null,
      home_team: record.homeTeam,
      away_team: record.awayTeam,
      home_score: record.homeScore,
      away_score: record.awayScore,
      quarter_scores: record.quarterScores,
      event_count: record.eventCount,
      duration: record.duration,
      source: record.source ?? "live",
    }),
  });
}

export async function apiLoadGames(): Promise<GameRecord[]> {
  if (_gamesCache && _fresh(_gamesCache.ts)) return _gamesCache.data;
  const res = await fetch("/api/gc/games");
  if (!res.ok) return _gamesCache?.data ?? [];
  const rows = await res.json() as {
    id: string; created_at: string;
    home_team: string; away_team: string;
    home_score: number; away_score: number;
    quarter_scores: { q: number; home: number; away: number }[];
    event_count: number; duration: number;
  }[];
  const mapped = rows.map((r) => ({
    id: r.id,
    ts: r.created_at,
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    homeScore: r.home_score,
    awayScore: r.away_score,
    quarterScores: r.quarter_scores,
    eventCount: r.event_count,
    duration: r.duration,
  }));
  _gamesCache = { data: mapped, ts: Date.now() };
  return mapped;
}

// ── Events ───────────────────────────────────────────────────────────────────

export async function apiSaveEvents(gameId: string, events: StoredEvent[]): Promise<void> {
  const rows: Omit<DbEvent, "game_id">[] = events.map((e) => ({
    id: e.id,
    seq: e.seq,
    player_id: e.playerId,
    player_name: e.playerName,
    player_num: e.playerNum,
    team: e.team,
    cat: e.cat,
    pts: e.pts,
    quarter: e.quarter,
    game_clock: e.gameClock,
    video_ts: e.videoTs,
    note: e.note,
  }));
  invalidateGcCache();
  await fetch(`/api/gc/games/${gameId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rows),
  });
}

export async function apiLoadEvents(gameId: string): Promise<StoredEvent[]> {
  const cached = _eventsCache.get(gameId);
  if (cached && _fresh(cached.ts)) return cached.data;
  const res = await fetch(`/api/gc/games/${gameId}/events`);
  if (!res.ok) return cached?.data ?? [];
  const rows = await res.json() as DbEvent[];
  const mapped = rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    playerId: r.player_id,
    playerName: r.player_name,
    playerNum: r.player_num,
    team: r.team as "home" | "away",
    cat: r.cat,
    pts: r.pts,
    quarter: r.quarter,
    gameClock: r.game_clock,
    videoTs: r.video_ts,
    note: r.note,
  }));
  _eventsCache.set(gameId, { data: mapped, ts: Date.now() });
  return mapped;
}

// ── Clips ────────────────────────────────────────────────────────────────────

export async function apiUploadClip(
  gameId: string,
  blob: Blob,
  label: string,
  filename: string
): Promise<string | null> {
  const form = new FormData();
  form.append("file", new File([blob], filename, { type: "video/mp4" }));
  form.append("label", label);
  const res = await fetch(`/api/gc/games/${gameId}/clip`, { method: "POST", body: form });
  if (!res.ok) return null;
  invalidateGcCache();
  const data = await res.json() as { public_url: string };
  return data.public_url;
}

export interface ClipRecord {
  id: string;
  game_id: string;
  created_at: string;
  public_url: string;
  label: string;
  size_bytes: number;
}

export async function apiLoadClips(gameId: string): Promise<ClipRecord[]> {
  const cached = _clipsCache.get(gameId);
  if (cached && _fresh(cached.ts)) return cached.data;
  const res = await fetch(`/api/gc/games/${gameId}/clip`);
  if (!res.ok) return cached?.data ?? [];
  const data = await res.json() as ClipRecord[];
  _clipsCache.set(gameId, { data, ts: Date.now() });
  return data;
}
