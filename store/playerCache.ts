import { ButtonInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js'
import { Player } from '../types/player'

const INTERACTION_TTL_MS = 15 * 60 * 1000

export const interactionStore = new Map<string, ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>>()
const interactionTimestamps = new Map<string, number>()

const playerDisplayNameCache = new Map<string, string>()
const activePlayersCache = new Map<string, { data: Player[]; timestamp: number }>()
const activeMmrLoadingTags = new Set<string>()

export function cachePlayerDisplayName(
  discordId: string | null | undefined,
  displayName?: string | null,
  globalName?: string | null,
  name?: string | null
): void {
  if (!discordId) return
  const resolved = displayName || globalName || name
  if (resolved) {
    playerDisplayNameCache.set(discordId, resolved)
  }
}

export function getCachedPlayerDisplayName(discordId: string): string | undefined {
  return playerDisplayNameCache.get(discordId)
}

function getInteractionKey(messageId: string, channelId: string): string {
  return `${channelId}-${messageId}`
}

function pruneExpiredInteractions(): void {
  const now = Date.now()
  for (const [key, timestamp] of interactionTimestamps) {
    if (now - timestamp > INTERACTION_TTL_MS) {
      interactionStore.delete(key)
      interactionTimestamps.delete(key)
    }
  }
}

/**
 * Stores an interaction in the interaction store, pruning expired interactions (> 15 minutes old).
 */
export function storeInteraction(
  messageId: string,
  channelId: string,
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
): void {
  pruneExpiredInteractions()
  const key = getInteractionKey(messageId, channelId)
  interactionStore.set(key, interaction)
  interactionTimestamps.set(key, Date.now())
}

/**
 * Removes a stored interaction from the interaction store.
 */
export function removeInteraction(messageId: string, channelId: string): void {
  const key = getInteractionKey(messageId, channelId)
  interactionStore.delete(key)
  interactionTimestamps.delete(key)
}

/**
 * Retrieves a stored interaction from the interaction store.
 */
export function getStoredInteraction(
  messageId: string,
  channelId: string
): ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | undefined {
  pruneExpiredInteractions()
  const key = getInteractionKey(messageId, channelId)
  return interactionStore.get(key)
}

export function clearActivePlayersCache(guildId?: string): void {
  if (guildId) {
    activePlayersCache.delete(guildId)
  } else {
    activePlayersCache.clear()
  }
}

export function getActivePlayersCacheEntry(guildId: string): { data: Player[]; timestamp: number } | undefined {
  return activePlayersCache.get(guildId)
}

export function setActivePlayersCacheEntry(guildId: string, data: Player[]): void {
  activePlayersCache.set(guildId, { data, timestamp: Date.now() })
}

/**
 * Checks if MMR is currently being fetched in the background for a BattleTag.
 */
export function isFetchingMmr(battleTag: string): boolean {
  return activeMmrLoadingTags.has(battleTag.toLowerCase())
}

export function addFetchingMmrTag(battleTag: string): void {
  activeMmrLoadingTags.add(battleTag.toLowerCase())
}

export function removeFetchingMmrTag(battleTag: string): void {
  activeMmrLoadingTags.delete(battleTag.toLowerCase())
}

