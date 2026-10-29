import { describe, expect, it } from 'bun:test'
import {
  storeInteraction,
  getStoredInteraction,
  removeInteraction,
  cachePlayerDisplayName,
  getCachedPlayerDisplayName,
  isFetchingMmr,
  addFetchingMmrTag,
  removeFetchingMmrTag,
  interactionStore,
} from './playerCache'
import { ChatInputCommandInteraction } from 'discord.js'

function createMockInteraction(id: string): ChatInputCommandInteraction {
  return Object.assign(Object.create(ChatInputCommandInteraction.prototype), { id })
}

describe('store.playerCache', () => {
  it('stores and retrieves interactions by messageId and channelId', () => {
    const mockInteraction = createMockInteraction('interaction_1')

    storeInteraction('msg_100', 'chan_200', mockInteraction)
    const retrieved = getStoredInteraction('msg_100', 'chan_200')

    expect(retrieved).toBe(mockInteraction)

    removeInteraction('msg_100', 'chan_200')
    expect(getStoredInteraction('msg_100', 'chan_200')).toBeUndefined()
  })

  it('prunes expired interactions older than 15 minutes TTL', () => {
    const mockInteraction = createMockInteraction('old_interaction')

    storeInteraction('old_msg', 'old_chan', mockInteraction)
    const key = 'old_chan-old_msg'

    // Simulate passage of time past 15-minute TTL without modifying store internals
    const originalDateNow = Date.now
    try {
      Date.now = () => originalDateNow() + 16 * 60 * 1000

      // Next access should prune it
      const result = getStoredInteraction('old_msg', 'old_chan')
      expect(result).toBeUndefined()
      expect(interactionStore.has(key)).toBe(false)
    } finally {
      Date.now = originalDateNow
    }
  })

  it('caches and retrieves player display names', () => {
    cachePlayerDisplayName('user_abc', 'ArthasMenethil')
    expect(getCachedPlayerDisplayName('user_abc')).toBe('ArthasMenethil')
    expect(getCachedPlayerDisplayName('unknown_user')).toBeUndefined()
  })

  it('tracks MMR fetching status tags', () => {
    expect(isFetchingMmr('Hero#1234')).toBe(false)

    addFetchingMmrTag('Hero#1234')
    expect(isFetchingMmr('Hero#1234')).toBe(true)

    removeFetchingMmrTag('Hero#1234')
    expect(isFetchingMmr('Hero#1234')).toBe(false)
  })
})
