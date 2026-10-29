import { createRequire } from 'module'
import path from 'path'
import type { HotSReplayObject, ReplayData } from '../types/replay'

const require = createRequire(import.meta.url)

type HeroProtocolDetailsPlayer = {
  m_name?: string | Buffer
  m_hero?: string | Buffer
}

type HeroProtocolDetails = {
  m_playerList?: HeroProtocolDetailsPlayer[]
}

/**
 * Parses a Heroes of the Storm replay file using hots-parser and extracts relevant information.
 * Isolated from Discord and DB layers so it can safely run in background worker threads.
 *
 * @param file The path to the replay file
 */
export function parseReplaySync(file: string): ReplayData | null {
  try {
    const Parser: {
      processReplay: (filePath: string, options: { overrideVerifiedBuild: boolean }) => HotSReplayObject | null
    } = require('hots-parser')
    const replay = Parser.processReplay(file, {
      overrideVerifiedBuild: true,
    })
    if (!replay || !replay.match) {
      console.error(`Invalid or incomplete replay data for file: ${file}`)
      return null
    }

    if (!replay.match.filename) {
      replay.match.filename = file
    }

    let mapName = replay.match.map
    if (mapName === 'Garden of Terror') {
      const fileNameLower = file.toLowerCase()
      if (fileNameLower.includes('classic')) {
        mapName = 'Garden of Terror Classic'
        replay.match.map = mapName
      }
    }

    const players = Object.values(replay.players)

    // Check if any player has an unknown or missing hero (e.g. from Auto-Select in custom lobbies)
    try {
      const heroprotocol: {
        DETAILS: string
        get: (part: string, filePath: string) => HeroProtocolDetails | null
      } = require('heroprotocol')
      const details = heroprotocol.get(heroprotocol.DETAILS, file)
      if (details && Array.isArray(details.m_playerList)) {
        for (const player of players) {
          if (!player.hero || player.hero === 'Unknown' || player.hero === 'RAND' || player.hero === 'Auto') {
            const match = details.m_playerList.find(p => {
              const nameStr = p.m_name ? (typeof p.m_name === 'string' ? p.m_name : p.m_name.toString('utf8')) : ''
              return nameStr === player.name
            })
            if (match && match.m_hero) {
              let heroName = typeof match.m_hero === 'string' ? match.m_hero : match.m_hero.toString('utf8')
              if (heroName === 'Lúcio') heroName = 'Lucio'
              player.hero = heroName
            }
          }
        }
      }
    } catch {
      // Ignore if details cannot be parsed
    }

    const formatPlayerEntry = (p: { name: string; tag: number; hero?: string }) => {
      const heroStr = p.hero ? ` (${p.hero})` : ''
      return `${p.name}#${p.tag}${heroStr}`
    }

    const team0Players = players
      .filter(p => p.team === 0)
      .map(formatPlayerEntry)
      .join(', ')
    const team1Players = players
      .filter(p => p.team === 1)
      .map(formatPlayerEntry)
      .join(', ')

    return {
      replayObj: replay,
      map: mapName,
      date: replay.match.date,
      type: replay.match.type,
      mode: replay.match.mode,
      length: replay.match.length,
      winner: replay.match.winner,
      team0Takedowns: replay.match.team0Takedowns,
      team1Takedowns: replay.match.team1Takedowns,
      team0Players,
      team1Players,
      file,
    }
  } catch (error) {
    console.error(`Error parsing replay file ${file}:`, error)
    return null
  }
}

/**
 * Async wrapper for backward compatibility with existing callers.
 */
export async function parseReplay(file: string): Promise<ReplayData | null> {
  return parseReplaySync(file)
}
