import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonComponent,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionResponse,
  Message,
  MessageFlags,
} from 'discord.js'
import { adminUserIds, chatOrButtonOrModal, CommandIds, joinBtn, roleMap } from '../constants'
import { getLobbyMessages } from '../store/channels'
import { getUnlinkedReplayAccounts } from '../store/hotsReplays'
import {
  findPlayersByHotSAccount,
  getActivePlayers,
  getPlayerByDiscordId,
  getPlayerByIdentifier,
  getPlayerIdentifier,
  getPlayerMMR,
  getPlayerRolesFormatted,
  getStoredInteraction,
  setPlayerActive,
  setPlayerAdjustment,
  setPlayerRole,
  storeInteraction,
} from '../store/player'
import { Player } from '../types/player'
import { requireGuildId, safeDeferUpdate, safeReply, safeUpdate } from '../utils/interaction'
import { updateLobbyMessage } from './lobby'
import {
  createButtonRows,
  createEditRoleButtonDisabled,
  createEditRoleButtonEnabled,
  extractDiscordIdFromInteraction,
  formatDateToMMDDYYYY,
  getEditRoleRow,
  getMemberFromInteraction,
  userIsAdmin,
} from './shared'

/**
 * Handles the edit role command interaction, shows buttons to edit the user's role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param discordId The Discord ID of the user to edit the role for.
 */
export async function handleAdminShowRoleButtons(
  interaction: ButtonInteraction<CacheType> | ChatInputCommandInteraction<CacheType>,
  discordId: string
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const player = await getPlayerByDiscordId(discordId, guildId) // Get player by Discord ID
  if (!player) {
    if (interaction.replied) {
      await interaction.followUp({
        content: 'You are not in the lobby. Click the button below to join.',
        flags: MessageFlags.Ephemeral,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
      })
      return
    }
    await safeReply(interaction, {
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    })
    return
  }
  const roles = ', current role: ' + getPlayerRolesFormatted(player.role)
  // create a button that will set this interaction to add mode
  const row2 = getEditRoleRow(discordId, CommandIds.ROLE_EDIT_REPLACE)
  const content = (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + 'Replace Mode' + roles // Default content for the reply
  await safeReply(interaction, {
    content,
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_ADD, '➕'),
        createEditRoleButtonEnabled(discordId, CommandIds.ROLE_EDIT_REPLACE, '🔄'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REMOVE, '➖')
      ),
      row2,
    ],
  })
}

export function handleAdminSetRoleCommand(interaction: ChatInputCommandInteraction<CacheType>): Promise<void>
export function handleAdminSetRoleCommand(
  interaction: ButtonInteraction<CacheType>,
  discordId: string,
  pRole: keyof typeof roleMap
): Promise<void>
export async function handleAdminSetRoleCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordId?: string,
  pRole?: keyof typeof roleMap
) {
  if (!(await userIsAdmin(interaction))) {
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const member = await getMemberFromInteraction(interaction, guildId, discordId)
  if (member === null) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to set their name.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const role = pRole ? pRole : interaction.isChatInputCommand() && interaction.options.getString(CommandIds.ROLE, false)
  if (interaction.isChatInputCommand() && !role) {
    await handleAdminShowRoleButtons(interaction, member)
    return
  }
  if (!role) {
    await safeReply(interaction, {
      content: 'Please provide a valid role to set for the member.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const id = member
  const player = await setPlayerRole(id, guildId, role)
  if (player === false) {
    await safeReply(interaction, {
      content: 'Player not found in the lobby. Please make sure they have joined first.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  // update the lobby message if the player is active
  if (player.active) {
    await updateLobbyMessage(guildId, interaction)
  }
  await safeReply(interaction, {
    content: `Set <@${id}>'s role to \`${getPlayerRolesFormatted(role)}\``,
    flags: MessageFlags.Ephemeral,
  })
}

function getActiveFromInteraction(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pActive: boolean
): boolean {
  if (interaction.isChatInputCommand()) {
    return interaction.options.getBoolean(CommandIds.ACTIVE, false) ?? pActive
  }
  // If it's a button interaction, we assume the active status is true
  return pActive ?? true // Default to true if not provided
}

export async function handleAdminSetActiveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
): Promise<void>
export async function handleAdminSetActiveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  previousPlayersList: string[]
): Promise<void>
export async function handleAdminSetActiveCommand(
  interaction: ButtonInteraction<CacheType>,
  pDiscordId: string,
  pActive?: boolean
): Promise<void>
export async function handleAdminSetActiveCommand(
  interaction: ButtonInteraction<CacheType>,
  pDiscordId: string,
  pActive?: boolean,
  isAdminActiveButton?: boolean
): Promise<void>
export async function handleAdminSetActiveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pDiscordIdOrDiscordIdArray?: string | string[],
  pActive?: boolean,
  isAdminActiveButton = false
): Promise<void> {
  if (!(await userIsAdmin(interaction))) {
    await safeReply(interaction, {
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  let pDiscordId: string | undefined = undefined
  let previousPlayersList: string[] | undefined = undefined
  if (Array.isArray(pDiscordIdOrDiscordIdArray)) {
    previousPlayersList = pDiscordIdOrDiscordIdArray
  } else if (typeof pDiscordIdOrDiscordIdArray === 'string') {
    pDiscordId = pDiscordIdOrDiscordIdArray
  }

  let playerIdentifier: string | null = null
  let matchedBattleTag: string | undefined = undefined

  if (interaction.isChatInputCommand()) {
    const targetDiscordId = extractDiscordIdFromInteraction(interaction, CommandIds.DISCORD_ID)
    const battleTag = interaction.options.getString(CommandIds.BATTLE_TAG, false)?.trim()

    if (battleTag) {
      const matches = await findPlayersByHotSAccount(battleTag, guildId)
      if (matches.length === 0) {
        playerIdentifier = battleTag
        matchedBattleTag = battleTag
      } else {
        let matchedPlayer: Player | undefined = undefined
        if (targetDiscordId) {
          const matchWithDiscordId = matches.find(m => m.player.discordId === targetDiscordId)
          if (matchWithDiscordId) {
            matchedPlayer = matchWithDiscordId.player
            matchedBattleTag = matchWithDiscordId.matchedAccounts[0]?.hotsBattleTag
          }
        }

        if (!matchedPlayer) {
          if (matches.length === 1) {
            matchedPlayer = matches[0].player
            matchedBattleTag = matches[0].matchedAccounts[0]?.hotsBattleTag
          } else {
            const exactMatch = matches.find(m =>
              m.matchedAccounts.some(a => a.hotsBattleTag.toLowerCase() === battleTag.toLowerCase())
            )
            if (exactMatch) {
              matchedPlayer = exactMatch.player
              matchedBattleTag = exactMatch.matchedAccounts.find(
                a => a.hotsBattleTag.toLowerCase() === battleTag.toLowerCase()
              )?.hotsBattleTag
            } else {
              const matchesSummary = matches
                .slice(0, 10)
                .map(
                  m =>
                    `• ${m.player.discordId ? `<@${m.player.discordId}>` : `**${m.player.usernames.discordDisplayName}**`} (${m.matchedAccounts.map(a => `\`${a.hotsBattleTag}\``).join(', ')})`
                )
                .join('\n')
              await safeReply(interaction, {
                content: `Multiple players matched \`${battleTag}\`. Please choose a specific BattleTag from autocomplete or specify the Discord user:\n${matchesSummary}`,
                flags: MessageFlags.Ephemeral,
              })
              return
            }
          }
        }

        playerIdentifier = matchedPlayer ? getPlayerIdentifier(matchedPlayer) : null
      }
    } else if (targetDiscordId) {
      playerIdentifier = targetDiscordId
    }
  } else if (pDiscordId) {
    playerIdentifier = pDiscordId
  }

  if (playerIdentifier === null) {
    await handleAdminShowPlayerActiveButtons(interaction, previousPlayersList)
    return
  }
  const storedPlayer = await getPlayerByIdentifier(playerIdentifier, guildId)
  if (storedPlayer && pActive === undefined) {
    pActive = !storedPlayer.active // Toggle the active status if not provided
  } else {
    pActive = pActive ?? true // Default to true if not provided
  }
  const isActive = getActiveFromInteraction(interaction, pActive) // Get the active status from the interaction or use the provided value
  const id = playerIdentifier
  const { player, updated } = await setPlayerActive(id, isActive, guildId, matchedBattleTag) // Set player as active in the database
  if (!player) {
    await safeReply(interaction, {
      content: 'Player not found in the lobby. Please make sure they have joined first.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  if (updated) {
    const targetId = getPlayerIdentifier(player)
    const adminJoinBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.JOIN}_${targetId}`)
      .setLabel('Admin Join')
      .setStyle(ButtonStyle.Primary)
    const adminLeaveBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.LEAVE}_${targetId}`)
      .setLabel('Admin Leave')
      .setStyle(ButtonStyle.Danger)
    const adminAddAccountBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.ADD_ACCOUNT}_${targetId}`)
      .setLabel('Admin Add Account')
      .setStyle(ButtonStyle.Secondary)
    const adminRoleBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.ROLE}_${targetId}`)
      .setLabel('Admin Role')
      .setStyle(ButtonStyle.Secondary)
    if (!isAdminActiveButton) {
      const tagText = matchedBattleTag ? ` (\`${matchedBattleTag}\`)` : ''
      const mentionOrName = player.discordId ? `<@${player.discordId}>` : `**${player.usernames.discordDisplayName}**`
      await safeReply(interaction, {
        content: `Set ${mentionOrName}${tagText}'s active status to \`${isActive ? CommandIds.ACTIVE : CommandIds.INACTIVE}\``,
        flags: MessageFlags.Ephemeral,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            isActive ? adminLeaveBtn : adminJoinBtn,
            adminAddAccountBtn,
            adminRoleBtn
          ),
        ],
      })
    }
    await updateLobbyMessage(guildId, interaction, previousPlayersList)
  } else {
    if (isAdminActiveButton) {
      await updateLobbyMessage(guildId, interaction, previousPlayersList)
    } else {
      const primaryTag = player.usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag
      const displayName = matchedBattleTag ?? primaryTag ?? player.usernames.discordDisplayName ?? id
      await safeReply(interaction, {
        content: `${displayName.replace(/#.*$/, '')} is already ${isActive ? CommandIds.ACTIVE : CommandIds.INACTIVE}.`,
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}

async function handleAdminShowPlayerActiveButtons(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  previousPlayersList?: string[]
) {
  if ((await userIsAdmin(interaction)) === false) {
    await safeReply(interaction, {
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  await updateAdminActiveButtons(interaction, previousPlayersList, true)
}

/**
 * Gets the players in voice channels across the current server (guild), then looks up those players in the database and returns them as an array.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param previousPlayersList Optional list of previous player IDs.
 * @returns An array of Player objects that are in voice channels in the server and found in the database.
 */
async function getPlayersByGuild(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  previousPlayersList?: string[]
): Promise<Player[]> {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return []
  // get the users from the interaction's buttons
  const storedInteraction = getStoredInteraction(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}`, interaction.channelId)

  // get previously stored players from the buttons of the previously stored interaction
  const players = await getPreviousSetActivePlayers(storedInteraction, guildId)
  const previousPlayers = await getLobbyPreviousPlayers(guildId, previousPlayersList)
  const activePlayers = await getActivePlayers(guildId)
  const hasPlayer = (list: Player[], target: Player) => {
    const targetId = getPlayerIdentifier(target)
    return list.some(p => {
      const pId = getPlayerIdentifier(p)
      if (pId && targetId) return pId === targetId
      if (p.discordId && target.discordId) return p.discordId === target.discordId
      return false
    })
  }

  players.push(...previousPlayers.filter(lp => !hasPlayer(players, lp)))
  players.push(...activePlayers.filter(ap => !hasPlayer(players, ap)))

  // Always include the command runner if they are registered
  const selfPlayer = await getPlayerByDiscordId(interaction.user.id, guildId)
  if (selfPlayer && !hasPlayer(players, selfPlayer)) {
    players.push(selfPlayer)
  }

  if (interaction.guild) {
    for (const [, voiceState] of interaction.guild.voiceStates.cache) {
      if (voiceState.channelId) {
        const player = await getPlayerByDiscordId(voiceState.id, guildId)
        if (player && !hasPlayer(players, player)) {
          players.push(player)
        }
      }
    }
  }

  return players
}

async function getPreviousSetActivePlayers(
  storedInteraction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | undefined,
  guildId: string
): Promise<Player[]> {
  if (!storedInteraction) {
    return []
  }
  let reply: Message | null = null
  try {
    reply = await storedInteraction.fetchReply()
    if (!reply) {
      return []
    }
  } catch {
    return []
  }
  const acc: Player[] = []
  for (const actionRow of reply.components) {
    if ('components' in actionRow && Array.isArray(actionRow.components)) {
      for (const button of actionRow.components) {
        if (button instanceof ButtonComponent) {
          if (button.customId?.startsWith(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}_`)) {
            const parts = button.customId.split('_')
            const playerId = parts[2]
            if (playerId && playerId !== 'null') {
              const player = await getPlayerByIdentifier(playerId, guildId)
              if (player) {
                acc.push(player)
              }
            }
          }
        }
      }
    }
  }
  return acc
}

async function getLobbyPreviousPlayers(guildId: string, previousPlayersList?: string[]): Promise<Player[]> {
  if (previousPlayersList && previousPlayersList.length > 0) {
    const resolved = await Promise.all(
      previousPlayersList.map((discordId: string) => getPlayerByDiscordId(discordId, guildId))
    )
    return resolved.filter((player: Player | undefined): player is Player => player !== undefined)
  }
  const lobbyMessages = await getLobbyMessages(guildId, [CommandIds.NEW_GAME])
  if (!lobbyMessages || lobbyMessages.length === 0) {
    return [] // No lobby message to update
  }
  const playerIds: string[] = JSON.parse(lobbyMessages[0].previousPlayersList ?? '[]')
  const resolved = await Promise.all(
    (Array.isArray(playerIds) ? playerIds : []).map((discordId: string) => getPlayerByDiscordId(discordId, guildId))
  )
  return resolved.filter((player: Player | undefined): player is Player => player !== undefined)
}

const adminActiveMessageIds = new Map<string, string>()

export async function updateAdminActiveButtons(
  interaction: chatOrButtonOrModal,
  previousPlayersList?: string[],
  newMessage?: boolean,
  isFollowUp?: boolean
): Promise<void>
export async function updateAdminActiveButtons(
  interaction: chatOrButtonOrModal,
  newMessage?: boolean,
  fakeReply?: boolean
): Promise<void>
export async function updateAdminActiveButtons(
  interaction: chatOrButtonOrModal,
  param2?: boolean | string[],
  param3?: boolean,
  param4?: boolean
): Promise<void> {
  let previousPlayersList: string[] | undefined = undefined
  let newMessage = false
  let followUp = false

  if (Array.isArray(param2)) {
    previousPlayersList = param2
    newMessage = param3 ?? false
    followUp = param4 ?? false
  } else if (typeof param2 === 'boolean') {
    newMessage = param2
    followUp = param4 ?? false
  }

  if (interaction.isModalSubmit()) {
    await safeReply(interaction, {
      content: 'This command cannot be used in a modal.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const players = await getPlayersByGuild(interaction, previousPlayersList)
  if (players.length === 0) {
    await safeReply(interaction, {
      content: 'No players found in the server.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const refreshButton = new ButtonBuilder()
    .setCustomId(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}_${CommandIds.REFRESH}`)
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Success)

  const seenButtonIds = new Set<string>()
  const buttons: ButtonBuilder[] = []

  for (const player of players) {
    const playerId = getPlayerIdentifier(player)
    if (!playerId) continue
    const isActive = player.active
    const customId = `${CommandIds.ADMIN}_${CommandIds.ACTIVE}_${playerId}_${!isActive}`
    if (seenButtonIds.has(customId)) continue
    seenButtonIds.add(customId)

    const label =
      player.usernames.accounts?.find(account => account.isPrimary)?.hotsBattleTag.replace(/#.*$/, '') ??
      player.usernames.discordDisplayName ??
      player.usernames.discordGlobalName ??
      player.usernames.discordName ??
      'Unknown'

    buttons.push(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label.slice(0, 80))
        .setStyle(isActive ? ButtonStyle.Primary : ButtonStyle.Danger)
    )
  }

  buttons.push(refreshButton)

  if (newMessage) {
    if (interaction.isChatInputCommand() || interaction.isButton()) {
      await createNewAdminRoleButton(interaction, buttons, followUp)
    }
  } else {
    if (interaction.isButton() && interaction.customId.startsWith(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}`)) {
      await safeUpdate(interaction, {
        content: 'Click the buttons below to toggle the active status of the players in your server.',
        components: createButtonRows(buttons),
      })
      return
    }

    const storedInteraction = getStoredInteraction(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}`, interaction.channelId)
    const storedMsgId = adminActiveMessageIds.get(interaction.channelId)

    if (!storedInteraction) {
      if (adminUserIds.includes(interaction.user.id)) {
        if (interaction.isChatInputCommand() || interaction.isButton()) {
          await createNewAdminRoleButton(interaction, buttons, followUp)
        }
      }
      return
    }

    try {
      if (storedMsgId && 'webhook' in storedInteraction && storedInteraction.webhook) {
        await storedInteraction.webhook.editMessage(storedMsgId, {
          content: 'Click the buttons below to toggle the active status of the players in your server.',
          components: createButtonRows(buttons),
        })
      } else if (storedInteraction.deferred || storedInteraction.replied) {
        await storedInteraction.editReply({
          content: 'Click the buttons below to toggle the active status of the players in your server.',
          components: createButtonRows(buttons),
        })
      }
    } catch {
      // If edit fails (e.g. interaction expired), do not crash
    }
  }
}

async function createNewAdminRoleButton(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  buttons: ButtonBuilder[],
  followUp = false
) {
  let message: InteractionResponse<boolean> | Message<boolean> | undefined = undefined
  if (followUp) {
    message = await interaction.followUp({
      content: 'Click the buttons below to toggle the active status of the players in your server.',
      flags: MessageFlags.Ephemeral,
      components: createButtonRows(buttons),
      withResponse: true,
    })
  } else {
    message = await safeReply(interaction, {
      content: 'Click the buttons below to toggle the active status of the players in your server.',
      flags: MessageFlags.Ephemeral,
      components: createButtonRows(buttons),
      withResponse: true,
    })
  }
  if (message) {
    storeInteraction(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}`, interaction.channelId, interaction)
    if ('id' in message && typeof message.id === 'string') {
      adminActiveMessageIds.set(interaction.channelId, message.id)
    }
  }
}

/**
 * Handles the /player-adjust slash command to view or set a player's MMR adjustment.
 * @param interaction The ChatInputCommandInteraction object from Discord
 */
export async function handlePlayerAdjustCommand(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
  const guildId = await requireGuildId(interaction)
  if (!guildId) {
    return
  }

  const targetUser = interaction.options.getUser('player', true)
  const amount = interaction.options.getNumber('amount')

  const player = await getPlayerByDiscordId(targetUser.id, guildId)
  if (!player) {
    await safeReply(interaction, {
      content: `Player <@${targetUser.id}> was not found in the database.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const displayName = player.usernames.discordDisplayName || targetUser.username

  if (amount === null) {
    // View current adjustment
    const currentAdj = player.adjustment ?? 0
    const adjStr = currentAdj >= 0 ? `+${currentAdj}` : `${currentAdj}`
    const netMMR = getPlayerMMR(player)
    await safeReply(interaction, {
      content: `**${displayName}**'s current MMR adjustment is **${adjStr}** (Net MMR: **${netMMR}**).`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Update adjustment
  const result = await setPlayerAdjustment(targetUser.id, guildId, amount)
  if (!result) {
    await safeReply(interaction, {
      content: `Failed to update MMR adjustment for <@${targetUser.id}>.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const { previousAdjustment, updatedPlayer } = result
  const prevAdjVal = previousAdjustment ?? 0
  const prevAdjStr = prevAdjVal >= 0 ? `+${prevAdjVal}` : `${prevAdjVal}`
  const newAdjStr = amount >= 0 ? `+${amount}` : `${amount}`
  const newNetMMR = getPlayerMMR(updatedPlayer)

  await safeReply(interaction, {
    content: `Updated MMR adjustment for **${displayName}** from **${prevAdjStr}** to **${newAdjStr}** (Net MMR: **${newNetMMR}**).`,
  })
}

export async function handleAdminUnlinkedCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  page = 0,
  sortBy: 'recent' | 'games' = 'recent',
  minGames = 1,
  search = ''
) {
  if (interaction.isChatInputCommand()) {
    const rawMinGames = interaction.options.getInteger(CommandIds.MIN_GAMES)
    if (rawMinGames !== null && rawMinGames !== undefined) {
      minGames = Math.max(1, rawMinGames)
    }
    const rawSearch = interaction.options.getString(CommandIds.SEARCH)
    if (rawSearch !== null && rawSearch !== undefined) {
      search = rawSearch.trim()
    }
    const rawSort = interaction.options.getString(CommandIds.SORT)
    if (rawSort === 'games' || rawSort === 'recent') {
      sortBy = rawSort
    }
  }

  const pageSize = 10
  const { accounts, totalCount } = await getUnlinkedReplayAccounts({
    search,
    minGames,
    sortBy,
    limit: pageSize,
    offset: page * pageSize,
  })

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(Math.max(0, page), totalPages - 1)

  const embed = new EmbedBuilder()
    .setTitle(`🎮 Unlinked Replay Accounts (${currentPage + 1}/${totalPages})`)
    .setColor('#3498db')

  const filterDesc: string[] = []
  filterDesc.push(`Showing **${accounts.length}** of **${totalCount}** unlinked accounts`)
  filterDesc.push(`• Min games: **${minGames}**`)
  filterDesc.push(`• Sorted by: **${sortBy === 'recent' ? 'Most Recent' : 'Most Games'}**`)
  if (search) {
    filterDesc.push(`• Filter: \`${search}\``)
  }
  const header = filterDesc.join(' • ')

  if (accounts.length === 0) {
    const emptyMsg = search
      ? `No unlinked accounts matching \`${search}\` with at least ${minGames} game${minGames === 1 ? '' : 's'}.`
      : `No unlinked accounts with at least ${minGames} game${minGames === 1 ? '' : 's'}.`
    embed.setDescription(`${header}\n\n*${emptyMsg}*`)
  } else {
    const lines = accounts.map((acc, idx) => {
      const num = currentPage * pageSize + idx + 1
      const gamesStr = acc.gameCount === 1 ? '1 game' : `${acc.gameCount} games`
      const dateStr = acc.lastSeenDate ? formatDateToMMDDYYYY(new Date(acc.lastSeenDate)) : 'Unknown'
      const heroesStr = acc.heroesPlayed ? ` (${acc.heroesPlayed.split(',').slice(0, 3).join(', ')})` : ''
      return `**${num}. \`${acc.hotsBattleTag}\`** — ${gamesStr} • Last: ${dateStr}${heroesStr}\n↳ \`/admin add-account battle-tag:${acc.hotsBattleTag} discord-id:\``
    })
    embed.setDescription(`${header}\n\n${lines.join('\n\n')}`)
  }

  const encSearch = encodeURIComponent(search)
  const prevCustomId = `admin_unlinked_page_${currentPage - 1}_${sortBy}_${minGames}_${encSearch}`
  const nextCustomId = `admin_unlinked_page_${currentPage + 1}_${sortBy}_${minGames}_${encSearch}`
  const refreshCustomId = `admin_unlinked_page_${currentPage}_${sortBy}_${minGames}_${encSearch}`

  const prevButton = new ButtonBuilder()
    .setCustomId(prevCustomId)
    .setLabel('◀ Prev')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage <= 0)

  const pageIndicator = new ButtonBuilder()
    .setCustomId('admin_unlinked_page_noop')
    .setLabel(`${currentPage + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true)

  const nextButton = new ButtonBuilder()
    .setCustomId(nextCustomId)
    .setLabel('Next ▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage >= totalPages - 1)

  const refreshButton = new ButtonBuilder()
    .setCustomId(refreshCustomId)
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Primary)

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    prevButton,
    pageIndicator,
    nextButton,
    refreshButton
  )

  if (interaction.isButton()) {
    await interaction.update({
      embeds: [embed],
      components: [row],
    })
  } else {
    await safeReply(interaction, {
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    })
  }
}

export async function handleAdminUnlinkedButton(interaction: ButtonInteraction<CacheType>) {
  if (interaction.customId === 'admin_unlinked_page_noop') {
    await safeDeferUpdate(interaction)
    return
  }

  // Format: admin_unlinked_page_${page}_${sortBy}_${minGames}_${encSearch}
  const parts = interaction.customId.split('_')
  if (parts.length < 7) {
    await safeDeferUpdate(interaction)
    return
  }

  const page = parseInt(parts[3], 10) || 0
  const sortBy: 'recent' | 'games' = parts[4] === 'games' ? 'games' : 'recent'
  const minGames = parseInt(parts[5], 10) || 1
  const encSearch = parts.slice(6).join('_')
  const search = decodeURIComponent(encSearch)

  await handleAdminUnlinkedCommand(interaction, page, sortBy, minGames, search)
}

