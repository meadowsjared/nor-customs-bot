import { Attachment, ButtonInteraction, CacheType, ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { CommandIds } from '../constants'
import {
  getPlayerIdentifier,
  getPlayerMMR,
  getSortedActivePlayers,
  setTeamsFromPlayers,
} from '../store/player'
import { Player } from '../types/player'
import { requireGuildId, safeReply } from '../utils/interaction'
import { scanLobbyScreenshot, ScanLobbySummary } from '../utils/lobbyScanner'
import { updateLobbyMessage } from './lobby'
import { generateTeamsMessage } from './teams'

export function formatScanSummaryMessage(summary: ScanLobbySummary): string {
  const lines: string[] = ['### 📸 HotS Lobby Scan Results']
  if (summary.newlyAdded.length > 0) {
    lines.push(
      `🟢 **Added (${summary.newlyAdded.length}):** ${summary.newlyAdded
        .map(p => `@${p.name} (\`${p.hotsBattleTag.replace(/#.*$/, '')}\`)`)
        .join(', ')}`
    )
  }
  if (summary.alreadyActive.length > 0) {
    lines.push(
      `👥 **Already Active (${summary.alreadyActive.length}):** ${summary.alreadyActive
        .map(p => `@${p.name}`)
        .join(', ')}`
    )
  }
  if (summary.removed.length > 0) {
    lines.push(
      `🔴 **Removed from Lobby (${summary.removed.length}):** ${summary.removed.map(p => `@${p.name}`).join(', ')}`
    )
  } else if (summary.missingFromScreenshot.length > 0) {
    lines.push(
      `⚠️ **Missing from HotS Lobby (${summary.missingFromScreenshot.length}):** ${summary.missingFromScreenshot
        .map(p => `@${p.name}`)
        .join(', ')}`
    )
  }
  if (summary.unregistered.length > 0) {
    lines.push(
      `❓ **Unregistered in Bot (${summary.unregistered.length}):** ${summary.unregistered
        .map(u => `\`${u}\``)
        .join(', ')} *(need to /join or click button)*`
    )
  }
  if (summary.team1CaptainDiscordId || summary.team2CaptainDiscordId) {
    const captains: string[] = []
    const allKnown = [...summary.newlyAdded, ...summary.alreadyActive]
    if (summary.team1CaptainDiscordId) {
      const p = allKnown.find(x => x.discordId === summary.team1CaptainDiscordId)
      if (p) captains.push(`Team 1: @${p.name}`)
    }
    if (summary.team2CaptainDiscordId) {
      const p = allKnown.find(x => x.discordId === summary.team2CaptainDiscordId)
      if (p) captains.push(`Team 2: @${p.name}`)
    }
    if (captains.length > 0) {
      lines.push(`👑 **Captains:** ${captains.join(' | ')}`)
    }
  }
  lines.push(`\n**Total Lobby:** ${summary.totalLobbyCount} / 10 players`)
  return lines.join('\n')
}

export function matchesScanList(player: Player, scanIds: string[]): boolean {
  if (player.discordId && scanIds.includes(player.discordId)) {
    return true
  }
  const id = getPlayerIdentifier(player)
  if (id && scanIds.includes(id)) {
    return true
  }
  return (
    player.usernames.accounts?.some(a => {
      const tag = a.hotsBattleTag.toLowerCase()
      const prefix = tag.split('#')[0]
      return scanIds.some(s => {
        const sLower = s.toLowerCase()
        return sLower === tag || sLower === prefix
      })
    }) ?? false
  )
}

async function applyTeamsFromScan(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  guildId: string,
  scanSummary: ScanLobbySummary
): Promise<void> {
  if (scanSummary.team1DiscordIds.length === 0 && scanSummary.team2DiscordIds.length === 0) {
    return
  }
  const sortedPlayers = await getSortedActivePlayers(guildId, true)
  sortedPlayers.forEach((p, index) => {
    p.lobbyRank = index
  })

  const team1: Player[] = []
  const team2: Player[] = []
  const spectators: Player[] = []
  const seenPlayerIds = new Set<string>()

  for (const p of sortedPlayers) {
    const id = getPlayerIdentifier(p)
    if (id && seenPlayerIds.has(id)) {
      continue
    }
    if (id) seenPlayerIds.add(id)

    if (matchesScanList(p, scanSummary.team1DiscordIds)) {
      team1.push(p)
    } else if (matchesScanList(p, scanSummary.team2DiscordIds)) {
      team2.push(p)
    } else {
      spectators.push(p)
    }
  }

  team1.sort((a, b) => (b.mmr ?? getPlayerMMR(b)) - (a.mmr ?? getPlayerMMR(a)))
  team2.sort((a, b) => (b.mmr ?? getPlayerMMR(b)) - (a.mmr ?? getPlayerMMR(a)))

  team1.forEach((p, i) => {
    p.team = 1
    const isCaptain = scanSummary.team1CaptainDiscordId
      ? matchesScanList(p, [scanSummary.team1CaptainDiscordId])
      : i === 0
    p.draftOrder = isCaptain ? 1 : NaN
  })
  team2.forEach((p, i) => {
    p.team = 2
    const isCaptain = scanSummary.team2CaptainDiscordId
      ? matchesScanList(p, [scanSummary.team2CaptainDiscordId])
      : i === 0
    p.draftOrder = isCaptain ? 2 : NaN
  })
  spectators.forEach(p => {
    p.team = 0
    p.draftOrder = NaN
  })

  await setTeamsFromPlayers(guildId, team1, team2, spectators)
  await generateTeamsMessage(interaction, team1, team2, false, true)
}

export async function processAndApplyLobbyScan(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  guildId: string,
  screenshot: Attachment,
  sync = false,
  options?: {
    updateLobby?: boolean
    reportAsFollowUp?: boolean
  }
): Promise<ScanLobbySummary> {
  const response = await fetch(screenshot.url)
  const arrayBuffer = await response.arrayBuffer()
  const imageBuffer = Buffer.from(arrayBuffer)
  const summary = await scanLobbyScreenshot(imageBuffer, guildId, sync)

  if (options?.updateLobby) {
    await updateLobbyMessage(guildId, interaction)
  }

  const report = formatScanSummaryMessage(summary)
  if (options?.reportAsFollowUp || interaction.replied) {
    await interaction.followUp({
      content: report,
      flags: MessageFlags.Ephemeral,
    })
  } else if (interaction.deferred) {
    await interaction.editReply({
      content: report,
    })
  } else {
    await safeReply(interaction, {
      content: report,
      flags: MessageFlags.Ephemeral,
    })
  }

  await applyTeamsFromScan(interaction, guildId, summary)

  return summary
}

export async function handleScanLobbyCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand()) {
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const screenshot = interaction.options.getAttachment(CommandIds.SCREENSHOT)
  const sync = interaction.options.getBoolean(CommandIds.SYNC) ?? false
  if (!screenshot) {
    await safeReply(interaction, {
      content: 'Please attach a screenshot of the HotS custom game lobby.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    await processAndApplyLobbyScan(interaction, guildId, screenshot, sync, {
      updateLobby: true,
      reportAsFollowUp: false,
    })
  } catch (error) {
    console.error('Error scanning lobby screenshot:', error)
    await interaction.editReply({
      content:
        '❌ Failed to scan lobby screenshot. Please ensure it is a clear in-game screenshot of the custom game lobby.',
    })
  }
}

