// Shared team/player config for GC live and review pages

export type TeamId = "home" | "away";

export interface PlayerConfig {
  num: string;
  name: string;
}

export interface TeamConfig {
  name: string;
  color: string;
  players: PlayerConfig[];
}

export interface TeamsConfig {
  home: TeamConfig;
  away: TeamConfig;
}

export interface RuntimePlayer {
  id: string;
  num: string;
  name: string;
}

export interface RuntimeTeam {
  id: TeamId;
  name: string;
  color: string;
  players: RuntimePlayer[];
}

export const DEFAULT_TEAMS: TeamsConfig = {
  home: {
    name: "PAB篮球",
    color: "#F97316",
    players: [
      { num: "3",  name: "蒋皓博" },
      { num: "10", name: "王弘涛" },
      { num: "7",  name: "李逸凡" },
      { num: "14", name: "张博宇" },
      { num: "25", name: "陈雨轩" },
    ],
  },
  away: {
    name: "STB铁骑",
    color: "#3B82F6",
    players: [
      { num: "25", name: "黄天翔" },
      { num: "88", name: "汤艺豪" },
      { num: "49", name: "杨光"   },
      { num: "0",  name: "范品维" },
      { num: "97", name: "叶飞"   },
    ],
  },
};

const LS_KEY = "gc_teams_config";

export function loadTeamsConfig(): TeamsConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as TeamsConfig;
  } catch {}
  return DEFAULT_TEAMS;
}

export function saveTeamsConfig(cfg: TeamsConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch {}
}

export function teamsFromConfig(cfg: TeamsConfig): RuntimeTeam[] {
  return [
    {
      id: "home",
      name: cfg.home.name,
      color: cfg.home.color,
      players: cfg.home.players.map((p, i) => ({ id: `p${i + 1}`, ...p })),
    },
    {
      id: "away",
      name: cfg.away.name,
      color: cfg.away.color,
      players: cfg.away.players.map((p, i) => ({ id: `p${i + 6}`, ...p })),
    },
  ];
}
