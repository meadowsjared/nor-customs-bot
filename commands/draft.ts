import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'
import { CommandIds } from '../constants'
import { client } from '../index'
import { getLobbyMessages, saveLobbyMessage } from '../store/channels'
import {
  assignPlayerToTeam,
  getDraftPickedCount,
  getNextDraftOrder,
  getPlayerIdentifier,
  getPlayerRolesFormatted,
  getSortedActivePlayers,
  getTeams,
  resetActivePlayerTeams,
} from '../store/player'
import { getDraftCoinState, getSetting, resetDraftCoinState, setDraftCoinState, setSetting } from '../store/settings'
import { DraftCoinState, Player } from '../types/player'
import { announce } from '../utils/announce'
import { requireGuildId, safeDeferUpdate, safeReply } from '../utils/interaction'

/**
 * Handles autocomplete for captain selection in /draft and /draft_captain
 */
export async function handleDraftAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  let sortedPlayers = await getSortedActivePlayers(guildId)

  if (interaction.commandName === CommandIds.DRAFT_TEAM_ASSIGN) {
    const selectedTeam = interaction.options.getString('team')
    if (selectedTeam === '1') {
      sortedPlayers = sortedPlayers.filter(p => p.team !== 1)
    } else if (selectedTeam === '2') {
      sortedPlayers = sortedPlayers.filter(p => p.team !== 2)
    } else if (selectedTeam === 'spectator') {
      sortedPlayers = sortedPlayers.filter(p => p.team === 1 || p.team === 2)
    }
  }

  const focusedValue = interaction.options.getFocused().toLowerCase()

  const filtered = sortedPlayers.filter(
    p =>
      p.usernames?.discordDisplayName?.toLowerCase().includes(focusedValue) ||
      p.usernames?.discordGlobalName?.toLowerCase().includes(focusedValue) ||
      p.usernames?.accounts?.some(acc => acc.hotsBattleTag?.toLowerCase().includes(focusedValue))
  )

  const choices = filtered.slice(0, 25).map(p => ({
    name: `${p.usernames?.discordDisplayName ?? 'Player'} (${p.mmr})`,
    value: getPlayerIdentifier(p),
  }))

  await interaction.respond(choices)
}

/**
 * Updates the active interactive draft message in channel
 */
export async function updateDraftUIMessage(
  guildId: string,
  interactionForGuild?: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const draftMessages = await getLobbyMessages(guildId, [CommandIds.DRAFT])
  if (!draftMessages || draftMessages.length === 0) {
    return
  }

  const uiData = await generateDraftUI(guildId)
  try {
    const channelId = draftMessages[0].channelId
    const messageId = draftMessages[0].messageId
    if (interactionForGuild && interactionForGuild.guild) {
      const channel = interactionForGuild.guild.channels.cache.get(channelId)
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(messageId)
        await message.edit(uiData)
      }
    } else {
      const guild = client.guilds.cache.get(guildId)
      const channel = guild?.channels.cache.get(channelId)
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(messageId)
        await message.edit(uiData)
      }
    }
  } catch (error) {
    console.error('Failed to update draft UI message:', error)
  }
}

/**
 * Handles the /draft command interaction, which starts an interactive captain draft.
 */
export async function handleDraftCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const activeSortedPlayers = await getSortedActivePlayers(guildId)
  if (activeSortedPlayers.length < 2) {
    await safeReply(interaction, {
      content: 'Not enough active players in the lobby to start a draft. Need at least 2 active players.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Reset team assignments for active players
  await resetActivePlayerTeams(guildId)

  let t1CaptainId = interaction.isChatInputCommand()
    ? (interaction.options.getString('team1_captain') ?? undefined)
    : undefined
  let t2CaptainId = interaction.isChatInputCommand()
    ? (interaction.options.getString('team2_captain') ?? undefined)
    : undefined

  if (!t1CaptainId && activeSortedPlayers[0]) {
    t1CaptainId = getPlayerIdentifier(activeSortedPlayers[0])
  }
  if (!t2CaptainId && activeSortedPlayers[1]) {
    const p0Id = getPlayerIdentifier(activeSortedPlayers[0])
    t2CaptainId = t1CaptainId === p0Id ? getPlayerIdentifier(activeSortedPlayers[1]) : p0Id
  }

  const modeOpt = interaction.isChatInputCommand() ? (interaction.options.getString('mode') ?? 'captains') : 'captains'

  await setSetting('draft_mode', modeOpt, guildId)

  // Automatically assign Captain 1 to Team 1 (rank #1) and Captain 2 to Team 2 (rank #2)
  if (t1CaptainId) await assignPlayerToTeam(guildId, t1CaptainId, 1, 1)
  if (t2CaptainId) await assignPlayerToTeam(guildId, t2CaptainId, 2, 2)

  if (modeOpt === 'captains') {
    await setDraftCoinState(guildId, {
      status: 'awaiting_call',
      callerTeam: Math.random() < 0.5 ? 1 : 2,
    })
  } else {
    await resetDraftCoinState(guildId)
  }

  const uiData = await generateDraftUI(guildId)

  const sentMessage = await announce(interaction, uiData)

  if (sentMessage) {
    await saveLobbyMessage(guildId, CommandIds.DRAFT, sentMessage.id, sentMessage.channelId, '')
  }

  const sentReply = await safeReply(interaction, {
    content: 'Interactive draft started!',
    flags: MessageFlags.Ephemeral,
  })

  await sentReply?.delete()
}

/**
 * Determines which team gets the 1st pick in the draft rotation order.
 * Defaults to 1 (Team 1) if coin flip is not completed.
 */
export function getFirstPickTeam(coinState: DraftCoinState | null): 1 | 2 {
  if (!coinState || coinState.status !== 'completed' || coinState.isFirstPick === undefined) {
    return 1
  }
  if (coinState.firstPickTeam !== undefined) {
    return coinState.firstPickTeam
  }
  const callerTeam = coinState.callerTeam ?? 1
  const callerWon =
    coinState.call !== undefined && coinState.flipResult !== undefined && coinState.call === coinState.flipResult
  const winnerTeam: 1 | 2 = callerWon ? callerTeam : callerTeam === 1 ? 2 : 1
  const winnerIsT1 = winnerTeam === 1
  return (winnerIsT1 && coinState.isFirstPick) || (!winnerIsT1 && !coinState.isFirstPick) ? 1 : 2
}

/**
 * Builds the interactive draft message content and component buttons.
 */
export async function generateDraftUI(guildId: string): Promise<{
  content: string
  embeds: EmbedBuilder[]
  components: ActionRowBuilder<ButtonBuilder>[]
  allowedMentions: { parse: [] }
}> {
  const activePlayers = await getSortedActivePlayers(guildId, true)
  const { team1, team2, spectators, t1Captain, t2Captain } = await getTeams(guildId, activePlayers)

  const mode = (await getSetting('draft_mode', guildId)) ?? 'captains'
  const coinState = await getDraftCoinState(guildId)
  const firstPickTeam = getFirstPickTeam(coinState)
  const turnInfo = getCurrentDraftTurn({ 1: team1.length, 2: team2.length }, activePlayers.length, firstPickTeam)

  const statusHeader = buildDraftStatusHeader(mode, turnInfo, spectators.length, coinState, t1Captain, t2Captain)
  const centeredRotationBlock = buildDraftRotationBlock(
    turnInfo.activePickIndex,
    mode,
    turnInfo.isComplete,
    firstPickTeam
  )

  const sortedTeam1 = sortTeamByDraftOrder(team1, t1Captain?.discordId ?? undefined)
  const sortedTeam2 = sortTeamByDraftOrder(team2, t2Captain?.discordId ?? undefined)

  const team1List =
    (sortedTeam1.map(p => formatDraftPlayerEntry(p, t1Captain, true)).join('\n') || '*No players picked yet*') +
    '\n\u200b'

  const team2List =
    (sortedTeam2.map(p => formatDraftPlayerEntry(p, t2Captain, true)).join('\n') || '*No players picked yet*') +
    '\n\u200b'

  const unpickedList = spectators.map(p => formatDraftPlayerEntry(p)).join('\n') || '*None (Pool empty)*'

  const embed = buildDraftEmbed({
    mode,
    turnInfo,
    statusHeader,
    centeredRotationBlock,
    t1Captain,
    t2Captain,
    team1List,
    team2List,
    unpickedList,
    unpickedCount: spectators.length,
  })

  const components = await buildDraftActionRows(guildId, spectators, turnInfo, mode, coinState, t1Captain, t2Captain)

  return {
    content: '',
    embeds: [embed],
    components,
    allowedMentions: { parse: [] },
  }
}

/**
 * Calculates current turn in HotS 1-2-2-1-1-2-2-1 draft order based on team counts.
 */
export function getCurrentDraftTurn(
  teamPlayerCounts: { [key: number]: number },
  totalActive: number = 10,
  firstPickTeam: 1 | 2 = 1
): {
  currentTeam: number
  picksRemaining: number
  pickNumber: number
  isComplete: boolean
  totalPicksThisTurn: number
  activePickIndex: number
} {
  const secondPickTeam = 3 - firstPickTeam
  const Max_Picks = 10
  const activePickIndex = Math.min(
    Max_Picks - 2, // note: we use 8 as the max index, not 10, because the 2 captains are already picked
    Math.max(0, teamPlayerCounts[firstPickTeam] + teamPlayerCounts[secondPickTeam] - 2)
  )
  const totalPicksThisTurn =
    activePickIndex === 0
      ? firstPickTeam
      : activePickIndex === totalActive && totalActive % 1 === 0
        ? firstPickTeam
        : Math.min(2, totalActive - teamPlayerCounts[firstPickTeam] - teamPlayerCounts[secondPickTeam])
  const pickNumber = activePickIndex === 0 ? 1 : activePickIndex % 2 === 0 ? 2 : 1
  if (teamPlayerCounts[firstPickTeam] + teamPlayerCounts[secondPickTeam] >= Max_Picks) {
    return {
      currentTeam: firstPickTeam,
      picksRemaining: 0,
      isComplete: true,
      totalPicksThisTurn,
      activePickIndex,
      pickNumber,
    }
  }

  for (let i = 2; i < totalActive; i++) {
    const currentTeam = i % 2 === 0 ? firstPickTeam : secondPickTeam
    if (teamPlayerCounts[currentTeam] < i) {
      return {
        currentTeam,
        activePickIndex,
        picksRemaining: Math.min(
          i - teamPlayerCounts[currentTeam],
          totalActive - teamPlayerCounts[firstPickTeam] - teamPlayerCounts[secondPickTeam]
        ),
        totalPicksThisTurn,
        isComplete: false,
        pickNumber,
      }
    }
  }

  // Fallback for arbitrary states resulting from free pick mode:
  // Whichever team has fewer players gets the next turn!
  if (teamPlayerCounts[firstPickTeam] <= teamPlayerCounts[secondPickTeam]) {
    return {
      currentTeam: firstPickTeam,
      picksRemaining: 1,
      isComplete: false,
      totalPicksThisTurn,
      activePickIndex,
      pickNumber,
    }
  } else {
    return {
      currentTeam: secondPickTeam,
      picksRemaining: 1,
      isComplete: false,
      totalPicksThisTurn,
      activePickIndex,
      pickNumber,
    }
  }
}

/**
 * Builds the status header text based on draft mode and active turn.
 */
function buildDraftStatusHeader(
  mode: string,
  turnInfo: ReturnType<typeof getCurrentDraftTurn>,
  unpickedCount: number,
  coinState: DraftCoinState | null,
  t1Captain?: Player,
  t2Captain?: Player
): string {
  if (mode === 'captains') {
    if (coinState?.status === 'awaiting_call') {
      const callerTeam = coinState.callerTeam ?? 1
      const callerCap = callerTeam === 1 ? t1Captain : t2Captain
      const callerName = callerCap ? `@${callerCap.usernames?.discordDisplayName}` : `Team ${callerTeam} Captain`
      return `## 🪙 Coin Toss Phase: Captain Call Required\n**${callerName}**, call **Heads** or **Tails** to decide who chooses draft position!`
    }

    if (coinState?.status === 'awaiting_choice') {
      const callerTeam = coinState.callerTeam ?? 1
      const callerCap = callerTeam === 1 ? t1Captain : t2Captain
      const callerName = callerCap ? `@${callerCap.usernames?.discordDisplayName}` : `Team ${callerTeam} Captain`
      const call = coinState.call ?? 'heads'
      const flip = coinState.flipResult ?? 'heads'
      const callerWon =
        coinState.call !== undefined && coinState.flipResult !== undefined && coinState.call === coinState.flipResult
      const winnerTeam: 1 | 2 = callerWon ? callerTeam : callerTeam === 1 ? 2 : 1
      const winnerCap = winnerTeam === 1 ? t1Captain : t2Captain
      const winnerName = winnerCap ? `@${winnerCap.usernames?.discordDisplayName}` : 'Coin Toss Winner'
      const callOutcome = callerWon ? 'won' : 'lost'

      return (
        `## 🪙 Coin Toss Result!\n` +
        `${callerName} called **${call.toUpperCase()}**. The coin landed on **${flip.toUpperCase()}**!\n` +
        `🎉 **${callerName}** ${callOutcome} the toss ${callOutcome === 'won' ? 'and gets to' : 'so **' + winnerName + '** gets to'} pick draft order!\n` +
        `${winnerName} *Select **1st Pick** or **Following Two** (2nd & 3rd Pick).*`
      )
    }

    if (turnInfo.isComplete || unpickedCount === 0) {
      return '# 🎉 Draft Complete!\nBoth teams have been picked.'
    } else {
      const activeCaptain = turnInfo.currentTeam === 1 ? t1Captain : t2Captain
      const activeCaptainName = activeCaptain ? `@${activeCaptain.usernames?.discordDisplayName}` : 'Unassigned'
      const teamLabel = turnInfo.currentTeam === 1 ? '🔵 Team 1' : '🔴 Team 2'
      let coinBanner = ''
      if (coinState?.status === 'completed' && coinState.isFirstPick !== undefined) {
        const callerTeam = coinState.callerTeam ?? 1
        const callerWon =
          coinState.call !== undefined && coinState.flipResult !== undefined && coinState.call === coinState.flipResult
        const winnerTeam: 1 | 2 = callerWon ? callerTeam : callerTeam === 1 ? 2 : 1
        const winnerCap = winnerTeam === 1 ? t1Captain : t2Captain
        const winnerName = winnerCap ? `@${winnerCap.usernames?.discordDisplayName}` : 'Winner'
        const choiceText = coinState.isFirstPick ? '1st Pick' : 'Following Two'
        coinBanner = `🪙 *Coin toss won by ${winnerName} (chose ${choiceText})*\n`
      }
      return `${coinBanner}## ${teamLabel} Captain ${activeCaptainName}'s Turn\n*(Pick ${turnInfo.pickNumber} of ${turnInfo.totalPicksThisTurn})*`
    }
  } else if (mode === 'free_team1') {
    return '## ⚡ Free Pick Mode ➡️ 🔵 Team 1\n*Click any available player button to assign them to Team 1*'
  } else if (mode === 'free_team2') {
    return '## ⚡ Free Pick Mode ➡️ 🔴 Team 2\n*Click any available player button to assign them to Team 2*'
  } else {
    return '## ⚡ Free Pick Mode\n• Team 1 Captain picks ➡️ Team 1 (🔵)\n• Team 2 Captain picks ➡️ Team 2 (🔴)'
  }
}

/**
 * Generates the 1-2-2 HotS pick rotation sequence tracker string block.
 */
function buildDraftRotationBlock(
  activePickIndex: number,
  mode: string,
  isComplete: boolean,
  firstPickTeam: 1 | 2 = 1
): string {
  const sequence = firstPickTeam === 1 ? [1, 2, 2, 1, 1, 2, 2, 1] : [2, 1, 1, 2, 2, 1, 1, 2]
  const arrowRow = sequence
    .map((_, idx) => (idx === activePickIndex && mode === 'captains' && !isComplete ? '⬇️' : '⬛'))
    .join(' ')

  const trackerRow = sequence
    .map((team, idx) => {
      if (idx < activePickIndex && mode === 'captains') {
        return team === 1 ? '🔵' : '🔴'
      } else {
        return team === 1 ? '🧿' : '⭕'
      }
    })
    .join(' ')

  const centerPad = '⠀ ⠀ ⠀ ⠀ ⠀ ⠀ ⠀ ⠀ ⠀ ⠀ '
  return `${centerPad}**Draft Rotation Order:**${isComplete ? '' : '\n' + centerPad + arrowRow}\n${centerPad}${trackerRow}\n\u200b`
}

/**
 * Sorts players on a team roster putting captain first followed by draft pick order.
 */
function sortTeamByDraftOrder(players: Player[], captainId?: string): Player[] {
  return [...players].sort((a, b) => {
    const aIsCap = a.discordId === captainId
    const bIsCap = b.discordId === captainId
    if (aIsCap) return -1
    if (bIsCap) return 1
    return (a.draftOrder ?? 0) - (b.draftOrder ?? 0)
  })
}

/**
 * Formats a player entry string for display in team rosters or available pool.
 */
function formatDraftPlayerEntry(p: Player, captain?: Player, isOnTeamRoster = false): string {
  const primaryHotsTag = (
    p.usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag ??
    p.usernames.accounts?.[0]?.hotsBattleTag ??
    ''
  ).replace(/#.*$/, '')
  const hotsSection = primaryHotsTag ? `: (${primaryHotsTag})` : `: (${p.usernames.discordDisplayName})`
  const roleSection = `\`${getPlayerRolesFormatted(p.role)}\``
  const mmrSection = `\`(${p.mmr})\``

  let prefix = '• '
  if (p.discordId === captain?.discordId) {
    prefix = '• 👑 '
  } else if (isOnTeamRoster) {
    const pickNum = p.draftOrder ?? 1
    prefix = `• #${pickNum - 1} `
  }

  if (isOnTeamRoster) {
    return `${prefix}@${p.usernames.discordDisplayName}${hotsSection}\n  ${roleSection} ${mmrSection}`
  }
  return `${prefix}@${p.usernames.discordDisplayName}${hotsSection} ${roleSection} ${mmrSection}`
}

/**
 * Constructs the primary EmbedBuilder for the interactive draft message.
 */
function buildDraftEmbed(params: {
  mode: string
  turnInfo: ReturnType<typeof getCurrentDraftTurn>
  statusHeader: string
  centeredRotationBlock: string
  t1Captain?: Player
  t2Captain?: Player
  team1List: string
  team2List: string
  unpickedList: string
  unpickedCount: number
}): EmbedBuilder {
  const {
    mode,
    turnInfo,
    statusHeader,
    centeredRotationBlock,
    t1Captain,
    t2Captain,
    team1List,
    team2List,
    unpickedList,
    unpickedCount,
  } = params

  const t1CaptainName = t1Captain ? `@${t1Captain.usernames?.discordDisplayName}` : 'Unassigned'
  const t2CaptainName = t2Captain ? `@${t2Captain.usernames?.discordDisplayName}` : 'Unassigned'

  let footerText = 'Draft Style: Captains Mode (1-2-2 Rotation) • Nexus Customs'
  if (mode === 'free_team1') footerText = 'Draft Style: Free Pick ➡️ Team 1 (🔵) • Nexus Customs'
  if (mode === 'free_team2') footerText = 'Draft Style: Free Pick ➡️ Team 2 (🔴) • Nexus Customs'

  return new EmbedBuilder()
    .setTitle('⚔️ HEROES OF THE STORM CAPTAIN DRAFT')
    .setColor(turnInfo.currentTeam === 1 ? 0x3498db : 0xed4245)
    .setDescription(`${statusHeader}\n\n${centeredRotationBlock}`)
    .addFields(
      {
        name: `🔵 TEAM 1\n(Captain: ${t1CaptainName})`,
        value: team1List,
        inline: true,
      },
      {
        name: `🔴 TEAM 2\n(Captain: ${t2CaptainName})`,
        value: team2List,
        inline: true,
      },
      {
        name: turnInfo.isComplete ? `🟡 SPECTATORS (${unpickedCount})` : `📋 AVAILABLE LOBBY POOL (${unpickedCount})`,
        value: unpickedList,
        inline: false,
      }
    )
    .setFooter({
      text: footerText,
    })
}

/**
 * Builds interactive button component action rows for picks, removals, and controls.
 */
async function buildDraftActionRows(
  guildId: string,
  unpickedPlayers: Player[],
  turnInfo: ReturnType<typeof getCurrentDraftTurn>,
  mode: string,
  coinState: DraftCoinState | null,
  t1Captain?: Player,
  t2Captain?: Player
): Promise<ActionRowBuilder<ButtonBuilder>[]> {
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  let currentRow = new ActionRowBuilder<ButtonBuilder>()

  if (mode === 'captains' && coinState?.status === 'awaiting_call') {
    const coinCallRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('draft_coin:heads').setLabel('🪙 Call Heads').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('draft_coin:tails').setLabel('🪙 Call Tails').setStyle(ButtonStyle.Primary)
    )
    rows.push(coinCallRow)
  } else if (mode === 'captains' && coinState?.status === 'awaiting_choice') {
    const choiceRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('draft_choice:first').setLabel('1️⃣ 1st Pick').setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('draft_choice:second')
        .setLabel('2️⃣ Following Two (2nd & 3rd)')
        .setStyle(ButtonStyle.Primary)
    )
    rows.push(choiceRow)
  } else if (!turnInfo.isComplete && unpickedPlayers.length > 0) {
    unpickedPlayers.forEach(p => {
      if (currentRow.components.length >= 5) {
        rows.push(currentRow)
        currentRow = new ActionRowBuilder<ButtonBuilder>()
      }
      const label = `${p.usernames?.discordDisplayName ?? 'Player'} (${p.mmr})`
      const buttonStyle = mode === 'free_team2' ? ButtonStyle.Danger : ButtonStyle.Primary
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`draft_pick:${p.discordId}`)
          .setLabel(label.length > 80 ? label.slice(0, 77) + '...' : label)
          .setStyle(buttonStyle)
      )
    })
    if (currentRow.components.length > 0) {
      rows.push(currentRow)
    }
  }

  // In Free Pick mode, also add removal buttons for currently picked non-captain players
  const isFreePick = mode === 'free_team1' || mode === 'free_team2' || mode === 'free'
  if (isFreePick && rows.length < 4) {
    const pickedNonCaptains = [t1Captain, t2Captain].filter((p): p is Player => p !== undefined)
    let removeRow = new ActionRowBuilder<ButtonBuilder>()
    pickedNonCaptains.forEach(p => {
      if (removeRow.components.length >= 5) {
        rows.push(removeRow)
        removeRow = new ActionRowBuilder<ButtonBuilder>()
      }
      const label = `Remove ${p.usernames?.discordDisplayName ?? 'Player'}`
      removeRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`draft_remove:${p.discordId}`)
          .setLabel(label.length > 80 ? label.slice(0, 77) + '...' : label)
          .setStyle(ButtonStyle.Secondary)
      )
    })
    if (removeRow.components.length > 0 && rows.length < 4) {
      rows.push(removeRow)
    }
  }

  // Control Row
  const canUndo = (await getDraftPickedCount(guildId, t1Captain?.discordId ?? '', t2Captain?.discordId ?? '')) > 0

  let modeBtnLabel = 'Mode: Captains (1-2-2)'
  if (mode === 'free_team1') modeBtnLabel = 'Mode: Free Pick ➡️ Team 1 (🔵)'
  if (mode === 'free_team2') modeBtnLabel = 'Mode: Free Pick ➡️ Team 2 (🔴)'

  const controlsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('draft_undo')
      .setLabel('Undo Last Pick')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canUndo),
    new ButtonBuilder().setCustomId('draft_toggle_mode').setLabel(modeBtnLabel).setStyle(ButtonStyle.Secondary)
  )

  rows.push(controlsRow)
  return rows
}

/**
 * Handles the /draft_captain command interaction
 */
export async function handleDraftCaptainCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand()) {
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const t1CaptainId = interaction.options.getString('team1_captain')
  const t2CaptainId = interaction.options.getString('team2_captain')

  if (!t1CaptainId && !t2CaptainId) {
    await safeReply(interaction, {
      content: 'Please specify at least one captain (Team 1 Captain or Team 2 Captain) to set.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const updated: string[] = []

  if (t1CaptainId) {
    await assignPlayerToTeam(guildId, t1CaptainId, 1, 1)
    updated.push(`Team 1 captain to <@${t1CaptainId}>`)
  }
  if (t2CaptainId) {
    await assignPlayerToTeam(guildId, t2CaptainId, 2, 2)
    updated.push(`Team 2 captain to <@${t2CaptainId}>`)
  }

  await updateDraftUIMessage(guildId, interaction)

  const sentReply = await safeReply(interaction, {
    content: `Updated ${updated.join(' and ')}!`,
    flags: MessageFlags.Ephemeral,
  })
  await sentReply?.delete()
}

/**
 * Handles Team 1 Captain's Heads or Tails call button click.
 */
export async function handleDraftCoinCallButton(interaction: ButtonInteraction<CacheType>, call: 'heads' | 'tails') {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  await safeDeferUpdate(interaction)

  const coinState = await getDraftCoinState(guildId)
  if (!coinState || coinState.status !== 'awaiting_call') {
    return
  }

  const { t1Captain, t2Captain } = await getTeams(guildId)
  const callerTeam = coinState.callerTeam ?? 1
  const callerCap = callerTeam === 1 ? t1Captain : t2Captain

  if (interaction.user.id !== callerCap.discordId) {
    const callerName = callerCap ? `@${callerCap.usernames?.discordDisplayName}` : `Team ${callerTeam} Captain`
    await safeReply(interaction, {
      content: `⛔ Only ${callerName} can call the coin toss!`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    })
    return
  }

  const flipResult: 'heads' | 'tails' = Math.random() < 0.5 ? 'heads' : 'tails'

  const nextState: DraftCoinState = {
    ...coinState,
    status: 'awaiting_choice',
    callerTeam,
    call,
    flipResult,
  }

  await setDraftCoinState(guildId, nextState)
  await updateDraftUIMessage(guildId, interaction)
}

/**
 * Handles the coin toss winner's draft position choice (isFirstPick: boolean).
 */
export async function handleDraftChoiceButton(interaction: ButtonInteraction<CacheType>, isFirstPick: boolean) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  await safeDeferUpdate(interaction)

  const coinState = await getDraftCoinState(guildId)
  if (!coinState || coinState.status !== 'awaiting_choice') {
    return
  }

  const { t1Captain, t2Captain } = await getTeams(guildId)
  const callerTeam = coinState.callerTeam ?? 1
  const callerWon =
    coinState.call !== undefined && coinState.flipResult !== undefined && coinState.call === coinState.flipResult
  const winnerTeam: 1 | 2 = callerWon ? callerTeam : callerTeam === 1 ? 2 : 1
  const winnerCap = winnerTeam === 1 ? t1Captain : t2Captain

  if (interaction.user.id !== winnerCap.discordId) {
    const winnerName = winnerCap ? `@${winnerCap.usernames?.discordDisplayName}` : 'Coin Toss Winner'
    await safeReply(interaction, {
      content: `⛔ Only the coin toss winner (${winnerName}) can choose draft position!`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    })
    return
  }

  const winnerIsT1 = winnerTeam === 1
  const winnerWants1st = isFirstPick

  const firstPickTeam: 1 | 2 = (winnerIsT1 && winnerWants1st) || (!winnerIsT1 && !winnerWants1st) ? 1 : 2

  const nextState: DraftCoinState = {
    ...coinState,
    status: 'completed',
    callerTeam,
    isFirstPick,
    firstPickTeam,
  }

  await setDraftCoinState(guildId, nextState)
  await updateDraftUIMessage(guildId, interaction)
}

/**
 * Handles picking a player via player button click
 */
export async function handleDraftPickButton(interaction: ButtonInteraction<CacheType>, pickedPlayerDiscordId: string) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  // Instantly acknowledge button interaction to Discord (< 50ms) to prevent timeouts
  await safeDeferUpdate(interaction)
  const mode = (await getSetting('draft_mode', guildId)) ?? 'captains'

  const sortedPlayers = await getSortedActivePlayers(guildId, true)
  const { team1, team2, t1Captain, t2Captain } = await getTeams(guildId, sortedPlayers)
  const coinState = await getDraftCoinState(guildId)
  const firstPickTeam = getFirstPickTeam(coinState)
  const turnInfo = getCurrentDraftTurn({ 1: team1.length, 2: team2.length }, sortedPlayers.length, firstPickTeam)

  const isT1Captain = interaction.user.id === t1Captain.discordId
  const isT2Captain = interaction.user.id === t2Captain.discordId

  if (mode === 'captains') {
    if (coinState && coinState.status !== 'completed') {
      await safeReply(interaction, {
        content: '✋ Please complete the coin toss & pick order selection before picking players!',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      })
      return
    }

    // 1. Must be a captain
    if (!isT1Captain && !isT2Captain) {
      await safeReply(interaction, {
        content: '⛔ Only designated team captains can pick players in Captains Mode!',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      })
      return
    }

    // 2. Must be active captain's turn
    const activeCaptainId = turnInfo.currentTeam === 1 ? t1Captain.discordId : t2Captain.discordId
    if (interaction.user.id !== activeCaptainId) {
      const activeCaptainObj = sortedPlayers.find(p => p.discordId === activeCaptainId)
      const activeName = activeCaptainObj ? `@${activeCaptainObj.usernames?.discordDisplayName}` : 'assigned captain'
      await safeReply(interaction, {
        content: `✋ Not your turn! It's Team ${turnInfo.currentTeam} Captain's (${activeName}) turn to pick.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      })
      return
    }
  }

  // Determine assigned team
  const assignedTeam = mode === 'captains' ? turnInfo.currentTeam : mode === 'free_team1' ? 1 : 2

  // Assign player in DB with next draft order (#3, #4, #5...)
  const nextOrder = await getNextDraftOrder(guildId)
  await assignPlayerToTeam(guildId, pickedPlayerDiscordId, assignedTeam, nextOrder)

  await updateDraftUIMessage(guildId, interaction)
}

/**
 * Handles the /draft_undo command interaction or Undo button click
 */
export async function handleDraftUndoCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  let count = 1
  let all = false

  if (interaction.isChatInputCommand()) {
    count = interaction.options.getInteger('count') ?? 1
    all = interaction.options.getBoolean('all') ?? false
  } else {
    // Instantly acknowledge button interaction to Discord to prevent timeouts
    await safeDeferUpdate(interaction)
  }

  const { team1, team2, t1Captain, t2Captain } = await getTeams(guildId)
  const allTeams = [...team1, ...team2]

  const nonCaptainPicks = allTeams
    .filter(p => p.discordId !== t1Captain.discordId && p.discordId !== t2Captain.discordId)
    .sort((a, b) => (b.draftOrder ?? 0) - (a.draftOrder ?? 0))

  const picksToUndo = nonCaptainPicks.slice(0, all ? nonCaptainPicks.length : count)

  for (const player of picksToUndo) {
    await assignPlayerToTeam(guildId, getPlayerIdentifier(player), null, null)
  }

  if (all || picksToUndo.length === nonCaptainPicks.length) {
    if (t1Captain && t2Captain) {
      await setDraftCoinState(guildId, {
        status: 'awaiting_call',
        callerTeam: Math.random() < 0.5 ? 1 : 2,
      })
    }
  }

  const numUndone = picksToUndo.length

  await updateDraftUIMessage(guildId, interaction)

  if (interaction.isChatInputCommand()) {
    const message = all
      ? 'Undid all draft picks! Teams have been reset back to captains.'
      : numUndone > 0
        ? `Undid the last ${numUndone} draft pick(s).`
        : 'No draft picks to undo.'
    await safeReply(interaction, {
      content: message,
      flags: MessageFlags.Ephemeral,
    })
  }
}

/**
 * Handles the /draft_team_assign command interaction to assign or move a player to
 * Team 1, Team 2, or Spectators mid-draft.
 */
export async function handleDraftTeamAssignCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand()) {
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const targetTeamOption = interaction.options.getString('team', true)
  const playerDiscordId = interaction.options.getString('player', true)

  const activePlayers = await getSortedActivePlayers(guildId, true)
  const player =
    activePlayers.find(p => p.discordId === playerDiscordId) ??
    activePlayers.find(
      p =>
        p.usernames?.discordDisplayName?.toLowerCase() === playerDiscordId.toLowerCase() ||
        p.usernames?.discordGlobalName?.toLowerCase() === playerDiscordId.toLowerCase() ||
        p.usernames?.discordName?.toLowerCase() === playerDiscordId.toLowerCase() ||
        p.usernames?.accounts?.some(acc => acc.hotsBattleTag?.toLowerCase() === playerDiscordId.toLowerCase())
    )

  if (!player) {
    await safeReply(interaction, {
      content: 'Player not found in active lobby.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const playerName = player.usernames?.discordDisplayName ?? 'Player'

  if (targetTeamOption === 'spectator') {
    if (player.team !== 1 && player.team !== 2) {
      await safeReply(interaction, {
        content: `**${playerName}** is already a spectator (not on a team).`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await assignPlayerToTeam(guildId, getPlayerIdentifier(player), null, null)

    await updateDraftUIMessage(guildId, interaction)

    const sentReply = await safeReply(interaction, {
      content: `Moved **${playerName}** to Spectators.`,
      flags: MessageFlags.Ephemeral,
    })
    await sentReply?.delete()
  } else {
    const targetTeam = parseInt(targetTeamOption, 10)
    if (player.team === targetTeam) {
      await safeReply(interaction, {
        content: `**${playerName}** is already on Team ${targetTeam}.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const draftOrder = player.draftOrder || (await getNextDraftOrder(guildId))
    await assignPlayerToTeam(guildId, getPlayerIdentifier(player), targetTeam, draftOrder)

    await updateDraftUIMessage(guildId, interaction)

    const sentReply = await safeReply(interaction, {
      content: `Assigned **${playerName}** to Team ${targetTeam}.`,
      flags: MessageFlags.Ephemeral,
    })
    await sentReply?.delete()
  }
}

/**
 * Handles the Mode Toggle button click
 */
export async function handleDraftToggleModeButton(interaction: ButtonInteraction<CacheType>) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  await safeDeferUpdate(interaction)

  const currentMode = (await getSetting('draft_mode', guildId)) ?? 'captains'
  let newMode = 'captains'
  if (currentMode === 'captains') {
    newMode = 'free_team1'
  } else if (currentMode === 'free_team1') {
    newMode = 'free_team2'
  } else {
    newMode = 'captains'
  }
  await setSetting('draft_mode', newMode, guildId)

  await updateDraftUIMessage(guildId, interaction)
}

/**
 * Handles the /draft_mode command interaction
 */
export async function handleDraftModeCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand()) {
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const mode = interaction.options.getString('mode', true)
  await setSetting('draft_mode', mode, guildId)

  await updateDraftUIMessage(guildId, interaction)

  let modeLabel = 'Captains Mode (1-2-2 Rotation)'
  if (mode === 'free_team1') modeLabel = 'Free Pick ➡️ Team 1 (🔵)'
  if (mode === 'free_team2') modeLabel = 'Free Pick ➡️ Team 2 (🔴)'

  await safeReply(interaction, {
    content: `Switched draft mode to **${modeLabel}**!`,
    flags: MessageFlags.Ephemeral,
  })
}

