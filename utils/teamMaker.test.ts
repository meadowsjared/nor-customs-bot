import { describe, expect, it } from 'bun:test'
import { createTeams, isMakeTeamsMode, MakeTeamsMode } from './teamMaker'
import { Player } from '../types/player'

function makeMockPlayer(index: number, mmr: number): Player {
  return {
    discordId: `user_${index}`,
    usernames: {
      discordName: `player_${index}`,
      discordDisplayName: `Player ${index}`,
      discordGlobalName: `Player ${index}`,
    },
    active: true,
    mmr,
    lastActive: new Date(),
    team: null,
    lobbyRank: NaN,
    draftOrder: NaN,
    adjustment: null,
  }
}

describe('teamMaker.createTeams', () => {
  it('creates two balanced 5-player teams in Standard mode', () => {
    // 10 players sorted descending by MMR
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 100))

    const start = performance.now()
    const { team1, team2, spectators } = createTeams(players, MakeTeamsMode.STANDARD, 5)
    const durationMs = performance.now() - start

    expect(team1.length).toBe(5)
    expect(team2.length).toBe(5)
    expect(spectators.length).toBe(0)

    // Standard mode: Team 1 has ranks 1, 4, 5, 8, 9 (indices 0, 3, 4, 7, 8)
    expect(team1.map(p => p.discordId)).toEqual(['user_1', 'user_4', 'user_5', 'user_8', 'user_9'])
    // Team 2 has ranks 2, 3, 6, 7, 10 (indices 1, 2, 5, 6, 9)
    expect(team2.map(p => p.discordId)).toEqual(['user_2', 'user_3', 'user_6', 'user_7', 'user_10'])

    // Performance assertion: pure algorithmic team creation should take under 1ms
    expect(durationMs).toBeLessThan(5)
  })

  it('puts excess players beyond 10 into spectators', () => {
    const players = Array.from({ length: 13 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 50))
    const { team1, team2, spectators } = createTeams(players, MakeTeamsMode.STANDARD, 5)

    expect(team1.length).toBe(5)
    expect(team2.length).toBe(5)
    expect(spectators.length).toBe(3)
    expect(spectators.map(p => p.discordId)).toEqual(['user_11', 'user_12', 'user_13'])
  })

  it('handles Double Trouble mode (ranks 1 and 2 on Team 1)', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 100))
    const { team1, team2 } = createTeams(players, MakeTeamsMode.DOUBLE_TROUBLE, 5)

    // Team 1: 1, 2, 6, 8, 10
    expect(team1.map(p => p.discordId)).toEqual(['user_1', 'user_2', 'user_6', 'user_8', 'user_10'])
    // Team 2: 3, 4, 5, 7, 9
    expect(team2.map(p => p.discordId)).toEqual(['user_3', 'user_4', 'user_5', 'user_7', 'user_9'])
  })

  it('handles Mixed A mode (ranks 1, 3, 5, 8, 10 on Team 1)', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 100))
    const { team1, team2 } = createTeams(players, MakeTeamsMode.MIXED_A, 5)

    expect(team1.map(p => p.discordId)).toEqual(['user_1', 'user_3', 'user_5', 'user_8', 'user_10'])
    expect(team2.map(p => p.discordId)).toEqual(['user_2', 'user_4', 'user_6', 'user_7', 'user_9'])
  })

  it('handles Mixed B mode (ranks 1, 4, 6, 7, 9 on Team 1)', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 100))
    const { team1, team2 } = createTeams(players, MakeTeamsMode.MIXED_B, 5)

    expect(team1.map(p => p.discordId)).toEqual(['user_1', 'user_4', 'user_6', 'user_7', 'user_9'])
    expect(team2.map(p => p.discordId)).toEqual(['user_2', 'user_3', 'user_5', 'user_8', 'user_10'])
  })

  it('handles Funz mode (ranks 1, 7, 8, 9, 10 on Team 1 vs 2, 3, 4, 5, 6 on Team 2)', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 100))
    const { team1, team2 } = createTeams(players, MakeTeamsMode.FUNZ, 5)

    expect(team1.map(p => p.discordId)).toEqual(['user_1', 'user_7', 'user_8', 'user_9', 'user_10'])
    expect(team2.map(p => p.discordId)).toEqual(['user_2', 'user_3', 'user_4', 'user_5', 'user_6'])
  })

  it('benchmarks performance with 1,000 team assignments under 50ms', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 2500))

    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      createTeams(players, MakeTeamsMode.STANDARD, 5)
    }
    const durationMs = performance.now() - start

    expect(durationMs).toBeLessThan(50)
  })
})

describe('teamMaker.isMakeTeamsMode', () => {
  it('returns true for valid MakeTeamsMode values', () => {
    expect(isMakeTeamsMode('standard')).toBe(true)
    expect(isMakeTeamsMode('mixed_a')).toBe(true)
    expect(isMakeTeamsMode('mixed_b')).toBe(true)
    expect(isMakeTeamsMode('double_trouble')).toBe(true)
    expect(isMakeTeamsMode('funz')).toBe(true)
  })

  it('returns false for invalid values', () => {
    expect(isMakeTeamsMode('invalid_mode')).toBe(false)
    expect(isMakeTeamsMode('')).toBe(false)
    expect(isMakeTeamsMode(123)).toBe(false)
    expect(isMakeTeamsMode(null)).toBe(false)
    expect(isMakeTeamsMode(undefined)).toBe(false)
  })
})

