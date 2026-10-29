import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  CacheType,
  ChatInputCommandInteraction,
  Message,
  MessageFlags,
} from 'discord.js'
import {
  addAccountBtn,
  adminUserIds,
  chatOrButtonOrModal,
  CommandIds,
  imPlayingBtn,
  leaveBtn,
  rejoinBtn,
  roleBtn,
} from '../constants'
import { client } from '../index'
import { getLobbyMessages, saveLobbyMessage } from '../store/channels'
import {
  getActivePlayers,
  getPlayerByDiscordId,
  getPlayerRolesFormatted,
  getSubstitutedAccountOwnerTag,
  handleAddHotsAccount,
  isFetchingMmr,
  markAllPlayersInactive,
  savePlayer,
  setPlayerActive,
  triggerAccountMmrFetch,
} from '../store/player'
import { Player } from '../types/player'
import { announce, safePing } from '../utils/announce'
import { getBotChannel } from '../utils/channel'
import { validateBattleTag } from '../utils/heroesOfTheStorm'
import { requireGuildId, safeReply } from '../utils/interaction'
import { handleEditRoleCommand } from './accounts'
import { updateAdminActiveButtons } from './admin'
import { syncRecentReplays } from './replays'
import { processAndApplyLobbyScan } from './scanLobby'
import { fetchDiscordNames, handleUserNameModalSubmit } from './shared'

/**
 * Generates the current lobby status message with active players
 * @returns The formatted lobby status message
 */
async function generateLobbyStatusMessage(guildId: string, pPreviousPlayersList?: string): Promise<string> {
  const lobbyMessages = await getLobbyMessages(guildId, [CommandIds.NEW_GAME])
  const prevPlayersFromDb: string[] = JSON.parse(lobbyMessages?.[0]?.previousPlayersList ?? '[]')
  const previousPlayersMessage = generatePreviousPlayersMessage(prevPlayersFromDb)
  const previousPlayersList = pPreviousPlayersList ?? previousPlayersMessage ?? ''
  const activePlayers = await getActivePlayers(guildId)
  activePlayers.sort((a, b) => a.lastActive.getTime() - b.lastActive.getTime()) // sort by last_active ascending
  const lobbyPlayers = activePlayers.map((p, index) => {
    const subAccount = p.usernames.accounts?.find(a => a.ownerDiscordId)
    const primaryAccount = subAccount ?? p.usernames.accounts?.find(a => a.isPrimary)
    let accountDisplay = primaryAccount
      ? primaryAccount.hotsBattleTag.replace(/#.*$/, '')
      : 'hots account missing! :scream:'
    if (primaryAccount?.ownerDiscordId) {
      accountDisplay += getSubstitutedAccountOwnerTag(primaryAccount.ownerDiscordId, guildId)
    }

    const hasSingleAccount = p.usernames.accounts?.length === 1
    const acc = p.usernames.accounts?.[0]
    let isLoading = false
    let isError = false
    if (hasSingleAccount && acc) {
      if (isFetchingMmr(acc.hotsBattleTag)) {
        isLoading = true
      } else if (acc.hpSlGames === null && acc.hpQmGames === null && acc.hpArGames === null) {
        isLoading = true
        triggerAccountMmrFetch(acc.hotsBattleTag, guildId).catch(err => {
          console.error(`Error triggering MMR fetch for ${acc.hotsBattleTag}:`, err)
        })
      } else if (acc.hpSlGames === -1 && acc.hpQmGames === -1 && acc.hpArGames === -1) {
        isError = true
      }
    }

    return `${index + 1}: @${p.usernames.discordDisplayName}: (${accountDisplay}) \`${getPlayerRolesFormatted(p.role)}\`${
      isLoading ? ' loading MMR...' : ''
    }${isError ? ' MMR error!... :scream:' : ''}`
  })

  // combine the lobbyPlayers and previousPlayersList, into one string, labeling each section, but skip a section if there are no players in that section
  const playerListWithLabels = []
  if (previousPlayersList) playerListWithLabels.push(`__**Previous Players**__:\n${previousPlayersList}`)
  playerListWithLabels.push(
    `__**Players in the lobby**__: (${lobbyPlayers.length})\n${lobbyPlayers.join('\n') || 'The lobby is empty.'}`
  )
  if (playerListWithLabels.length === 0) {
    playerListWithLabels.push(`**No Active Players**`)
  }
  const playerListWithLabelsString = playerListWithLabels.join('\n')

  return `A new game has started! All players have been marked as inactive.\n\n${playerListWithLabelsString}\n\nPlease click below if you are going to play.`
}

/** generates the list of previous players */
async function generatePreviousPlayersList(guildId: string): Promise<string[]> {
  return (await getActivePlayers(guildId))
    .map(p => p.discordId)
    .filter((id): id is string => typeof id === 'string')
}

function generatePreviousPlayersMessage(previousPlayersList: string[]): string {
  if (previousPlayersList.length === 0) {
    return '**No Previous Players**'
  }
  return previousPlayersList.map(discordId => `<@${discordId}>`).join(' ')
}

/**
 * Updates the lobby announcement message with current player status
 * @param interaction The interaction object for guild access
 */
export async function updateLobbyMessage(
  guildId: string,
  interaction?: chatOrButtonOrModal,
  previousPlayersList?: string[]
) {
  if (interaction) {
    await updateAdminActiveButtons(interaction, previousPlayersList)
  }

  const lobbyMessages = await getLobbyMessages(guildId, [CommandIds.NEW_GAME])
  if (!lobbyMessages || lobbyMessages.length === 0) {
    return // No lobby message to update
  }

  try {
    const targetChannel =
      interaction?.guild?.channels.cache.get(lobbyMessages[0].channelId) ??
      (client?.isReady() ? await client.channels.fetch(lobbyMessages[0].channelId).catch(() => null) : null)
    if (targetChannel?.isTextBased()) {
      const message = await targetChannel.messages.fetch(lobbyMessages[0].messageId)
      // purposely don't pass in the previousPlayersList, so it uses the stored value in the database
      const updatedContent = await generateLobbyStatusMessage(guildId)
      await message.edit({
        content: updatedContent,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(imPlayingBtn)],
      })
    }
  } catch (error) {
    console.error('Failed to update lobby message:', error)
    // If the message doesn't exist anymore, clear the stored reference
  }
}

export async function handleNewGameCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const botChannel = await getBotChannel(interaction.guild)
  const isBotChannel = botChannel ? interaction.channelId === botChannel.id : false

  const screenshot = interaction.isChatInputCommand() ? interaction.options.getAttachment(CommandIds.SCREENSHOT) : null
  const sync = interaction.isChatInputCommand() ? (interaction.options.getBoolean(CommandIds.SYNC) ?? false) : false

  if (screenshot) {
    if (isBotChannel) {
      await interaction.deferReply()
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    }
  }

  try {
    await syncRecentReplays(guildId)
  } catch (err) {
    console.error('Error auto-syncing replays during /new_game:', err)
  }

  /**
   * Array of discord IDs of the players that were active before starting the new game
   */
  const previousPlayersList = await generatePreviousPlayersList(guildId)
  await markAllPlayersInactive(guildId)

  // Generate the initial lobby status message
  const previousPlayersMessage = generatePreviousPlayersMessage(previousPlayersList)
  const lobbyStatusMessage = await generateLobbyStatusMessage(guildId, previousPlayersMessage)

  let sentMessage: Message<boolean> | undefined

  if (isBotChannel) {
    if (screenshot) {
      await interaction.editReply({
        content: lobbyStatusMessage,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(imPlayingBtn)],
      })
      sentMessage = await interaction.fetchReply()
    } else {
      await interaction.reply({
        content: lobbyStatusMessage,
        flags: safePing(undefined),
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(imPlayingBtn)],
      })
      sentMessage = await interaction.fetchReply()
    }
  } else {
    sentMessage = await announce(interaction, {
      content: lobbyStatusMessage,
      flags: safePing(undefined),
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(imPlayingBtn)],
    })
  }

  // Store the message ID so we can update it later
  if (sentMessage) {
    await saveLobbyMessage(
      guildId,
      CommandIds.NEW_GAME,
      sentMessage.id,
      sentMessage.channelId,
      JSON.stringify(previousPlayersList)
    )
  }

  // Send the admin buttons via followUp (or reply if run outside bot channel without defer)
  if (adminUserIds.includes(interaction.user.id)) {
    const isFollowUp = screenshot ? true : isBotChannel
    await updateAdminActiveButtons(interaction, previousPlayersList, true, isFollowUp)
  } else if (!isBotChannel && screenshot) {
    await interaction.editReply({
      content: 'A new game has been started in the bot channel.',
    })
  }

  if (screenshot) {
    try {
      await processAndApplyLobbyScan(interaction, guildId, screenshot, sync, {
        updateLobby: true,
        reportAsFollowUp: isBotChannel,
      })
    } catch (scanErr) {
      console.error('Failed to scan lobby screenshot in /new_game:', scanErr)
      await interaction.followUp({
        content:
          '❌ Failed to scan lobby screenshot. Please ensure it is a clear in-game screenshot of the custom game lobby.',
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}

/***
 * Handles the leave command interaction, marks the player as inactive and allows them to rejoin later
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 */
export async function handleLeaveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const { player } = await setPlayerActive(interaction.user.id, false, guildId) // Mark player as inactive in the database
  await updateLobbyMessage(guildId, interaction)
  if (player) {
    // Update the lobby message instead of announcing
    await safeReply(interaction, {
      content: `You left the lobby`,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(rejoinBtn)],
    })
  } else {
    await safeReply(interaction, {
      content: 'You are not in the lobby',
      flags: MessageFlags.Ephemeral,
    })
  }
}

export async function handleClearCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  await markAllPlayersInactive(guildId) // Mark all players as inactive in the database
  await updateLobbyMessage(guildId, interaction) // Update the lobby message to show no players
  await safeReply(interaction, {
    content: 'All players have been removed from the lobby.',
    flags: MessageFlags.Ephemeral,
  })
}

/**
 *  Handles the rejoin command interaction, allows a user to rejoin the lobby with their previous battle tag and role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 */
export async function handleRejoinCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  newUser = false,
  pBattleTag?: string
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  // first check it the user has a hotsBattleTag in the database
  const existingPlayer = await getPlayerByDiscordId(interaction.user.id, guildId)
  if (!existingPlayer?.usernames.accounts?.find(a => a.isPrimary)) {
    // if they don't have a hotsBattleTag, show the modal to collect it
    await showJoinModal(guildId, interaction, pBattleTag)
    return
  }
  const { player, updated } = await setPlayerActive(interaction.user.id, true, guildId) // Mark player as active in the database
  if (player) {
    // always update the lobby message instead of announcing
    await updateLobbyMessage(guildId, interaction)
    const joinVerb = newUser ? 'joined' : 'rejoined'
    const content =
      (updated === false ? `You are already in` : `You have ${joinVerb}`) +
      ` the lobby as: \`${player.usernames.accounts
        ?.find(a => a.isPrimary)
        ?.hotsBattleTag.replace(/#.*$/, '')}\`, \`${getPlayerRolesFormatted(
        player.role
      )}\`\nUse /leave to leave the lobby, or use the buttons below.`
    await safeReply(interaction, {
      content,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, addAccountBtn, roleBtn)],
    })
    return
  }
  if (player === undefined) {
    // show a dialog to collect the battle tag and role
    await showJoinModal(guildId, interaction)
  }
}

/**
 * Shows a modal to the user to collect their battle tag and role, then returns the data to the handleJoinCommand function
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns { Promise<void> }
 */
export async function showJoinModal(
  guildId: string,
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pBattleTag?: string
): Promise<void> {
  const { hotsBattleTag, modalInteraction } = await handleUserNameModalSubmit(
    interaction,
    guildId,
    undefined,
    pBattleTag
  )
  if (!modalInteraction || !hotsBattleTag) {
    // If modal interaction is undefined, it means the user did not respond in time
    return
  }
  const validationResult = validateBattleTag(hotsBattleTag)
  if (!validationResult.isValid) {
    await safeReply(modalInteraction, {
      content: `You must provide a valid Heroes of the Storm battle tag in the format \`Name#1234\`.\nYou provided: \`${hotsBattleTag}\`
${validationResult.errors.join('\n')}
${validationResult.rules}
      `,
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  let roleSelectMenuDisplayed = false
  let hpCalled = false
  const discordData = fetchDiscordNames(modalInteraction)
  const player = await getPlayerByDiscordId(modalInteraction.user.id, guildId)
  if (!player) {
    await savePlayer(
      interaction,
      modalInteraction.user.id,
      {
        discordId: modalInteraction.user.id,
        usernames: { ...discordData },
        active: false,
        team: null,
        lobbyRank: NaN,
        draftOrder: NaN,
        adjustment: null,
        mmr: 0,
        lastActive: new Date(),
      },
      hotsBattleTag
    )
    hpCalled = true
  }
  const currentPlayer = player ?? (await getPlayerByDiscordId(modalInteraction.user.id, guildId))
  if (!currentPlayer?.role) {
    // only show the edit role buttons if the player doesn't have a role yet
    await handleEditRoleCommand(modalInteraction, true, hotsBattleTag) // Show the edit role buttons
    roleSelectMenuDisplayed = true
  }
  if (!roleSelectMenuDisplayed) {
    await setPlayerActive(modalInteraction.user.id, true, guildId, hotsBattleTag)
    await updateLobbyMessage(guildId, modalInteraction)
    const reply = await safeReply(modalInteraction, {
      content: `Looking up \`${hotsBattleTag}\` please wait...`,
      flags: MessageFlags.Ephemeral,
    })
    await new Promise(resolve => setTimeout(resolve, 8000))
    await reply?.delete()
  }
  if (
    !hpCalled &&
    !player?.usernames.accounts?.find(a => a.hotsBattleTag.toLowerCase() === hotsBattleTag.toLowerCase())
  ) {
    await handleAddHotsAccount(modalInteraction, modalInteraction.user.id, hotsBattleTag)
  }
}

export async function handleRefreshLobbyMessage(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  reply: boolean = true
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  await updateLobbyMessage(guildId, interaction)
  if (reply) {
    const replyMessage = await safeReply(interaction, {
      content: 'Lobby messages refreshed.',
      flags: MessageFlags.Ephemeral,
    })
    await replyMessage?.delete()
  }
}

/**
 * Handles the join command interaction, adds the user to the lobby with their battle tag and role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 */
export async function handleJoinCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pBattleTag?: string
) {
  if (interaction.isButton()) {
    await handleRejoinCommand(interaction, true, pBattleTag)
    return // If it's a button interaction, we handle rejoin directly
  }
  const role = interaction.options.getString(CommandIds.ROLE, true)
  const discordData = fetchDiscordNames(interaction)
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG, true)
  const newPlayer: Player = {
    discordId: interaction.user.id,
    usernames: { ...discordData },
    role,
    active: true,
    team: null,
    lobbyRank: NaN,
    draftOrder: NaN,
    adjustment: null,
    mmr: 0,
    lastActive: new Date(),
  }
  await savePlayer(interaction, interaction.user.id, newPlayer, hotsBattleTag) // Save player data to the database
  // announce in the channel who has joined
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  await handleUserJoined(guildId, interaction)
}

/**
 * Handles the user joining the lobby, announces their presence and provides buttons for further actions
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 */
async function handleUserJoined(guildId: string, interaction: chatOrButtonOrModal) {
  // Update the lobby message instead of announcing
  await updateLobbyMessage(guildId, interaction)

  const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, addAccountBtn, roleBtn)]
  await safeReply(interaction, {
    components,
    flags: MessageFlags.Ephemeral,
  })
}

