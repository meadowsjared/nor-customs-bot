import { describe, expect, it } from 'bun:test'
import { getCurrentDraftTurn, getFirstPickTeam } from './draft'
import { DraftCoinState } from '../types/player'

describe('draft.getCurrentDraftTurn', () => {
  // 1-2-2-1-1-2-2-1 rotation
  it('correctly calculates the first pick for Team 1', () => {
    // 2 captains already picked (1 on team 1, 1 on team 2)
    const turn = getCurrentDraftTurn({ 1: 1, 2: 1 }, 10, 1)
    expect(turn.isComplete).toBe(false)
    expect(turn.currentTeam).toBe(1)
    expect(turn.picksRemaining).toBe(1)
    expect(turn.activePickIndex).toBe(0)
  })

  it('correctly calculates Team 2 double pick turn after Team 1 makes 1st pick', () => {
    // Team 1 picked 1 (now 2 players), Team 2 has 1 player
    const turn = getCurrentDraftTurn({ 1: 2, 2: 1 }, 10, 1)
    expect(turn.isComplete).toBe(false)
    expect(turn.currentTeam).toBe(2)
    expect(turn.picksRemaining).toBe(2)
  })

  it('correctly calculates turns when Team 2 has first pick', () => {
    // Team 2 first pick
    const initialTurn = getCurrentDraftTurn({ 1: 1, 2: 1 }, 10, 2)
    expect(initialTurn.isComplete).toBe(false)
    expect(initialTurn.currentTeam).toBe(2)
    expect(initialTurn.picksRemaining).toBe(1)

    // After Team 2 picks, Team 1 gets double pick
    const secondTurn = getCurrentDraftTurn({ 1: 1, 2: 2 }, 10, 2)
    expect(secondTurn.currentTeam).toBe(1)
    expect(secondTurn.picksRemaining).toBe(2)
  })

  it('correctly reports draft complete when both teams have 5 players', () => {
    const turn = getCurrentDraftTurn({ 1: 5, 2: 5 }, 10, 1)
    expect(turn.isComplete).toBe(true)
    expect(turn.picksRemaining).toBe(0)
  })

  it('benchmarks 10,000 turn calculations in under 30ms', () => {
    const start = performance.now()
    for (let i = 0; i < 10000; i++) {
      getCurrentDraftTurn({ 1: 3, 2: 2 }, 10, 1)
    }
    const durationMs = performance.now() - start
    expect(durationMs).toBeLessThan(30)
  })
})

describe('draft.getFirstPickTeam', () => {
  it('returns 1 if coin state is null or incomplete', () => {
    expect(getFirstPickTeam(null)).toBe(1)
    expect(getFirstPickTeam({ status: 'awaiting_call', callerTeam: 1 })).toBe(1)
  })

  it('returns explicit firstPickTeam if set', () => {
    const state: DraftCoinState = {
      status: 'completed',
      callerTeam: 1,
      isFirstPick: true,
      firstPickTeam: 2,
    }
    expect(getFirstPickTeam(state)).toBe(2)
  })

  it('awards first pick to winner when winner chooses 1st pick', () => {
    // Team 1 called heads, flip was heads -> Team 1 won and chose 1st pick
    const state: DraftCoinState = {
      status: 'completed',
      callerTeam: 1,
      call: 'heads',
      flipResult: 'heads',
      isFirstPick: true,
    }
    expect(getFirstPickTeam(state)).toBe(1)
  })

  it('awards first pick to loser when winner chooses following two (second pick)', () => {
    // Team 1 called heads, flip was heads -> Team 1 won and chose following two (isFirstPick: false)
    const state: DraftCoinState = {
      status: 'completed',
      callerTeam: 1,
      call: 'heads',
      flipResult: 'heads',
      isFirstPick: false,
    }
    expect(getFirstPickTeam(state)).toBe(2)
  })
})
