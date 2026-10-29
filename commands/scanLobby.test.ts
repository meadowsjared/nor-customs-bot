import { describe, expect, it } from 'bun:test'
import { formatScanSummaryMessage, matchesScanList } from './scanLobby'
import { Player } from '../types/player'
import { ScanLobbySummary } from '../utils/lobbyScanner'

function createMockScanPlayer(
  discordId: string | null,
  tags: string[],
  guestAccountId?: number
): Player {
  return {
    discordId,
    usernames: {
      discordName: 'user',
      discordDisplayName: 'User',
      discordGlobalName: 'User',
      accounts: tags.map((tag, idx) => ({
        id: guestAccountId && idx === 0 ? guestAccountId : idx + 1,
        hotsBattleTag: tag,
        isPrimary: true,
        hpQmMMR: null,
        hpSlMMR: null,
        hpArMMR: null,
        hpQmGames: null,
        hpSlGames: null,
        hpArGames: null,
      })),
    },
    active: true,
    lastActive: new Date(),
    team: null,
    lobbyRank: NaN,
    draftOrder: NaN,
    adjustment: null,
    mmr: 0,
  }
}

describe('commands.scanLobby.matchesScanList', () => {
  it('matches by Discord ID directly', () => {
    const player = createMockScanPlayer('123456789', ['Arthas#1234'])
    expect(matchesScanList(player, ['123456789'])).toBe(true)
    expect(matchesScanList(player, ['987654321'])).toBe(false)
  })

  it('matches by full HotS BattleTag (case-insensitive)', () => {
    const player = createMockScanPlayer('123456789', ['Arthas#1234'])
    expect(matchesScanList(player, ['Arthas#1234'])).toBe(true)
    expect(matchesScanList(player, ['arthas#1234'])).toBe(true)
    expect(matchesScanList(player, ['ARTHAS#1234'])).toBe(true)
    expect(matchesScanList(player, ['Jaina#5678'])).toBe(false)
  })

  it('matches by BattleTag prefix without hash number (OCR lobby screenshot view)', () => {
    // In-game lobby displays only the player name, e.g. "Arthas"
    const player = createMockScanPlayer('123456789', ['Arthas#1234'])
    expect(matchesScanList(player, ['Arthas'])).toBe(true)
    expect(matchesScanList(player, ['arthas'])).toBe(true)
    expect(matchesScanList(player, ['Illidan'])).toBe(false)
  })

  it('matches across any of the player multiple linked accounts', () => {
    const player = createMockScanPlayer('123456789', ['Main#1111', 'Smurf#2222'])
    expect(matchesScanList(player, ['Main'])).toBe(true)
    expect(matchesScanList(player, ['Smurf'])).toBe(true)
    expect(matchesScanList(player, ['smurf#2222'])).toBe(true)
    expect(matchesScanList(player, ['ThirdAccount'])).toBe(false)
  })

  it('matches guest accounts without Discord ID via rowId identifier', () => {
    const guest = createMockScanPlayer(null, ['Guest#9999'], 999)
    expect(matchesScanList(guest, ['hotsRowId:999'])).toBe(true)
    expect(matchesScanList(guest, ['Guest'])).toBe(true)
  })
})

describe('commands.scanLobby.formatScanSummaryMessage', () => {
  it('formats summary with newly added and already active players', () => {
    const summary: ScanLobbySummary = {
      newlyAdded: [{ discordId: '101', name: 'PlayerOne', hotsBattleTag: 'PlayerOne#1234' }],
      alreadyActive: [{ discordId: '102', name: 'PlayerTwo', hotsBattleTag: 'PlayerTwo#5678' }],
      unregistered: [],
      missingFromScreenshot: [],
      removed: [],
      totalLobbyCount: 2,
      team1DiscordIds: [],
      team2DiscordIds: [],
    }

    const message = formatScanSummaryMessage(summary)
    expect(message).toContain('### 📸 HotS Lobby Scan Results')
    expect(message).toContain('🟢 **Added (1):** @PlayerOne (`PlayerOne`)')
    expect(message).toContain('👥 **Already Active (1):** @PlayerTwo')
  })

  it('formats missing and unregistered players', () => {
    const summary: ScanLobbySummary = {
      newlyAdded: [],
      alreadyActive: [],
      unregistered: ['MysteryGamer', 'Shadow'],
      missingFromScreenshot: [{ discordId: '103', name: 'AFKPlayer' }],
      removed: [],
      totalLobbyCount: 0,
      team1DiscordIds: [],
      team2DiscordIds: [],
    }

    const message = formatScanSummaryMessage(summary)
    expect(message).toContain('⚠️ **Missing from HotS Lobby (1):** @AFKPlayer')
    expect(message).toContain('❓ **Unregistered in Bot (2):** `MysteryGamer`, `Shadow`')
  })

  it('formats captain detection', () => {
    const summary: ScanLobbySummary = {
      newlyAdded: [{ discordId: '101', name: 'CaptainOne', hotsBattleTag: 'CaptainOne#1111' }],
      alreadyActive: [{ discordId: '102', name: 'CaptainTwo', hotsBattleTag: 'CaptainTwo#2222' }],
      unregistered: [],
      missingFromScreenshot: [],
      removed: [],
      totalLobbyCount: 2,
      team1DiscordIds: [],
      team2DiscordIds: [],
      team1CaptainDiscordId: '101',
      team2CaptainDiscordId: '102',
    }

    const message = formatScanSummaryMessage(summary)
    expect(message).toContain('👑 **Captains:** Team 1: @CaptainOne | Team 2: @CaptainTwo')
  })
})
