"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import {
  DEFAULT_TEAMS,
  loadTeamsConfig,
  teamsFromConfig,
  saveGameRecord,
  type TeamId,
  type RuntimeTeam,
  type TeamsConfig,
} from "@/lib/gc-teams";
import { apiSaveGame, apiSaveEvents, type StoredEvent } from "@/lib/gc-api";

const ACTIONS = [
  { label: "2分命中",  pts: 2, cat: "2pt" },
  { label: "2分不中",  pts: 0, cat: "2pt_miss" },
  { label: "3分命中",  pts: 3, cat: "3pt" },
  { label: "3分不中",  pts: 0, cat: "3pt_miss" },
  { label: "罚球命中", pts: 1, cat: "ft" },
  { label: "罚球不中", pts: 0, cat: "ft_miss" },
  { label: "进攻篮板", pts: 0, cat: "oreb" },
  { label: "防守篮板", pts: 0, cat: "dreb" },
  { label: "助攻",     pts: 0, cat: "ast" },
  { label: "抢断",     pts: 0, cat: "stl" },
  { label: "盖帽",     pts: 0, cat: "blk" },
  { label: "失误",     pts: 0, cat: "tov" },
  { label: "被犯规",   pts: 0, cat: "foul_drawn" },
  { label: "犯规",     pts: 0, cat: "foul" },
  { label: "换人",     pts: 0, cat: "sub" },
] as const;

export interface GameEvent {
  id: string;
  videoTs: number;
  quarter: number;
  teamId: TeamId;
  playerId: string;
  playerName: string;
  playerNum: string;
  action: string;
  pts: number;
  cat: string;
}

type CtxPrompt =
  | { type: "rebound";  shootingTeam: TeamId }
  | { type: "assist";   scoringTeam: TeamId; scorerId: string }
  | { type: "ft_count" }
  | { type: "ft_seq";   total: number; current: number }
  | { type: "steal";    stealTeam: TeamId };

type PlayerRef = { id: string; name: string; num: string };

const TEAM_PLAYER_ID = (teamId: TeamId) => `${teamId}-team`;

function fmt(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function actionColor(cat: string, pts: number): string {
  return pts > 0 ? "#F97316"
    : cat.endsWith("_miss") ? "#EF4444"
    : cat === "foul" ? "#FBBF24"
    : cat === "tov" ? "#EF4444"
    : "#9CA3AF";
}

export default function GcLivePage() {
  const [teams,         setTeams]         = useState<RuntimeTeam[]>(() => teamsFromConfig(DEFAULT_TEAMS));
  const [awayTrackMode, setAwayTrackMode] = useState<"player" | "team">("team");
  const [phase,         setPhase]         = useState<"live" | "postgame">("live");
  const [quarter,       setQuarter]       = useState(1);
  const [recSecs,       setRecSecs]       = useState(0);
  const [events,        setEvents]        = useState<GameEvent[]>([]);
  const [selTeam,       setSelTeam]       = useState<TeamId>("home");
  const [ctxPrompt,     setCtxPrompt]     = useState<CtxPrompt | null>(null);
  // GameChanger-style: action first → player picker
  const [pendingAction, setPendingAction] = useState<typeof ACTIONS[number] | null>(null);
  const [pendingTeam,   setPendingTeam]   = useState<TeamId>("home");
  const [ftShooter,     setFtShooter]     = useState<PlayerRef | null>(null);
  const [detailPlayer,  setDetailPlayer]  = useState<string | null>(null);
  const [lastFlash,     setLastFlash]     = useState<{ label: string; id: string } | null>(null);
  const [timeouts,      setTimeouts]      = useState<{ home: number; away: number }>({ home: 5, away: 5 });
  const [shareText,     setShareText]     = useState<string | null>(null);
  const [copyToast,     setCopyToast]     = useState(false);
  const [endConfirm,    setEndConfirm]    = useState(false);
  const [lastGameId,    setLastGameId]    = useState<string | null>(null);
  const [reassignEvent, setReassignEvent] = useState<GameEvent | null>(null);
  const [liveDraft,     setLiveDraft]     = useState<{ events: GameEvent[]; quarter: number } | null>(null);

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctxTimerRef = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const flashRef    = useRef<ReturnType<typeof setTimeout>  | null>(null);

  useEffect(() => {
    try {
      const cfg: TeamsConfig = loadTeamsConfig();
      setTeams(teamsFromConfig(cfg));
      setAwayTrackMode(cfg.awayTrackMode ?? "team");
    } catch {}
    try {
      const draftRaw = localStorage.getItem("gc_live_draft");
      if (draftRaw) {
        const draft = JSON.parse(draftRaw) as { events: GameEvent[]; quarter: number };
        if (Array.isArray(draft.events) && draft.events.length > 0) setLiveDraft(draft);
      }
    } catch {}
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => {
      if (timerRef.current)    clearInterval(timerRef.current);
      if (ctxTimerRef.current) clearTimeout(ctxTimerRef.current);
      if (flashRef.current)    clearTimeout(flashRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase === "live" && events.length > 0) {
      try { localStorage.setItem("gc_live_draft", JSON.stringify({ events, quarter })); } catch {}
    }
  }, [events, phase, quarter]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function switchToTeam(teamId: TeamId) {
    setSelTeam(teamId);
  }

  function clearCtx() {
    if (ctxTimerRef.current) { clearTimeout(ctxTimerRef.current); ctxTimerRef.current = null; }
    setCtxPrompt(null);
  }

  function setCtxTimed(ctx: CtxPrompt, ms: number) {
    if (ctxTimerRef.current) clearTimeout(ctxTimerRef.current);
    setCtxPrompt(ctx);
    ctxTimerRef.current = setTimeout(() => setCtxPrompt(null), ms);
  }

  function makeEvent(
    teamId: TeamId, playerId: string, playerName: string, playerNum: string,
    action: typeof ACTIONS[number]
  ): GameEvent {
    return {
      id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      videoTs: recSecs,
      quarter,
      teamId, playerId, playerName, playerNum,
      action: action.label, pts: action.pts, cat: action.cat,
    };
  }

  function resolvePlayer(teamId: TeamId, playerId?: string | null): PlayerRef | null {
    const isTeamMode = teamId === "away" && awayTrackMode === "team";
    if (isTeamMode) return { id: TEAM_PLAYER_ID(teamId), name: "全队", num: "-" };
    const team = teams.find(t => t.id === teamId);
    const p    = team?.players.find(p => p.id === playerId);
    return p ? { id: p.id, name: p.name, num: p.num } : null;
  }

  // ── GameChanger-style: action first → player picker ──────────────────────────

  function startAction(action: typeof ACTIONS[number]) {
    // Defensive actions default to the opposing team
    const inferred: TeamId = (action.cat === "stl" || action.cat === "blk" || action.cat === "dreb")
      ? (selTeam === "home" ? "away" : "home")
      : selTeam;
    setPendingTeam(inferred);
    setPendingAction(action);
  }

  function commitAction(player: PlayerRef | null) {
    if (!pendingAction) return;
    const action = pendingAction;
    const teamId = pendingTeam;
    const isTeamMode = teamId === "away" && awayTrackMode === "team";
    const p: PlayerRef = isTeamMode
      ? { id: TEAM_PLAYER_ID(teamId), name: "全队", num: "-" }
      : (player ?? { id: `${teamId}-tbd`, name: "未指定", num: "-" });

    const evt = makeEvent(teamId, p.id, p.name, p.num, action);
    setPendingAction(null);
    setEvents(prev => [evt, ...prev]);

    if (flashRef.current) clearTimeout(flashRef.current);
    setLastFlash({ label: action.pts > 0 ? `+${action.pts} ${action.label}` : action.label, id: evt.id });
    flashRef.current = setTimeout(() => setLastFlash(null), 3000);

    clearCtx();

    if (action.pts > 0 && action.cat !== "ft") {
      setCtxTimed({ type: "assist", scoringTeam: teamId, scorerId: p.id }, 5000);
    } else if (["2pt_miss", "3pt_miss"].includes(action.cat)) {
      setCtxTimed({ type: "rebound", shootingTeam: teamId }, 6000);
    } else if (action.cat === "foul_drawn") {
      setFtShooter(player); // track who is shooting FT
      setCtxTimed({ type: "ft_count" }, 10000);
    } else if (action.cat === "tov") {
      const otherTeam: TeamId = teamId === "home" ? "away" : "home";
      setCtxTimed({ type: "steal", stealTeam: otherTeam }, 6000);
    }

    // Auto-switch possession on steal or defensive rebound
    if (action.cat === "stl" || action.cat === "dreb") switchToTeam(teamId);
  }

  // ── Contextual prompt handlers ───────────────────────────────────────────────

  function logRebound(type: "oreb" | "dreb") {
    if (!ctxPrompt || ctxPrompt.type !== "rebound") return;
    const shootingTeam = ctxPrompt.shootingTeam;
    clearCtx();
    const rebTeamId: TeamId = type === "oreb" ? shootingTeam : (shootingTeam === "home" ? "away" : "home");
    const player = resolvePlayer(rebTeamId) ?? { id: TEAM_PLAYER_ID(rebTeamId), name: "全队", num: "-" };
    const action = ACTIONS.find(a => a.cat === type)!;
    setEvents(prev => [makeEvent(rebTeamId, player.id, player.name, player.num, action), ...prev]);
    if (type === "dreb") switchToTeam(rebTeamId);
  }

  function logAssist(assistPlayerId: string) {
    if (!ctxPrompt || ctxPrompt.type !== "assist") return;
    const { scoringTeam } = ctxPrompt;
    const otherTeam: TeamId = scoringTeam === "home" ? "away" : "home";
    clearCtx();
    const player = resolvePlayer(scoringTeam, assistPlayerId);
    if (!player) return;
    const action = ACTIONS.find(a => a.cat === "ast")!;
    setEvents(prev => [makeEvent(scoringTeam, player.id, player.name, player.num, action), ...prev]);
    switchToTeam(otherTeam);
  }

  function selectFTCount(count: 1 | 2 | 3) {
    clearCtx();
    setCtxPrompt({ type: "ft_seq", total: count, current: 1 });
  }

  function logFT(made: boolean) {
    if (!ctxPrompt || ctxPrompt.type !== "ft_seq") return;
    const { total, current } = ctxPrompt;
    const player = ftShooter ?? { id: TEAM_PLAYER_ID(selTeam), name: "全队", num: "-" };
    const action = ACTIONS.find(a => a.cat === (made ? "ft" : "ft_miss"))!;
    setEvents(prev => [makeEvent(selTeam, player.id, player.name, player.num, action), ...prev]);
    if (current >= total) {
      if (made) {
        clearCtx();
        setFtShooter(null);
        const otherTeam: TeamId = selTeam === "home" ? "away" : "home";
        switchToTeam(otherTeam);
      } else {
        setFtShooter(null);
        setCtxTimed({ type: "rebound", shootingTeam: selTeam }, 6000);
      }
    } else {
      setCtxPrompt({ type: "ft_seq", total, current: current + 1 });
    }
  }

  function logSteal(playerId?: string) {
    if (!ctxPrompt || ctxPrompt.type !== "steal") return;
    const { stealTeam } = ctxPrompt;
    clearCtx();
    const p = playerId
      ? resolvePlayer(stealTeam, playerId)
      : resolvePlayer(stealTeam) ?? { id: TEAM_PLAYER_ID(stealTeam), name: "全队", num: "-" };
    if (!p) return;
    const action = ACTIONS.find(a => a.cat === "stl")!;
    setEvents(prev => [makeEvent(stealTeam, p.id, p.name, p.num, action), ...prev]);
    switchToTeam(stealTeam);
  }

  function useTimeout(side: TeamId) {
    setTimeouts(prev => ({ ...prev, [side]: Math.max(0, prev[side] - 1) }));
  }

  function resumeToLive() {
    if (!timerRef.current) {
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    }
    setPhase("live");
  }

  function endGame() {
    try { localStorage.removeItem("gc_live_draft"); } catch {}
    if (timerRef.current)    { clearInterval(timerRef.current);  timerRef.current = null; }
    if (ctxTimerRef.current) { clearTimeout(ctxTimerRef.current); ctxTimerRef.current = null; }
    setCtxPrompt(null);

    try {
      const sc = {
        home: events.filter(e => e.teamId === "home").reduce((s, e) => s + e.pts, 0),
        away: events.filter(e => e.teamId === "away").reduce((s, e) => s + e.pts, 0),
      };
      const now = new Date().toISOString();
      localStorage.setItem("gc_last_session", JSON.stringify({
        ts: now,
        teams: teams.reduce((acc, t) => ({ ...acc, [t.id]: { name: t.name, color: t.color } }), {} as Record<string, { name: string; color: string }>),
        score: sc,
        duration: recSecs,
        events,
      }));
      const maxQ = events.length > 0 ? Math.max(...events.map(e => e.quarter)) : 0;
      const quarterScores = Array.from({ length: maxQ }, (_, i) => {
        const q = i + 1;
        const qe = events.filter(e => e.quarter === q);
        return { q, home: qe.filter(e => e.teamId === "home").reduce((s, e) => s + e.pts, 0), away: qe.filter(e => e.teamId === "away").reduce((s, e) => s + e.pts, 0) };
      });
      const gameId = `g-${Date.now()}`;
      setLastGameId(gameId);
      const record = {
        id: gameId,
        ts: now,
        homeTeam: teams.find(t => t.id === "home")?.name ?? "主场",
        awayTeam: teams.find(t => t.id === "away")?.name ?? "客场",
        homeScore: sc.home,
        awayScore: sc.away,
        quarterScores,
        eventCount: events.length,
        duration: recSecs,
      };
      saveGameRecord(record);
      // Fire-and-forget backend save
      void apiSaveGame({ ...record, source: "live" });
      void apiSaveEvents(
        gameId,
        events.map((e, i): StoredEvent => ({
          id: e.id,
          seq: i,
          playerId: e.playerId,
          playerName: e.playerName,
          playerNum: e.playerNum,
          team: e.teamId,
          cat: e.cat,
          pts: e.pts,
          quarter: e.quarter,
          gameClock: 0,
          videoTs: e.videoTs,
          note: e.action,
        }))
      );
    } catch {}

    setPhase("postgame");
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const score = {
    home: events.filter(e => e.teamId === "home").reduce((s, e) => s + e.pts, 0),
    away: events.filter(e => e.teamId === "away").reduce((s, e) => s + e.pts, 0),
  };

  // ── Share text builder ───────────────────────────────────────────────────────

  function buildShareText(
    homeTeam: string, awayTeam: string,
    homeScore: number, awayScore: number,
    qs: { q: number; home: number; away: number }[],
    stats: { name: string; num: string; teamId: TeamId; pts: number; reb: number; ast: number; stl: number }[],
  ): string {
    const winner = homeScore > awayScore ? homeTeam : awayScore > homeScore ? awayTeam : null;
    const qLine = qs.map(({ q, home, away }) => `Q${q} ${home}-${away}`).join("  ");
    const homePlayers = stats.filter(p => p.teamId === "home")
      .sort((a, b) => b.pts - a.pts)
      .map(p => `  ${p.num !== "-" ? `#${p.num} ` : ""}${p.name}  ${p.pts}分${p.reb > 0 ? ` ${p.reb}板` : ""}${p.ast > 0 ? ` ${p.ast}助` : ""}${p.stl > 0 ? ` ${p.stl}断` : ""}`)
      .join("\n");
    const awayPlayers = stats.filter(p => p.teamId === "away")
      .sort((a, b) => b.pts - a.pts)
      .map(p => `  ${p.num !== "-" ? `#${p.num} ` : ""}${p.name}  ${p.pts}分${p.reb > 0 ? ` ${p.reb}板` : ""}${p.ast > 0 ? ` ${p.ast}助` : ""}${p.stl > 0 ? ` ${p.stl}断` : ""}`)
      .join("\n");
    const today = new Date().toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
    return [
      `🏀 ${homeTeam} ${homeScore} — ${awayScore} ${awayTeam}`,
      winner ? `🏆 ${winner} 获胜` : "平局",
      "",
      qLine,
      "",
      `【${homeTeam}】`,
      homePlayers || "  暂无数据",
      "",
      `【${awayTeam}】`,
      awayPlayers || "  暂无数据",
      "",
      `${today} 我耀成长证据系统`,
    ].join("\n");
  }

  async function handleShare(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    } catch {
      setShareText(text);
    }
  }

  // ── POST-GAME SUMMARY ────────────────────────────────────────────────────────

  if (phase === "postgame") {
    const winner: TeamId | null =
      score.home > score.away ? "home" : score.away > score.home ? "away" : null;
    const winnerTeam = teams.find(t => t.id === winner);

    const allPlayers: { id: string; name: string; num: string; teamId: TeamId; teamColor: string }[] = [];
    teams.forEach(t => {
      t.players.forEach(p => allPlayers.push({ id: p.id, name: p.name, num: p.num, teamId: t.id, teamColor: t.color }));
      if (t.id === "away" && awayTrackMode === "team") {
        allPlayers.push({ id: TEAM_PLAYER_ID("away"), name: "全队", num: "-", teamId: "away", teamColor: t.color });
      }
    });

    const playerStats = allPlayers
      .map(p => {
        const pe = events.filter(e => e.playerId === p.id);
        return {
          ...p,
          pts:  pe.reduce((s, e) => s + e.pts, 0),
          reb:  pe.filter(e => e.cat === "oreb" || e.cat === "dreb").length,
          ast:  pe.filter(e => e.cat === "ast").length,
          stl:  pe.filter(e => e.cat === "stl").length,
          blk:  pe.filter(e => e.cat === "blk").length,
          tov:  pe.filter(e => e.cat === "tov").length,
          pf:   pe.filter(e => e.cat === "foul").length,
          all:  pe,
        };
      })
      .filter(p => p.all.length > 0);

    const clips = events
      .filter(e => e.pts > 0)
      .map(e => ({
        id: e.id,
        title: `${e.playerName} ${e.action}`,
        startTs: Math.max(0, e.videoTs - 2),
        endTs: e.videoTs + 6,
        videoTs: e.videoTs,
      }));

    const detailStats = detailPlayer ? playerStats.find(p => p.id === detailPlayer) : null;

    return (
      <div className="pb-10">
        {detailStats && (
          <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.75)" }}>
            <div className="w-full rounded-t-2xl px-4 pt-5 pb-10 max-h-[80vh] overflow-y-auto" style={{ background: "#1a1d27" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: detailStats.teamColor }} />
                  <span className="font-black text-white">
                    {detailStats.num !== "-" ? `#${detailStats.num} ` : ""}{detailStats.name}
                  </span>
                </div>
                <button onClick={() => setDetailPlayer(null)} className="text-gray-500 text-lg px-2">✕</button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-5">
                {[["分", detailStats.pts], ["板", detailStats.reb], ["助", detailStats.ast],
                  ["断", detailStats.stl], ["帽", detailStats.blk], ["误", detailStats.tov], ["犯", detailStats.pf]].map(([label, val]) => (
                  <div key={label as string} className="bg-white/5 rounded-lg py-2 text-center">
                    <div className="text-sm font-black text-orange-400">{val}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                  </div>
                ))}
              </div>
              {detailStats.all.length > 0 && (() => {
                const maxQ = Math.max(...detailStats.all.map(e => e.quarter));
                const qRows = Array.from({ length: maxQ }, (_, i) => {
                  const q = i + 1;
                  const qe = detailStats.all.filter(e => e.quarter === q);
                  return { q, pts: qe.reduce((s, e) => s + e.pts, 0), reb: qe.filter(e => e.cat === "oreb" || e.cat === "dreb").length, ast: qe.filter(e => e.cat === "ast").length };
                });
                if (maxQ === 1 && qRows[0].pts === 0 && qRows[0].reb === 0 && qRows[0].ast === 0) return null;
                return (
                  <div className="mb-5">
                    <div className="text-xs text-gray-500 mb-2">节次分拆</div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${maxQ}, 1fr)` }}>
                      {qRows.map(({ q, pts, reb, ast }) => (
                        <div key={q} className="bg-white/5 rounded-xl py-2.5 px-1 text-center">
                          <div className="text-[10px] text-gray-600 mb-1.5">Q{q}</div>
                          <div className="text-lg font-black text-orange-400">{pts}</div>
                          <div className="text-[10px] text-gray-600">分</div>
                          {(reb > 0 || ast > 0) && (
                            <div className="text-[10px] text-gray-500 mt-1">
                              {reb > 0 && `${reb}板`}{reb > 0 && ast > 0 && " "}{ast > 0 && `${ast}助`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="text-xs text-gray-500 mb-2">全场事件时间线</div>
              <div className="flex flex-col gap-0">
                {[...detailStats.all].sort((a, b) => a.videoTs - b.videoTs).map(e => (
                  <div key={e.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                    <span className="text-xs font-mono text-gray-600 shrink-0 w-10">{fmt(e.videoTs)}</span>
                    <span className="flex-1 text-xs text-gray-300">{e.action}</span>
                    {e.pts > 0 && <span className="text-xs font-bold text-orange-400 shrink-0">+{e.pts}</span>}
                  </div>
                ))}
              </div>
              {(() => {
                const hn = teams.find(t => t.id === "home")?.name ?? "主场";
                const an = teams.find(t => t.id === "away")?.name ?? "客场";
                const statParts = [
                  `${detailStats.pts}分`,
                  detailStats.reb > 0 && `${detailStats.reb}板`,
                  detailStats.ast > 0 && `${detailStats.ast}助`,
                  detailStats.stl > 0 && `${detailStats.stl}断`,
                ].filter(Boolean).join(" · ");
                const playerShareText = `🏀 ${detailStats.name}今天的比赛数据\n${hn} ${score.home} — ${score.away} ${an}\n\n${statParts}\n\n来自「我耀成长」`;
                return (
                  <button
                    onClick={() => handleShare(playerShareText)}
                    className="w-full mt-4 py-2.5 rounded-xl text-sm font-bold border active:opacity-80"
                    style={{ borderColor: "rgba(249,115,22,0.4)", color: "#F97316", background: "rgba(249,115,22,0.08)" }}
                  >
                    {copyToast ? "✅ 已复制！" : `📤 发给${detailStats.name}的家长`}
                  </button>
                );
              })()}
            </div>
          </div>
        )}

        <div className="bg-[#1a1d27] border-b border-white/10 px-4 py-5">
          <div className="text-xs text-gray-500 text-center uppercase tracking-wider mb-3">最终比分</div>
          <div className="flex items-center justify-between max-w-xs mx-auto">
            <div className="text-center">
              <div className="text-xs font-bold text-orange-400 mb-1">{teams.find(t => t.id === "home")?.name ?? "主场"}</div>
              <div className={`text-5xl font-black ${score.home >= score.away ? "text-orange-400" : "text-gray-500"}`}>{score.home}</div>
            </div>
            <div className="text-gray-600 text-2xl font-bold">—</div>
            <div className="text-center">
              <div className="text-xs font-bold text-blue-400 mb-1">{teams.find(t => t.id === "away")?.name ?? "客场"}</div>
              <div className={`text-5xl font-black ${score.away >= score.home ? "text-blue-400" : "text-gray-500"}`}>{score.away}</div>
            </div>
          </div>
          {winnerTeam && (
            <div className="text-center text-xs mt-3 text-yellow-400 font-medium">🏆 {winnerTeam.name} 获胜</div>
          )}
          <div className="text-center text-xs text-gray-600 mt-1">
            录制时长 {fmt(recSecs)} · {events.length} 个事件
          </div>

          {events.length > 0 && (() => {
            const maxQ = Math.max(...events.map(e => e.quarter));
            const qs = Array.from({ length: maxQ }, (_, i) => {
              const q = i + 1;
              const qe = events.filter(e => e.quarter === q);
              return { q, home: qe.filter(e => e.teamId === "home").reduce((s, e) => s + e.pts, 0), away: qe.filter(e => e.teamId === "away").reduce((s, e) => s + e.pts, 0) };
            });
            return (
              <div className="mt-4 pt-3 border-t border-white/10">
                <div className="grid gap-2 max-w-xs mx-auto" style={{ gridTemplateColumns: `repeat(${maxQ}, 1fr)` }}>
                  {qs.map(({ q, home, away }) => (
                    <div key={q} className="text-center bg-white/5 rounded-lg py-2 px-1">
                      <div className="text-[10px] text-gray-600 mb-1.5">Q{q}</div>
                      <div className="text-sm font-black" style={{ color: home > away ? "#F97316" : "#6B7280" }}>{home}</div>
                      <div className="text-[10px] text-gray-700 my-0.5">—</div>
                      <div className="text-sm font-black" style={{ color: away > home ? "#3B82F6" : "#6B7280" }}>{away}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {clips.length > 0 && (
          <div className="px-4 pt-5 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold">🎬 得分片段 ({clips.length})</div>
              <div className="text-[10px] text-gray-600">点击前往剪辑</div>
            </div>
            <div className="flex flex-col gap-2">
              {clips.map(c => (
                <Link key={c.id} href={lastGameId ? `/gc/review?gameId=${lastGameId}` : "/gc/review"} className="rounded-xl bg-[#1a1d27] border border-white/10 p-3 flex items-center gap-3 active:opacity-60 transition-opacity">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                    <span className="text-orange-400 text-xl">▶</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{fmt(c.startTs)} — {fmt(c.endTs)}</div>
                  </div>
                  <div className="text-xs text-orange-400/60 font-mono shrink-0">›</div>
                </Link>
              ))}
            </div>
            <div className="text-[10px] text-gray-700 text-center mt-3">上传比赛视频后，打点数据自动导入 · 一键生成集锦</div>
          </div>
        )}

        {(() => {
          const tbdEvents = events.filter(e => e.playerId.endsWith("-tbd"));
          const tbdPts = tbdEvents.reduce((s, e) => s + e.pts, 0);
          if (tbdEvents.length === 0) return null;
          return (
            <div className="mx-4 mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
              style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.3)" }}>
              <span className="text-orange-400 text-sm shrink-0">⚠️</span>
              <span className="text-xs text-orange-300">
                {tbdEvents.length} 个事件未归属球员{tbdPts > 0 ? `（含 ${tbdPts} 分）` : ""}，未计入以下统计
              </span>
            </div>
          );
        })()}

        {playerStats.length > 0 && (
          <div className="px-4 pb-4">
            <div className="text-sm font-bold mb-3">📊 球员数据 <span className="text-xs text-gray-600 font-normal">（点击查看详情）</span></div>
            <div className="rounded-xl overflow-hidden border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    {["球员", "分", "板", "助", "断", "帽", "误", "犯"].map((h, i) => (
                      <th key={h} className={`py-2 font-medium text-gray-400 ${i === 0 ? "text-left px-3" : "text-center px-1.5"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {playerStats.map(p => (
                    <tr key={p.id} className="border-b border-white/5 last:border-0 active:bg-white/5 cursor-pointer" onClick={() => setDetailPlayer(p.id)}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.teamColor }} />
                          <span className="font-medium">{p.num !== "-" ? `#${p.num} ` : ""}{p.name}</span>
                        </div>
                      </td>
                      <td className="px-1.5 py-2.5 text-center font-bold text-orange-400">{p.pts}</td>
                      <td className="px-1.5 py-2.5 text-center text-gray-300">{p.reb}</td>
                      <td className="px-1.5 py-2.5 text-center text-gray-300">{p.ast}</td>
                      <td className="px-1.5 py-2.5 text-center text-gray-300">{p.stl}</td>
                      <td className="px-1.5 py-2.5 text-center text-gray-300">{p.blk}</td>
                      <td className="px-1.5 py-2.5 text-center text-gray-300">{p.tov}</td>
                      <td className={`px-1.5 py-2.5 text-center font-bold ${p.pf >= 5 ? "text-gray-500" : p.pf >= 3 ? "text-red-400" : "text-gray-300"}`}>{p.pf}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {events.length === 0 && (
          <div className="text-center text-gray-600 text-sm py-16">本场比赛没有记录任何事件</div>
        )}

        <div className="flex flex-col gap-3 px-4 pt-2 pb-8">
          {events.length > 0 && (() => {
            const maxQ = Math.max(...events.map(e => e.quarter));
            const qs = Array.from({ length: maxQ }, (_, i) => {
              const q = i + 1;
              const qe = events.filter(e => e.quarter === q);
              return { q, home: qe.filter(e => e.teamId === "home").reduce((s, e) => s + e.pts, 0), away: qe.filter(e => e.teamId === "away").reduce((s, e) => s + e.pts, 0) };
            });
            const homeName = teams.find(t => t.id === "home")?.name ?? "主场";
            const awayName = teams.find(t => t.id === "away")?.name ?? "客场";
            const text = buildShareText(homeName, awayName, score.home, score.away, qs, playerStats);
            return (
              <button
                onClick={() => handleShare(text)}
                className="w-full py-3 rounded-xl text-sm font-bold border active:opacity-80"
                style={{ borderColor: "rgba(249,115,22,0.4)", color: "#F97316", background: "rgba(249,115,22,0.08)" }}
              >
                {copyToast ? "✅ 战报已复制！" : "📤 复制战报"}
              </button>
            );
          })()}
          <button
            onClick={resumeToLive}
            className="w-full py-3 rounded-xl border text-sm font-bold active:opacity-80"
            style={{ borderColor: "rgba(255,255,255,0.15)", color: "#D1D5DB" }}
          >
            📝 补录事件
          </button>
          <Link href={lastGameId ? `/gc/review?gameId=${lastGameId}` : "/gc/review"} className="block">
            <div className="bg-orange-500 text-white text-center font-bold text-sm rounded-xl py-3 active:opacity-80">
              🎬 赛后视频打点 →
            </div>
          </Link>
          <Link href="/gc" className="block">
            <div className="border border-white/20 text-white text-center font-bold text-sm rounded-xl py-3 active:opacity-80 text-center">
              再来一场
            </div>
          </Link>
        </div>

        {/* Share text fallback sheet (clipboard unavailable) */}
        {shareText !== null && (
          <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.72)" }}>
            <div className="w-full rounded-t-3xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
              <div className="text-sm font-bold text-white mb-1">📤 复制战报</div>
              <div className="text-xs text-gray-500 mb-3">长按下方文字 → 全选 → 复制，粘贴到微信群</div>
              <textarea
                readOnly
                value={shareText}
                className="w-full rounded-xl text-xs text-gray-300 p-3 resize-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", height: 200, fontFamily: "monospace" }}
                onFocus={e => e.target.select()}
              />
              <button
                onClick={() => setShareText(null)}
                className="w-full mt-3 py-3 rounded-xl border border-white/15 text-sm text-gray-400"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── LIVE SCOREKEEPING ────────────────────────────────────────────────────────

  const scoring = ACTIONS.filter(a => a.pts > 0);
  const misses  = ACTIONS.filter(a => a.pts === 0 && a.cat.endsWith("_miss"));
  const stats   = ACTIONS.filter(a => a.pts === 0 && !a.cat.endsWith("_miss"));

  // Player picker team (used inside picker sheet)
  const pickerTeam = teams.find(t => t.id === pendingTeam)!;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Quarter + end */}
      <div className="bg-[#1a1d27] border-b border-white/10 px-3 py-2 flex items-center gap-1.5 shrink-0">
        {[1, 2, 3, 4].map(q => (
          <button key={q} onClick={() => setQuarter(q)}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${quarter === q ? "bg-orange-500 text-white" : "text-gray-500"}`}>
            Q{q}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setEndConfirm(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white">
          结束比赛
        </button>
      </div>

      {/* Scoreboard */}
      <div className="bg-[#1a1d27] border-b border-white/10 px-4 py-3 flex items-center justify-between shrink-0 relative">
        <div className="flex-1 text-center">
          <div className="text-xs font-bold text-orange-400 mb-1">{teams.find(t => t.id === "home")?.name ?? "主场"}</div>
          <div className={`text-4xl font-black transition-all ${score.home >= score.away ? "text-orange-400" : "text-gray-500"}`}>{score.home}</div>
          <div className="flex justify-center gap-1 mt-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <button key={i} onClick={() => useTimeout("home")}
                className="w-2 h-2 rounded-full transition-colors"
                style={{ background: i < timeouts.home ? "#F97316" : "rgba(249,115,22,0.2)" }} />
            ))}
          </div>
        </div>
        <div className="px-4 text-center shrink-0">
          <div className="text-xs text-gray-600 mb-0.5">Q{quarter}</div>
          <div className="text-xl font-mono font-bold">{fmt(recSecs)}</div>
          <div className="w-2 h-2 rounded-full bg-red-500 mx-auto mt-1 animate-pulse" />
        </div>
        <div className="flex-1 text-center">
          <div className="text-xs font-bold text-blue-400 mb-1">{teams.find(t => t.id === "away")?.name ?? "客场"}</div>
          <div className={`text-4xl font-black transition-all ${score.away > score.home ? "text-blue-400" : "text-gray-500"}`}>{score.away}</div>
          <div className="flex justify-center gap-1 mt-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <button key={i} onClick={() => useTimeout("away")}
                className="w-2 h-2 rounded-full transition-colors"
                style={{ background: i < timeouts.away ? "#3B82F6" : "rgba(59,130,246,0.2)" }} />
            ))}
          </div>
        </div>
        {lastFlash && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            <div className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 whitespace-nowrap pointer-events-none">
              {lastFlash.label}
            </div>
            <button
              onClick={() => {
                setEvents(prev => prev.filter(e => e.id !== lastFlash.id));
                if (flashRef.current) clearTimeout(flashRef.current);
                setLastFlash(null);
              }}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-gray-400 active:bg-white/20 whitespace-nowrap"
            >
              撤销
            </button>
          </div>
        )}
      </div>

      {/* Quarter score breakdown */}
      {(() => {
        const maxQ = Math.max(quarter, events.length > 0 ? Math.max(...events.map(e => e.quarter)) : 0);
        const qs = Array.from({ length: maxQ }, (_, i) => {
          const q = i + 1;
          const qe = events.filter(e => e.quarter === q);
          return { q, home: qe.filter(e => e.teamId === "home").reduce((s, e) => s + e.pts, 0), away: qe.filter(e => e.teamId === "away").reduce((s, e) => s + e.pts, 0) };
        });
        if (qs.length === 0) return null;
        return (
          <div className="bg-[#1a1d27] border-b border-white/10 px-4 py-1.5 flex items-center justify-center gap-3 shrink-0">
            {qs.map(({ q, home, away }) => (
              <div key={q} className="flex items-center gap-1">
                <span className={`text-[10px] font-bold ${q === quarter ? "text-orange-400" : "text-gray-600"}`}>Q{q}</span>
                <span className={`text-[10px] font-mono ${home > away ? "text-orange-400" : "text-gray-500"}`}>{home}</span>
                <span className="text-[10px] text-gray-700">-</span>
                <span className={`text-[10px] font-mono ${away > home ? "text-blue-400" : "text-gray-500"}`}>{away}</span>
                {q === quarter && <span className="text-[9px] text-orange-500 animate-pulse">▲</span>}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Draft recovery banner */}
      {liveDraft && events.length === 0 && (
        <div className="mx-3 mt-2 px-3 py-2.5 rounded-xl flex items-center gap-2 shrink-0"
          style={{ background: "rgba(249,115,22,0.10)", border: "1px solid rgba(249,115,22,0.35)" }}>
          <span className="text-orange-400 text-sm shrink-0">⚠️</span>
          <span className="flex-1 text-xs text-orange-300">检测到上次未完成打点（{liveDraft.events.length} 个事件 · Q{liveDraft.quarter}）</span>
          <button onClick={() => { setEvents(liveDraft.events); setQuarter(liveDraft.quarter); setLiveDraft(null); }}
            className="text-xs font-bold text-orange-400 px-2 py-1 rounded-lg bg-orange-500/20 active:bg-orange-500/30 shrink-0">
            恢复
          </button>
          <button onClick={() => { setLiveDraft(null); try { localStorage.removeItem("gc_live_draft"); } catch {} }}
            className="text-xs text-gray-600 px-1.5 py-1 shrink-0">
            放弃
          </button>
        </div>
      )}

      {/* Team context indicator */}
      <div className="flex gap-2 px-3 pt-2.5 shrink-0">
        {teams.map(t => (
          <button key={t.id} onClick={() => setSelTeam(t.id)}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={selTeam === t.id ? { background: t.color, color: "#fff" } : { background: "rgba(255,255,255,0.06)", color: "#6B7280" }}>
            {t.name}
          </button>
        ))}
      </div>
      <div className="px-3 pt-1 pb-0.5 shrink-0">
        <div className="text-[10px] text-gray-700 text-center">点击动作按钮，再选球员 → 快速记录</div>
      </div>

      {/* Action buttons — always active, no player pre-selection needed */}
      <div className="grid grid-cols-3 gap-1.5 px-3 pt-1.5 shrink-0">
        {scoring.map(a => (
          <button key={a.cat} onClick={() => startAction(a)}
            className="py-5 rounded-xl font-bold text-sm leading-tight active:scale-95 transition-transform"
            style={{ background: "rgba(249,115,22,0.90)", color: "#fff" }}>
            {a.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5 px-3 pt-1.5 shrink-0">
        {misses.map(a => (
          <button key={a.cat} onClick={() => startAction(a)}
            className="py-3 rounded-xl font-bold text-xs leading-tight active:scale-95 transition-transform"
            style={{ background: "rgba(239,68,68,0.18)", color: "#F87171" }}>
            {a.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5 px-3 pt-1.5 shrink-0">
        {stats.map(a => (
          <button key={a.cat} onClick={() => startAction(a)}
            className="py-2.5 rounded-xl font-bold text-xs leading-tight active:scale-95 transition-transform"
            style={{ background: "rgba(255,255,255,0.10)", color: "#D1D5DB" }}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Event feed */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-600">事件记录 ({events.length})</span>
          <button
            onClick={() => setEvents(prev => prev.slice(1))}
            disabled={events.length === 0}
            className="text-xs font-bold flex items-center gap-0.5 max-w-[58%]"
            style={{ opacity: events.length === 0 ? 0.35 : 1 }}
          >
            {events.length === 0 ? (
              <span className="text-gray-600">↩ 撤销</span>
            ) : (
              <>
                <span className="text-gray-600 shrink-0">↩ </span>
                <span className="text-gray-400 shrink-0">
                  {events[0].playerNum !== "-" ? `#${events[0].playerNum} ` : "全队 "}
                </span>
                <span className="truncate" style={{ color: actionColor(events[0].cat, events[0].pts) }}>
                  {events[0].action}
                </span>
              </>
            )}
          </button>
        </div>
        {events.map(e => {
          const team = teams.find(t => t.id === e.teamId);
          const evtColor = actionColor(e.cat, e.pts);
          const isUnassigned = e.playerName === "未指定";
          return (
            <div key={e.id}
              className={`flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0 ${isUnassigned ? "cursor-pointer rounded active:bg-white/5" : ""}`}
              onClick={isUnassigned ? () => setReassignEvent(e) : undefined}
            >
              <div className="w-1 h-4 rounded-full shrink-0" style={{ background: team?.color ?? "#6B7280" }} />
              <span className="text-xs font-mono text-gray-500 shrink-0 w-10">{fmt(e.videoTs)}</span>
              <span className="flex-1 text-xs truncate">
                <span className={isUnassigned ? "text-orange-400 font-bold" : "text-gray-400"}>
                  {e.playerNum !== "-" ? `#${e.playerNum} ` : ""}
                  {isUnassigned ? "未指定 →" : e.playerName}{" "}
                </span>
                <span style={{ color: evtColor }}>{e.action}</span>
              </span>
              {e.pts > 0 && <span className="text-xs font-bold text-orange-400 shrink-0">+{e.pts}</span>}
              <button
                onClick={(ev) => { ev.stopPropagation(); setEvents(prev => prev.filter(x => x.id !== e.id)); }}
                className="text-gray-700 hover:text-red-400 active:text-red-400 text-xs shrink-0 w-5 text-center"
              >✕</button>
            </div>
          );
        })}
      </div>

      {/* ── Player picker sheet (GameChanger-style) ────────────────────────────── */}
      {pendingAction !== null && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setPendingAction(null); }}>
          <div className="w-full rounded-t-3xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
            {/* Drag handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />

            {/* Action title */}
            <div className="text-center mb-4">
              <div className="text-base font-black text-white">{pendingAction.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">谁做了这个动作？</div>
            </div>

            {/* Team toggle inside picker */}
            <div className="flex gap-2 mb-4">
              {teams.map(t => (
                <button key={t.id} onClick={() => setPendingTeam(t.id)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold"
                  style={pendingTeam === t.id
                    ? { background: t.color, color: "#fff" }
                    : { background: "rgba(255,255,255,0.06)", color: "#6B7280" }}>
                  {t.name}
                </button>
              ))}
            </div>

            {/* Player grid */}
            {pendingTeam === "away" && awayTrackMode === "team" ? (
              <button
                onClick={() => commitAction({ id: TEAM_PLAYER_ID("away"), name: "全队", num: "-" })}
                className="w-full py-6 rounded-2xl mb-3 active:scale-95 transition-transform"
                style={{ background: "rgba(59,130,246,0.20)" }}>
                <div className="text-xl font-black text-blue-400">全队（整队记录）</div>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2.5 mb-4">
                {pickerTeam?.players.map(p => {
                  const fouls = events.filter(e => e.playerId === p.id && e.cat === "foul").length;
                  const inTrouble = fouls >= 3;
                  const fouledOut = fouls >= 5;
                  return (
                    <button key={p.id}
                      onClick={() => commitAction(p)}
                      disabled={fouledOut}
                      className="rounded-2xl py-5 flex flex-col items-center gap-1 active:scale-95 transition-transform relative"
                      style={{
                        background: fouledOut ? "rgba(107,114,128,0.08)" : "rgba(255,255,255,0.07)",
                        opacity: fouledOut ? 0.45 : 1,
                      }}>
                      <span className={`text-2xl font-black ${fouledOut ? "text-gray-600" : "text-white"}`}>{p.num}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{p.name}</span>
                      {fouls > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
                          style={{ background: fouledOut ? "#4B5563" : inTrouble ? "#EF4444" : "#F97316", color: "#fff" }}>
                          {fouls}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Assign Later + Cancel */}
            <button onClick={() => commitAction(null)}
              className="w-full py-3 rounded-xl border border-white/15 text-sm text-gray-400 mb-2">
              稍后指定
            </button>
            <button onClick={() => setPendingAction(null)}
              className="w-full py-2 text-xs text-gray-700">
              取消
            </button>
          </div>
        </div>
      )}

      {/* ── Reassign "未指定" event overlay ────────────────────────────────────── */}
      {reassignEvent !== null && (() => {
        const rTeam = teams.find(t => t.id === reassignEvent.teamId)!;
        const isTeamMode = reassignEvent.teamId === "away" && awayTrackMode === "team";
        function doReassign(player: PlayerRef) {
          setEvents(prev => prev.map(ev => ev.id === reassignEvent!.id
            ? { ...ev, playerId: player.id, playerName: player.name, playerNum: player.num }
            : ev));
          setReassignEvent(null);
        }
        return (
          <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.72)" }}
            onClick={(ev) => { if (ev.target === ev.currentTarget) setReassignEvent(null); }}>
            <div className="w-full rounded-t-3xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
              <div className="text-center mb-4">
                <div className="text-base font-black text-white">补录归属</div>
                <div className="text-xs text-gray-500 mt-0.5">{reassignEvent.action} · {rTeam?.name}</div>
              </div>
              {isTeamMode ? (
                <button onClick={() => doReassign({ id: TEAM_PLAYER_ID("away"), name: "全队", num: "-" })}
                  className="w-full py-6 rounded-2xl mb-3 active:scale-95 transition-transform"
                  style={{ background: "rgba(59,130,246,0.20)" }}>
                  <div className="text-xl font-black text-blue-400">全队（整队记录）</div>
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-2.5 mb-4">
                  {rTeam?.players.map(p => (
                    <button key={p.id} onClick={() => doReassign(p)}
                      className="rounded-2xl py-5 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                      style={{ background: "rgba(255,255,255,0.07)" }}>
                      <span className="text-2xl font-black text-white">{p.num}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setReassignEvent(null)}
                className="w-full py-2 text-xs text-gray-700">
                取消
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Contextual prompt overlay ─────────────────────────────────────────── */}
      {ctxPrompt !== null && pendingAction === null && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.65)" }}>
          <div className="w-full rounded-t-2xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>

            {ctxPrompt.type === "rebound" && (<>
              <div className="text-xs text-gray-400 text-center mb-4 font-medium">谁抢到篮板？</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button onClick={() => logRebound("oreb")}
                  className="py-5 rounded-xl flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ background: "rgba(249,115,22,0.20)" }}>
                  <span className="text-2xl">🔄</span>
                  <span className="text-sm font-bold text-orange-400">进攻篮板</span>
                  <span className="text-xs text-orange-500/70">己方抢到</span>
                </button>
                <button onClick={() => logRebound("dreb")}
                  className="py-5 rounded-xl flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ background: "rgba(59,130,246,0.20)" }}>
                  <span className="text-2xl">🛡️</span>
                  <span className="text-sm font-bold text-blue-400">防守篮板</span>
                  <span className="text-xs text-blue-500/70">对方抢到</span>
                </button>
              </div>
              <button onClick={clearCtx} className="w-full text-xs text-gray-600 py-2 text-center">跳过</button>
            </>)}

            {ctxPrompt.type === "assist" && (<>
              <div className="text-xs text-gray-400 text-center mb-3 font-medium">有助攻？</div>
              <div className="flex flex-wrap gap-2 justify-center mb-3">
                {(() => {
                  const team = teams.find(t => t.id === ctxPrompt.scoringTeam);
                  return team?.players
                    .filter(p => p.id !== ctxPrompt.scorerId)
                    .map(p => (
                      <button key={p.id} onClick={() => logAssist(p.id)}
                        className="px-3 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform"
                        style={{ background: `${team.color}33`, color: team.color }}>
                        #{p.num} {p.name}
                      </button>
                    ));
                })()}
              </div>
              <button onClick={() => {
                const other: TeamId = ctxPrompt.scoringTeam === "home" ? "away" : "home";
                clearCtx();
                switchToTeam(other);
              }} className="w-full text-xs text-gray-600 py-2 text-center">无助攻</button>
            </>)}

            {ctxPrompt.type === "ft_count" && (<>
              <div className="text-xs text-gray-400 text-center mb-4 font-medium">罚球几次？</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                {([1, 2, 3] as const).map(n => (
                  <button key={n} onClick={() => selectFTCount(n)}
                    className="py-4 rounded-xl text-lg font-black active:scale-95 transition-transform"
                    style={{ background: "rgba(249,115,22,0.18)", color: "#F97316" }}>
                    {n}次
                  </button>
                ))}
              </div>
              <button onClick={clearCtx} className="w-full text-xs text-gray-600 py-2 text-center">跳过</button>
            </>)}

            {ctxPrompt.type === "ft_seq" && (<>
              <div className="text-xs text-gray-400 text-center mb-1 font-medium">
                第 {ctxPrompt.current}/{ctxPrompt.total} 次罚球
                {ftShooter && ftShooter.num !== "-" && <span className="text-orange-400 ml-1">#{ftShooter.num} {ftShooter.name}</span>}
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full mb-4">
                <div className="h-1 bg-orange-500 rounded-full transition-all"
                  style={{ width: `${((ctxPrompt.current - 1) / ctxPrompt.total) * 100}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button onClick={() => logFT(true)}
                  className="py-5 rounded-xl flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ background: "rgba(34,197,94,0.20)" }}>
                  <span className="text-2xl">✅</span>
                  <span className="text-sm font-bold text-green-400">命中</span>
                </button>
                <button onClick={() => logFT(false)}
                  className="py-5 rounded-xl flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ background: "rgba(239,68,68,0.18)" }}>
                  <span className="text-2xl">❌</span>
                  <span className="text-sm font-bold text-red-400">不中</span>
                </button>
              </div>
              <button onClick={clearCtx} className="w-full text-xs text-gray-600 py-2 text-center">中止记录</button>
            </>)}

            {ctxPrompt.type === "steal" && (() => {
              const stealTeam = teams.find(t => t.id === ctxPrompt.stealTeam);
              const isTeamMode = ctxPrompt.stealTeam === "away" && awayTrackMode === "team";
              return (<>
                <div className="text-xs text-gray-400 text-center mb-3 font-medium">
                  {stealTeam?.name ?? "对方"} 谁抢断了？
                </div>
                <div className="flex flex-wrap gap-2 justify-center mb-3">
                  {isTeamMode ? (
                    <button onClick={() => logSteal()}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform"
                      style={{ background: `${stealTeam?.color ?? "#3B82F6"}33`, color: stealTeam?.color ?? "#60A5FA" }}>
                      全队
                    </button>
                  ) : (
                    stealTeam?.players.map(p => (
                      <button key={p.id} onClick={() => logSteal(p.id)}
                        className="px-3 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform"
                        style={{ background: `${stealTeam.color}33`, color: stealTeam.color }}>
                        #{p.num} {p.name}
                      </button>
                    ))
                  )}
                </div>
                <button onClick={clearCtx} className="w-full text-xs text-gray-600 py-2 text-center">无抢断</button>
              </>);
            })()}

          </div>
        </div>
      )}

      {endConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="w-full max-w-sm rounded-2xl px-6 py-6" style={{ background: "#1a1d27" }}>
            <div className="text-center mb-5">
              <div className="text-xl font-black text-white mb-2">⚠️ 确认结束比赛？</div>
              <div className="text-xs text-gray-500">结束后可在战报页补录遗漏事件</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEndConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-white/20 text-sm font-bold text-gray-300">
                取消
              </button>
              <button onClick={() => { setEndConfirm(false); endGame(); }}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold">
                确认结束
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
