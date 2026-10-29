import {
  AutocompleteInteraction,
  ButtonInteraction,
  CacheType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuInteraction,
} from 'discord.js'
import fs from 'fs'
import path from 'path'
import { CommandIds } from '../constants'
import {
  getRecentReplays,
  getReplayPlayers,
  getReplaySummary,
  isReplayImported,
  optimizeDb,
  parseReplay,
  reassignReplayPlayer,
  RecentReplaySummary,
  ReplayPlayerInfo,
  saveReplayToDb,
} from '../store/hotsReplays'
import { getAssignAccountChoices } from '../store/player'
import { ReplayData } from '../types/replay'
import { requireGuildId, safeReply } from '../utils/interaction'
import { updateLobbyMessage } from './lobby'
import { formatDateToMMDDYYYY, userIsAdmin } from './shared'

const REPLAY_SOURCE_DIR = '/mnt/HotsBandayd'
const REPLAY_DEST_DIR = '/mnt/CustomsCruncher'

export function findStormReplays(dir: string): string[] {
  let files: string[] = []
  try {
    if (!fs.existsSync(dir)) return []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files = files.concat(findStormReplays(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.StormReplay')) {
        files.push(fullPath)
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dir} for replays:`, error)
  }
  return files
}

/**
 * Sorts replay file paths newest-first while calling `fs.statSync` only once per file (`O(N)` instead of `O(N log N)`).
 */
function sortReplayFilesNewestFirst(files: string[]): Array<{ file: string; mtime: number }> {
  const withStats = files.map(file => {
    try {
      return { file, mtime: fs.statSync(file).mtime.getTime() }
    } catch {
      return { file, mtime: 0 }
    }
  })
  withStats.sort((a, b) => b.mtime - a.mtime)
  return withStats
}

interface ReplayFilterParams {
  startDate: Date | null
  endDate: Date | null
  maxFilesLimit: number | null
}

function parseReplayFilterParams(rawStartInput?: string | null, rawEndInput?: string | null): ReplayFilterParams {
  let maxFilesLimit: number | null = null
  let startDate: Date | null = null
  let endDate: Date | null = null

  if (rawStartInput && rawStartInput.trim() !== '') {
    const trimmed = rawStartInput.trim()
    if (/^\d+$/.test(trimmed)) {
      maxFilesLimit = parseInt(trimmed, 10)
    } else {
      startDate = parseSingleDate(trimmed, false)
    }
  } else {
    maxFilesLimit = 8
  }

  if (rawEndInput && rawEndInput.trim() !== '') {
    endDate = parseSingleDate(rawEndInput.trim(), true)
  }

  return { startDate, endDate, maxFilesLimit }
}

function parseSingleDate(inputStr: string, isEndOfDay: boolean): Date | null {
  const now = new Date()
  const lower = inputStr.toLowerCase()

  if (lower === 'yesterday') {
    return isEndOfDay
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
  }
  if (lower === 'today') {
    return isEndOfDay
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  }

  let str = inputStr
  if (/^\d{1,2}[\/\-]\d{1,2}$/.test(str)) {
    str = `${str}/${now.getFullYear()}`
  }

  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    return isEndOfDay
      ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999)
      : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0)
  }
  return null
}

function isReplayInFilterRange(
  file: string,
  replayDate: string | number | Date | null | undefined,
  startDate: Date | null,
  endDate: Date | null
): boolean {
  let fileTime: number | null = null

  if (replayDate) {
    try {
      const d = new Date(replayDate)
      if (!isNaN(d.getTime())) {
        fileTime = d.getTime()
      }
    } catch {}
  }

  if (fileTime === null) {
    try {
      fileTime = fs.statSync(file).mtime.getTime()
    } catch {}
  }

  if (fileTime === null) {
    const fileName = path.basename(file)
    const match = fileName.match(/^(\d{4})[._-](\d{2})[._-](\d{2})/)
    if (match) {
      const fileDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), 12, 0, 0)
      if (!isNaN(fileDate.getTime())) {
        fileTime = fileDate.getTime()
      }
    }
  }

  if (fileTime === null) return true

  if (startDate && fileTime < startDate.getTime()) return false
  if (endDate && fileTime > endDate.getTime()) return false

  return true
}

function formatReplayPlayerLine(p: ReplayPlayerInfo): string {
  const baseTag = p.hots_battle_tag.split('#')[0]
  const heroName = p.hero || 'Unknown'
  const isSub = Boolean(p.owner_discord_id && p.owner_discord_id !== p.discord_id)

  if (isSub) {
    const subName = p.substitute_display_name || 'sub'
    return `**${baseTag}** (${heroName}) 🔄 sub: **${subName}**`
  }
  return `**${baseTag}** (${heroName})`
}

/**
 * Builds a standardized Discord Embed for a replay, fetching resolved players and substitutions from DB.
 */
export async function buildReplayOverviewEmbed(
  replayOrId: RecentReplaySummary | number,
  fileName?: string
): Promise<EmbedBuilder> {
  const r: RecentReplaySummary =
    typeof replayOrId === 'number'
      ? ((await getReplaySummary(replayOrId)) ?? {
          id: replayOrId,
          map: 'Unknown Map',
          date: '',
          length: null,
          winner: null,
          team0Takedowns: null,
          team1Takedowns: null,
        })
      : replayOrId

  const durationMin = r.length ? Math.floor(r.length / 60) : 0
  const durationSec = r.length ? Math.floor(r.length % 60) : 0
  const durationStr = r.length ? `${durationMin}m ${durationSec}s` : 'Unknown'
  const dateStr = r.date ? formatDateToMMDDYYYY(new Date(r.date)) : 'Unknown'

  const players = await getReplayPlayers(r.id)
  const bluePlayers = players.filter(p => p.team === 0).map(formatReplayPlayerLine)
  const redPlayers = players.filter(p => p.team === 1).map(formatReplayPlayerLine)

  const isBlueWin = r.winner === 0
  const isRedWin = r.winner === 1
  const embedColor = isBlueWin ? 0x2b82d9 : isRedWin ? 0xd9382b : 0x5865f2

  let description = `⏱️ **Duration:** ${durationStr}  •  📅 **Date:** ${dateStr}`
  if (
    r.team0Takedowns !== null &&
    r.team0Takedowns !== undefined &&
    r.team1Takedowns !== null &&
    r.team1Takedowns !== undefined
  ) {
    const winnerText = isBlueWin ? '🔵 Blue Team' : isRedWin ? '🔴 Red Team' : 'Unknown'
    description += `\n🎯 **Score:** Blue **${r.team0Takedowns}** - **${r.team1Takedowns}** Red  •  🏆 **Winner:** ${winnerText}`
  }

  const footerText = fileName ? `File: ${fileName} • Replay ID: ${r.id}` : `Replay ID: ${r.id}`

  return new EmbedBuilder()
    .setTitle(`#${r.id} — ${r.map ?? 'Unknown Map'}`)
    .setColor(embedColor)
    .setDescription(description)
    .addFields(
      {
        name: `🔵 Blue Team ${isBlueWin ? '🏆' : ''}`,
        value: bluePlayers.length > 0 ? bluePlayers.join('\n') : '*No players recorded*',
        inline: true,
      },
      {
        name: `🔴 Red Team ${isRedWin ? '🏆' : ''}`,
        value: redPlayers.length > 0 ? redPlayers.join('\n') : '*No players recorded*',
        inline: true,
      }
    )
    .setFooter({
      text: footerText,
    })
}

/**
 * Shared helper that saves a parsed custom replay to DB, copies the file to `/mnt/CustomsCruncher`,
 * and builds its overview embed.
 */
async function saveAndCopyCustomReplay(
  file: string,
  replayData: ReplayData,
  guildId: string
): Promise<EmbedBuilder> {
  const fileName = path.basename(file)
  const replayId = await saveReplayToDb(replayData, guildId)
  const destPath = path.join(REPLAY_DEST_DIR, fileName)
  try {
    fs.copyFileSync(file, destPath)
  } catch (error) {
    console.error('Error copying replay:', fileName, error)
  }
  return await buildReplayOverviewEmbed(replayId, fileName)
}

/**
 * Sends a list of replay embeds in batches of 5 to respect Discord limits.
 */
async function sendReplayEmbedBatches(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  headerMessage: string,
  embeds: EmbedBuilder[],
  numTotalFiles?: number
): Promise<void> {
  const batchSize = 5

  for (let i = 0; i < embeds.length; i += batchSize) {
    const batch = embeds.slice(i, i + batchSize)
    if (i === 0) {
      await interaction.editReply({
        content: headerMessage,
        embeds: batch,
      })
    } else {
      await interaction.followUp({
        flags: MessageFlags.Ephemeral,
        embeds: batch,
      })
    }
  }

  if (numTotalFiles && numTotalFiles > embeds.length) {
    await interaction.followUp({
      flags: MessageFlags.Ephemeral,
      content: `Finished importing **${embeds.length.toLocaleString('en-US')}** customs files from ${numTotalFiles.toLocaleString('en-US')}.`,
    })
  }
}

/**
 * Synchronizes recent replays without requiring parameters by checking newest files backwards
 * and importing unimported custom games chronologically.
 */
export async function syncRecentReplays(
  guildId: string
): Promise<{ importedCount: number; embeds: EmbedBuilder[] }> {
  let files: string[] = []
  try {
    files = findStormReplays(REPLAY_SOURCE_DIR)
  } catch (error) {
    console.error('Error reading replay folder for sync:', error)
    return { importedCount: 0, embeds: [] }
  }

  if (files.length === 0) {
    return { importedCount: 0, embeds: [] }
  }

  const sortedFiles = sortReplayFilesNewestFirst(files).map(entry => entry.file)

  let firstImportedIndex = -1
  for (let i = 0; i < sortedFiles.length; i++) {
    if (await isReplayImported(sortedFiles[i])) {
      firstImportedIndex = i
      break
    }
  }

  if (firstImportedIndex === 0) {
    return { importedCount: 0, embeds: [] }
  }

  const unimportedFiles =
    firstImportedIndex === -1
      ? sortedFiles.slice().reverse()
      : sortedFiles.slice(0, firstImportedIndex).reverse()

  const embeds: EmbedBuilder[] = []
  let importedCount = 0

  for (const file of unimportedFiles) {
    const replayData = await parseReplay(file)
    if (replayData && replayData.mode === -1) {
      importedCount++
      embeds.push(await saveAndCopyCustomReplay(file, replayData, guildId))
    }
  }

  return { importedCount, embeds }
}

export async function handleImportReplaysCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  if (!(await userIsAdmin(interaction))) {
    return
  }
  if (!interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'This command can only be used as a slash command.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const rawStartInput = interaction.options.getString(CommandIds.START_DATE_OR_COUNT)
  const rawEndInput = interaction.options.getString(CommandIds.END_DATE)
  const filterParams = parseReplayFilterParams(rawStartInput, rawEndInput)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  if (!rawStartInput && !rawEndInput) {
    const result = await syncRecentReplays(guildId)
    if (result.importedCount === 0) {
      await interaction.editReply({
        content: 'No new custom replays found to import (all recent replays are already in the database).',
      })
      return
    }

    await sendReplayEmbedBatches(
      interaction,
      `📥 **Synced ${result.importedCount} new custom replay${result.importedCount > 1 ? 's' : ''} in chronological order:**`,
      result.embeds
    )
    return
  }

  let files: string[] = []
  try {
    files = findStormReplays(REPLAY_SOURCE_DIR)
  } catch (error) {
    console.error('Error reading replay folder:', error)
    await safeReply(interaction, {
      content: `Error reading replay folder. Please make sure the folder path is correct.\n\`${REPLAY_SOURCE_DIR}\``,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (files.length === 0) {
    await safeReply(interaction, {
      content: `No .StormReplay files found in any Replays folder under:\n\`${REPLAY_SOURCE_DIR}\``,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const sortedWithStats = sortReplayFilesNewestFirst(files)
  const numTotalFiles = sortedWithStats.length

  const filteredFiles = sortedWithStats
    .filter(({ mtime }) => {
      if (!mtime) return true
      if (filterParams.startDate && mtime < filterParams.startDate.getTime() - 86400000) {
        return false
      }
      if (filterParams.endDate && mtime > filterParams.endDate.getTime() + 86400000) {
        return false
      }
      return true
    })
    .map(entry => entry.file)

  let count = 0
  const embeds: EmbedBuilder[] = []

  for (const file of filteredFiles) {
    if (filterParams.maxFilesLimit !== null && count >= filterParams.maxFilesLimit) {
      break
    }

    const replayData = await parseReplay(file)

    if (
      replayData &&
      replayData.mode === -1 &&
      isReplayInFilterRange(file, replayData.date, filterParams.startDate, filterParams.endDate)
    ) {
      count++
      embeds.push(await saveAndCopyCustomReplay(file, replayData, guildId))
    }
  }

  if (count > 0) {
    await optimizeDb()
    await sendReplayEmbedBatches(
      interaction,
      `📥 **Finished importing ${count.toLocaleString('en-US')} custom replay${count === 1 ? '' : 's'}:**`,
      embeds,
      numTotalFiles
    )
  } else {
    try {
      await interaction.editReply({
        content: `No custom .StormReplay games matched the criteria in:\n\`${REPLAY_SOURCE_DIR}\``,
      })
    } catch {}
  }
}

export async function handleReassignReplayPlayerAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  const focusedOption = interaction.options.getFocused(true)

  if (focusedOption.name === CommandIds.REPLAY) {
    const query = String(focusedOption.value || '').trim().toLowerCase()
    const recents = await getRecentReplays(20)

    const choices: { name: string; value: number }[] = []

    for (const r of recents) {
      const durationMin = r.length ? Math.floor(r.length / 60) : 0
      const durationSec = r.length ? Math.floor(r.length % 60) : 0
      const durationStr = r.length ? `${durationMin}m ${durationSec}s` : 'Unknown duration'
      const dateStr = r.date ? formatDateToMMDDYYYY(new Date(r.date)) : 'Unknown date'
      const label = `#${r.id} - ${r.map} (${dateStr}, ${durationStr})`.slice(0, 100)

      if (
        !query ||
        String(r.id).includes(query) ||
        r.map.toLowerCase().includes(query) ||
        dateStr.toLowerCase().includes(query)
      ) {
        choices.push({ name: label, value: r.id })
      }
    }

    await interaction.respond(choices.slice(0, 25))
    return
  }

  if (focusedOption.name === CommandIds.ACCOUNT) {
    const query = String(focusedOption.value || '').trim().toLowerCase()
    const replayIdOption = interaction.options.getInteger(CommandIds.REPLAY)

    const choices: { name: string; value: string }[] = []

    if (replayIdOption) {
      const players = await getReplayPlayers(replayIdOption)
      for (const p of players) {
        const isSub = Boolean(p.owner_discord_id && p.owner_discord_id !== p.discord_id)
        const subSuffix = isSub && p.substitute_display_name ? ` 🔄 sub: ${p.substitute_display_name}` : ''
        const label = `${p.hots_battle_tag} (${p.hero})${subSuffix}`.slice(0, 100)
        if (
          !query ||
          p.hots_battle_tag.toLowerCase().includes(query) ||
          p.hero.toLowerCase().includes(query) ||
          (p.substitute_display_name && p.substitute_display_name.toLowerCase().includes(query))
        ) {
          choices.push({ name: label, value: p.hots_battle_tag })
        }
      }
    } else {
      const guildId = interaction.guildId
      if (guildId) {
        const generalChoices = await getAssignAccountChoices(guildId, query)
        for (const c of generalChoices) {
          choices.push(c)
        }
      }
    }

    await interaction.respond(choices.slice(0, 25))
    return
  }

  await interaction.respond([])
}

export async function handleReassignReplayPlayerCommand(
  interaction: ChatInputCommandInteraction<CacheType>
): Promise<void> {
  if (!(await userIsAdmin(interaction))) {
    return
  }

  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const replayId = interaction.options.getInteger(CommandIds.REPLAY, true)
  const accountInput = interaction.options.getString(CommandIds.ACCOUNT, true).trim()
  const targetUser = interaction.options.getUser(CommandIds.TO, true)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const result = await reassignReplayPlayer(guildId, replayId, accountInput, targetUser.id)

  if (!result.success) {
    await interaction.editReply({
      content: `❌ ${result.message}`,
    })
    return
  }

  const originalMention = result.originalDiscordId ? `<@${result.originalDiscordId}>` : 'Unlinked/Unknown'
  const targetMention = `<@${targetUser.id}>`

  await interaction.editReply({
    content:
      `✅ Successfully reassigned player for match **#${result.replayId}** (${result.map}):\n` +
      `• **HotS Account:** ${result.battleTag} (${result.hero})\n` +
      `• **Original Owner:** ${originalMention}\n` +
      `• **Reassigned To:** ${targetMention}\n` +
      `• Match stats and SotS averages have been updated for both players.`,
  })

  try {
    await updateLobbyMessage(guildId, interaction)
  } catch (err) {
    console.error('Error updating lobby message after reassigning replay player:', err)
  }
}

export async function handleRecentReplaysCommand(
  interaction: ChatInputCommandInteraction<CacheType>
): Promise<void> {
  const replayIdOption = interaction.options.getInteger(CommandIds.REPLAY)
  const count = interaction.options.getInteger(CommandIds.COUNT) ?? 5
  const clampedCount = Math.max(1, count)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  if (replayIdOption !== null && replayIdOption !== undefined) {
    const replay = await getReplaySummary(replayIdOption)
    if (!replay) {
      await interaction.editReply({
        content: `❌ Replay ID **#${replayIdOption}** was not found in the database.`,
      })
      return
    }

    const embed = await buildReplayOverviewEmbed(replay)
    await interaction.editReply({
      content: `📋 **Match Details for Replay #${replay.id}:**`,
      embeds: [embed],
    })
    return
  }

  const replays = await getRecentReplays(clampedCount)
  if (replays.length === 0) {
    await interaction.editReply({
      content: 'No custom replays found in the database.',
    })
    return
  }

  const embeds = await Promise.all(replays.map(r => buildReplayOverviewEmbed(r)))
  await sendReplayEmbedBatches(
    interaction,
    `📋 **Showing ${replays.length} Most Recent Custom Match Replay${replays.length === 1 ? '' : 's'}:**`,
    embeds
  )
}

export async function handleLookupReplaySelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  const selectedValue = interaction.values[0]
  if (!selectedValue) return

  const replayId = Number(selectedValue)
  if (isNaN(replayId)) return

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const replay = await getReplaySummary(replayId)
  if (!replay) {
    await interaction.editReply({
      content: `❌ Replay ID **#${replayId}** was not found in the database.`,
    })
    return
  }

  const embed = await buildReplayOverviewEmbed(replay)
  await interaction.editReply({
    content: `📋 **Match Details for Replay #${replay.id}:**`,
    embeds: [embed],
  })
}

