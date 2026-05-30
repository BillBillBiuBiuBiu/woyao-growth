// Client-side helpers for GC backend API
import type { GameRecord } from "./gc-teams";
import type { DbEvent } from "./supabase";
import snapshot from "./demo-snapshot.json";

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

export interface ClipRecord {
  id: string;
  game_id: string;
  created_at: string;
  public_url: string;
  label: string;
  size_bytes: number;
}

// ── Row mappers (DB shape → app shape) ───────────────────────────────────────
type GameRow = {
  id: string; created_at: string;
  home_team: string; away_team: string;
  home_score: number; away_score: number;
  quarter_scores: { q: number; home: number; away: number }[];
  event_count: number; duration: number;
};
const mapGameRow = (r: GameRow): GameRecord => ({
  id: r.id,
  ts: r.created_at,
  homeTeam: r.home_team,
  awayTeam: r.away_team,
  homeScore: r.home_score,
  awayScore: r.away_score,
  quarterScores: r.quarter_scores,
  eventCount: r.event_count,
  duration: r.duration,
});
const mapEventRow = (r: DbEvent): StoredEvent => ({
  id: r.id, seq: r.seq, playerId: r.player_id, playerName: r.player_name,
  playerNum: r.player_num, team: r.team as "home" | "away", cat: r.cat, pts: r.pts,
  quarter: r.quarter, gameClock: r.game_clock, videoTs: r.video_ts, note: r.note,
});

// ── Static demo snapshot ─────────────────────────────────────────────────────
// Baked at build time from the live demo data. Pages read this INSTANTLY (it's
// in the JS bundle — zero network), then a background fetch revalidates so newly
// recorded games eventually appear without ever blocking the UI. This is what
// makes the demo feel instant despite the hosted Supabase/Railway latency.
const snap = snapshot as unknown as {
  games: GameRow[];
  clips: Record<string, ClipRecord[]>;
  events: Record<string, DbEvent[]>;
};
const SNAP_GAMES: GameRecord[] = snap.games.map(mapGameRow);
const SNAP_CLIPS: Record<string, ClipRecord[]> = snap.clips ?? {};
const SNAP_EVENTS: Record<string, StoredEvent[]> = Object.fromEntries(
  Object.entries(snap.events ?? {}).map(([k, v]) => [k, v.map(mapEventRow)])
);

// ── In-memory cache (revalidated in background) ──────────────────────────────
const GC_CACHE_TTL = 30000;
let _gamesCache: { data: GameRecord[]; ts: number } | null = null;
const _eventsCache = new Map<string, { data: StoredEvent[]; ts: number }>();
const _clipsCache = new Map<string, { data: ClipRecord[]; ts: number }>();
const _fresh = (ts: number) => Date.now() - ts < GC_CACHE_TTL;
export function invalidateGcCache() { _gamesCache = null; _eventsCache.clear(); _clipsCache.clear(); }

function bgRefreshGames() {
  void (async () => {
    try {
      const res = await fetch("/api/gc/games");
      if (!res.ok) return;
      const rows = await res.json() as GameRow[];
      if (Array.isArray(rows)) _gamesCache = { data: rows.map(mapGameRow), ts: Date.now() };
    } catch { /* keep snapshot */ }
  })();
}
function bgRefreshEvents(gameId: string) {
  void (async () => {
    try {
      const res = await fetch(`/api/gc/games/${gameId}/events`);
      if (!res.ok) return;
      const rows = await res.json() as DbEvent[];
      if (Array.isArray(rows)) _eventsCache.set(gameId, { data: rows.map(mapEventRow), ts: Date.now() });
    } catch { /* keep snapshot */ }
  })();
}
function bgRefreshClips(gameId: string) {
  void (async () => {
    try {
      const res = await fetch(`/api/gc/games/${gameId}/clip`);
      if (!res.ok) return;
      const data = await res.json() as ClipRecord[];
      if (Array.isArray(data)) _clipsCache.set(gameId, { data, ts: Date.now() });
    } catch { /* keep snapshot */ }
  })();
}

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

// Snapshot-first + background revalidate — never blocks on the network.
export async function apiLoadGames(): Promise<GameRecord[]> {
  const serve = _gamesCache?.data ?? SNAP_GAMES;
  if (!_gamesCache || !_fresh(_gamesCache.ts)) bgRefreshGames();
  return serve;
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
  const serve = cached?.data ?? SNAP_EVENTS[gameId] ?? [];
  if (!cached || !_fresh(cached.ts)) bgRefreshEvents(gameId);
  return serve;
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

export async function apiLoadClips(gameId: string): Promise<ClipRecord[]> {
  const cached = _clipsCache.get(gameId);
  const serve = cached?.data ?? SNAP_CLIPS[gameId] ?? [];
  if (!cached || !_fresh(cached.ts)) bgRefreshClips(gameId);
  return serve;
}
