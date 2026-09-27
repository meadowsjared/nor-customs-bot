import { Player } from '../types/player';

export enum MakeTeamsMode {
  STANDARD = 'standard',
  MIXED_A = 'mixed_a',
  MIXED_B = 'mixed_b',
  DOUBLE_TROUBLE = 'double_trouble',
  FUNZ = 'funz',
}

interface TeamDraftResult {
  team1: Player[];
  team2: Player[];
  spectators: Player[];
}

export interface MakeTeamsChoice {
  name: string;
  value: MakeTeamsMode;
}

export const makeTeamsModeChoices: MakeTeamsChoice[] = [
  { name: 'Standard (Default)', value: MakeTeamsMode.STANDARD },
  { name: 'Mixed A (Balanced)', value: MakeTeamsMode.MIXED_A },
  { name: 'Mixed B (Balanced)', value: MakeTeamsMode.MIXED_B },
  { name: 'Double Trouble (1 & 2 Together)', value: MakeTeamsMode.DOUBLE_TROUBLE },
  { name: 'Funz (Unbalanced)', value: MakeTeamsMode.FUNZ },
];

/**
 * Prefab player rank assignments (1-indexed lobby MMR rank).
 * Works seamlessly for 6, 8, 10, or 10+ player lobbies.
 */
export const TEAM_PREFABS: Record<MakeTeamsMode, { team1: number[]; team2: number[]; }> = {
  [MakeTeamsMode.STANDARD]: {
    team1: [1, 4, 5, 8, 9],
    team2: [2, 3, 6, 7, 10],
  },
  [MakeTeamsMode.MIXED_A]: {
    team1: [1, 3, 5, 8, 10],
    team2: [2, 4, 6, 7, 9],
  },
  [MakeTeamsMode.MIXED_B]: {
    team1: [1, 4, 6, 7, 9],
    team2: [2, 3, 5, 8, 10],
  },
  [MakeTeamsMode.DOUBLE_TROUBLE]: {
    team1: [1, 2, 6, 8, 10],
    team2: [3, 4, 5, 7, 9],
  },
  [MakeTeamsMode.FUNZ]: {
    team1: [1, 7, 8, 9, 10],
    team2: [2, 3, 4, 5, 6],
  },
};

/**
 * Type guard to check if a value is a valid MakeTeamsMode without type assertion.
 */
export function isMakeTeamsMode(value: unknown): value is MakeTeamsMode {
  return Object.values(MakeTeamsMode).some(mode => mode === value);
}

/**
 * Creates teams using the prefab rank arrays.
 */
export function createTeams(
  sortedPlayers: Player[],
  mode: MakeTeamsMode = MakeTeamsMode.STANDARD,
  maxPlayersPerTeam: number = 5,
): TeamDraftResult {
  const prefab = TEAM_PREFABS[mode] ?? TEAM_PREFABS[MakeTeamsMode.STANDARD];
  const team1Set = new Set(prefab.team1);
  const team2Set = new Set(prefab.team2);

  const team1: Player[] = [];
  const team2: Player[] = [];
  const spectators: Player[] = [];

  sortedPlayers.forEach((p, index) => {
    const rank = index + 1;
    if (team1Set.has(rank) && team1.length < maxPlayersPerTeam) {
      p.draftOrder = rank;
      p.lobbyRank = index;
      p.team = 1;
      team1.push(p);
    } else if (team2Set.has(rank) && team2.length < maxPlayersPerTeam) {
      p.draftOrder = rank;
      p.lobbyRank = index;
      p.team = 2;
      team2.push(p);
    } else {
      p.draftOrder = NaN;
      p.lobbyRank = NaN;
      p.team = 0;
      spectators.push(p);
    }
  });

  return { team1, team2, spectators };
}

