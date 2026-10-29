import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Interaction,
  MessageFlags,
  VoiceChannel,
} from 'discord.js'
import { CommandIds, norDiscordId } from '../constants'
import { deleteLobbyMessages, getChannels, getLobbyMessages, saveLobbyMessage } from '../store/channels'
import {
  changeTeams,
  formatPlayerDisplay,
  getActivePlayers,
  getPlayerByDiscordId,
  getPlayerIdentifier,
  getPlayerMMR,
  getSortedActivePlayers,
  getStoredInteraction,
  getTeams,
  setTeamsFromPlayers,
  storeInteraction,
} from '../store/player'
import { Player } from '../types/player'
import { safePing } from '../utils/announce'
import { requireGuildId, safeReply } from '../utils/interaction'
import { scanLobbyScreenshot } from '../utils/lobbyScanner'
import { createTeams, isMakeTeamsMode, MakeTeamsMode } from '../utils/teamMaker'
import { matchesScanList } from './scanLobby'

/**
 * Handles the /load_teams command interaction, which loads teams from a JSON string provided in the command options.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 * note: If the interaction is not a command or button interaction, it logs an error and returns.
 * This function also sets the teams in the database, for use with the handleMoveToTeamsCommand and handleMoveToLobbyCommand functions.
 **/
export async function handleSetTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const originalTeamsData = interaction.options.getString('teams_data', true)
  const splitResult = originalTeamsData.split(',')
  const team1Input: number[] | null = splitResult[0]
    ?.split(/\W/)
    .map(n => parseInt(n, 10))
    .filter(n => !isNaN(n))
  const team2Input: number[] | null = splitResult[1]
    ?.split(/\W/)
    .map(n => parseInt(n, 10))
    .filter(n => !isNaN(n))
  // now that we have the new team assignments
  const sortedPlayers = await getSortedActivePlayers(guildId)
  sortedPlayers.forEach((p, index) => (p.lobbyRank = index))
  if (team1Input.length > sortedPlayers.length) {
    // the maximum length is the total number of players
    await safeReply(interaction, {
      content: `Too many players provided. There are currently ${sortedPlayers.length} players in total.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  // check if the teamsData contains any duplicates
  const uniqueTeamsData = Array.from(new Set(team1Input))
  if (uniqueTeamsData.length !== team1Input.length) {
    // Find the duplicates
    const duplicates = team1Input.filter((num, index) => team1Input.indexOf(num) !== index)
    const uniqueDuplicates = Array.from(new Set(duplicates))

    await safeReply(interaction, {
      content: `Duplicate player numbers provided: \`${uniqueDuplicates.join(
        ', '
      )}\`. Please provide each player number only once.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  // go through and subtract one from each number, so we're using 0-based indexes
  for (let i = 0; i < (team1Input.length ?? 0); i++) {
    team1Input[i] = team1Input[i] - 1
  }
  for (let i = 0; i < (team2Input?.length ?? 0); i++) {
    team2Input[i] = team2Input[i] - 1
  }

  // populate team 2
  const team2InputEffective =
    team2Input ??
    sortedPlayers.reduce((acc: number[], _, index: number) => {
      if (!team1Input.includes(index) && acc.length < 5) {
        acc.push(index)
      }
      return acc
    }, [])
  // now we have the two teams, we need to set them in the database
  // go through sortedPlayers, and assign lobbyRank
  const newTeam1: Player[] = sortedPlayers.filter(p => team1Input.includes(p.lobbyRank))
  const newTeam2: Player[] = sortedPlayers.filter(p => team2InputEffective.includes(p.lobbyRank))
  const newSpectators: Player[] = sortedPlayers.filter(
    p => !team1Input.includes(p.lobbyRank) && !team2InputEffective.includes(p.lobbyRank)
  )

  // set the teams in the database
  await setTeamsFromPlayers(guildId, newTeam1, newTeam2, newSpectators)
  await generateTeamsMessage(interaction, newTeam1, newTeam2)
}

/**
 * Handles the /make_teams command interaction, which creates proposed teams from the active players by MMR.
 * The teams are created by sorting the players by their MMR and alternating them between the two teams.
 * The teams are then saved to the database and a message is generated to show who is on what team.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns Promise<void>
 */
export async function handleMakeTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const MAX_PLAYERS_PER_TEAM = 5
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const publish = interaction.options.getBoolean('publish', false) ?? false
  const modeInput = interaction.options.getString('mode', false)
  const mode: MakeTeamsMode = isMakeTeamsMode(modeInput) ? modeInput : MakeTeamsMode.STANDARD

  const sortedPlayers = await getSortedActivePlayers(guildId)
  if (sortedPlayers.length < 1) {
    await safeReply(interaction, {
      content: 'Not enough players to make teams.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const { team1, team2, spectators } = createTeams(sortedPlayers, mode, MAX_PLAYERS_PER_TEAM)

  // set the teams in the database
  await setTeamsFromPlayers(guildId, team1, team2, spectators)
  await generateTeamsMessage(interaction, team1, team2, publish, true)
}

/**
 * Generate the message to show who is on what team
 * if publish it true, the message will be posted publicly, no ephemeral message is made
 * and the previous ephemeral message is deleted
 * otherwise it will be ephemeral
 *
 * therefore only one teams or teams_ephemeral message should be in the database at any time
 *
 * if isDraft is true, then we're creating a new draft, so delete any previous ephemeral messages
 * and previous public messages are deleted from the database also we'll post it according to [@publish]
 *
 * if both are false, then it will just update whatever was done last
 *
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param team1 The list of players on team 1
 * @param team2 The list of players on team 2
 * @param publish Whether to publish the message publicly or as an ephemeral message
 * @returns Promise<void>
 */
export async function generateTeamsMessage(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  team1: Player[],
  team2: Player[],
  /**
   * If this is true, we're publishing the teams to the channel, so delete the old ephemeral message
   * and post a new message publicly
   */
  publish = false,
  /**
   * if this is true, then we're creating a new team draft
   */
  isDraft = false
): Promise<void> {
  if (interaction.isButton()) {
    await safeReply(interaction, {
      content: 'Interaction is not a command or button interaction',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const activePlayers = await getSortedActivePlayers(guildId)
  activePlayers.forEach((p, index) => (p.lobbyRank = index))
  team1.forEach(p => {
    if (p.lobbyRank === undefined || Number.isNaN(p.lobbyRank)) {
      const pId = getPlayerIdentifier(p)
      const idx = activePlayers.findIndex(ap => getPlayerIdentifier(ap) === pId)
      if (idx !== -1) p.lobbyRank = idx
    }
  })
  team2.forEach(p => {
    if (p.lobbyRank === undefined || Number.isNaN(p.lobbyRank)) {
      const pId = getPlayerIdentifier(p)
      const idx = activePlayers.findIndex(ap => getPlayerIdentifier(ap) === pId)
      if (idx !== -1) p.lobbyRank = idx
    }
  })
  team1.sort((a, b) => (b.mmr ?? getPlayerMMR(b)) - (a.mmr ?? getPlayerMMR(a)))
  team2.sort((a, b) => (b.mmr ?? getPlayerMMR(b)) - (a.mmr ?? getPlayerMMR(a)))
  const team1List = team1
    .map(p => formatPlayerDisplay(p, guildId, { includeBattleTag: true, includeRole: true }))
    .join('\n')
  const team2List = team2
    .map(p => formatPlayerDisplay(p, guildId, { includeBattleTag: true, includeRole: true }))
    .join('\n')
  const assignedIds = new Set([
    ...team1.map(t => getPlayerIdentifier(t)).filter(Boolean),
    ...team2.map(t => getPlayerIdentifier(t)).filter(Boolean),
  ])
  const spectators = activePlayers.filter(p => {
    const id = getPlayerIdentifier(p)
    return id ? !assignedIds.has(id) : true
  })
  const spectatorList = spectators.map(p => formatPlayerDisplay(p, guildId, { includeBattleTag: true })).join('\n')

  const team1lengthMessage = team1.length === 5 ? '' : ` (${team1.length} players)`
  const team2lengthMessage = team2.length === 5 ? '' : ` (${team2.length} players)`
  const team1embed = new EmbedBuilder()
    .setTitle(`Team 1${team1lengthMessage}`)
    .setDescription(team1List || '* No players in this team')
    .setColor('#0099ff')
  const team2embed = new EmbedBuilder()
    .setTitle(`💩 Filthy Team 2${team2lengthMessage}`)
    .setDescription(team2List || '* No players in this team')
    .setColor('#8B4513')
  const spectatorEmbedAr =
    spectators.length > 0
      ? [new EmbedBuilder().setTitle('Spectators').setDescription(spectatorList).setColor(`#909000`)]
      : []
  const embeds = [team1embed, team2embed, ...spectatorEmbedAr]
  let messages = await getLobbyMessages(guildId, [CommandIds.TEAMS_EPHEMERAL, CommandIds.TEAMS])
  if (publish || isDraft) {
    // clear the previous message from the database, so it doesn't get updated until it's published again
    if (messages) {
      for (const msg of messages.filter(msg => msg.messageType === CommandIds.TEAMS_EPHEMERAL)) {
        // we know it's an ephemeral message so:
        const message = getStoredInteraction(msg.messageId, msg.channelId)
        await message?.deleteReply(msg.messageId).catch(() => {
          console.log('Failed to delete ephemeral message')
          console.trace()
        })
      }
      messages = messages.filter(msg => msg.messageType !== CommandIds.TEAMS_EPHEMERAL)
    }

    // if publish or isDraft is true, we're deleting the old messages from the database
    await deleteLobbyMessages(guildId, [CommandIds.TEAMS_EPHEMERAL, CommandIds.TEAMS])
  }

  if (publish) {
    // if we're publishing it, then we know the ephemeral messages got deleted above, so just post a new message
    const message = await safeReply(interaction, {
      content: `<@${norDiscordId}>`,
      embeds,
      flags: safePing(undefined),
    })
    if (message) {
      const fetchedMessage = await message.fetch()
      await saveLobbyMessage(guildId, CommandIds.TEAMS, fetchedMessage.id, interaction.channelId, '')
    }
    return // no need to update anything
  }
  if (isDraft) {
    // else then it's a ephemeral
    const message = await safeReply(interaction, {
      content: `<@${norDiscordId}>`,
      embeds,
      flags: safePing(MessageFlags.Ephemeral),
    })
    if (message) {
      storeInteraction(message.id, interaction.channelId, interaction)
      await saveLobbyMessage(guildId, CommandIds.TEAMS_EPHEMERAL, message.id, interaction.channelId, '')
    }
    return
  }

  // if we got here, we know isDraft === false
  // therefore we're editing the previous message
  const reply = await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  if (messages) {
    for (const msg of messages) {
      const channel =
        interaction.guild?.channels.cache.get(msg.channelId) ??
        (await interaction.guild?.channels.fetch(msg.channelId).catch(() => null))
      if (!channel?.isTextBased()) continue
      try {
        if (msg.messageType === CommandIds.TEAMS_EPHEMERAL) {
          const prevInteraction = getStoredInteraction(msg.messageId, msg.channelId)
          if (!prevInteraction) {
            await deleteLobbyMessages(guildId, [msg.messageType])
            continue
          }
          try {
            if ('webhook' in prevInteraction && prevInteraction.webhook) {
              await prevInteraction.webhook.editMessage(msg.messageId, {
                content: `<@${norDiscordId}>`,
                embeds,
              })
            } else {
              await prevInteraction.editReply({
                content: `<@${norDiscordId}>`,
                embeds,
              })
            }
            continue
          } catch {
            try {
              await prevInteraction.editReply({
                content: `<@${norDiscordId}>`,
                embeds,
              })
              continue
            } catch (error) {
              await deleteLobbyMessages(guildId, [msg.messageType])
              console.error('Failed to update draft message:', [msg.messageType], error)
            }
          }
        }
        // so it's not an ephemeral message, so:
        const previousMessage = await channel.messages.fetch(msg.messageId)
        if (!previousMessage) continue
        const message = await previousMessage.edit({
          content: `<@${norDiscordId}>`,
          embeds,
        })
        // only save the message if we successfully edited it
        const fetchedMessage = await message.fetch()
        await saveLobbyMessage(guildId, CommandIds.TEAMS, fetchedMessage.id, interaction.channelId, '')
        continue
      } catch (error) {
        // if we couldn't edit the message, then delete it from the database
        await deleteLobbyMessages(guildId, [msg.messageType])
        console.error('Failed to update draft message:', [msg.messageType], error)
      }
    }
  }

  await reply.delete().catch(error => {
    console.error('Failed to delete reply:', error)
  })
}

export async function handleSwapTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    await safeReply(interaction, {
      content: 'Interaction is not a command or button interaction',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  /** this is a 1-based index */
  const playerANumber = interaction.options.getInteger('player-a', true) - 1
  /** this is a 1-based index */
  const playerBNumber = interaction.options.getInteger('player-b', true) - 1
  const activePlayers = await getSortedActivePlayers(guildId)
  const playerA = activePlayers[playerANumber]
  const playerB = activePlayers[playerBNumber]
  // now we have the teams, and we know who to swap
  if (
    playerANumber < 0 ||
    playerANumber >= activePlayers.length ||
    playerBNumber < 0 ||
    playerBNumber >= activePlayers.length ||
    !playerA ||
    !playerB
  ) {
    await safeReply(interaction, {
      content: `Invalid player numbers (playerANumber: ${playerANumber + 1}, playerBNumber: ${
        playerBNumber + 1
      }, playerA: ${playerA?.discordId}, playerB: ${playerB?.discordId}) There are only ${
        activePlayers.length
      } players.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  if (playerA.team === playerB.team) {
    await safeReply(interaction, {
      content: `Both players are on the same team. Cannot swap.
Player A: \`team: ${playerA.team}\` \`${playerANumber + 1}: ${playerA.mmr}\` <@${playerA.discordId}>
Player B: \`team: ${playerB.team}\` \`${playerBNumber + 1}: ${playerB.mmr}\` <@${playerB.discordId}>`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // swap the teams
  // note we set playerA to playerB's team, and playerB to playerA's team
  await changeTeams(guildId, [
    { discordId: getPlayerIdentifier(playerA), newTeam: playerB.team ?? null },
    { discordId: getPlayerIdentifier(playerB), newTeam: playerA.team ?? null },
  ])
  const { team1, team2 } = await getTeams(guildId, await getSortedActivePlayers(guildId, true))
  await generateTeamsMessage(interaction, team1, team2)
}

/**
 * Publish the teams that are already store in the database
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns Promise<void>
 */
export async function handlePublishTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  // get the teams from the database
  const { team1, team2 } = await getTeams(guildId)
  if (team1.length === 0 && team2.length === 0) {
    await safeReply(interaction, {
      content: '❌ No teams have been set yet. Use `/make_teams`, `/scan_lobby`, or `/draft` first.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  await generateTeamsMessage(interaction, team1, team2, true)
  // show the move to teams button
  const moveToTeamsBtn = new ButtonBuilder()
    .setCustomId(CommandIds.MOVE_TO_TEAMS)
    .setLabel('Move Players to Teams')
    .setStyle(ButtonStyle.Primary)
  const moveToLobbyBtn = new ButtonBuilder()
    .setCustomId(CommandIds.MOVE_TO_LOBBY)
    .setLabel('Move Players to Lobby')
    .setStyle(ButtonStyle.Danger)
  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(moveToTeamsBtn, moveToLobbyBtn)],
  })
}

/**
 * Show the teams that are currently stored in the database.
 * Ephemeral by default; public with voice controls if publish=true.
 */
export async function handleShowTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const publish = interaction.options.getBoolean(CommandIds.PUBLISH, false) ?? false
  const { team1, team2 } = await getTeams(guildId)

  if (team1.length === 0 && team2.length === 0) {
    await safeReply(interaction, {
      content: '❌ No teams have been set yet. Use `/make_teams`, `/scan_lobby`, or `/draft` first.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (publish) {
    await handlePublishTeamsCommand(interaction)
  } else {
    await generateTeamsMessage(interaction, team1, team2, false, true)
  }
}

/**
 * Checks that the current teams stored in the bot match a lobby screenshot.
 * If they differ, suggests swaps to correct them.
 */
export async function handleCheckTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    await safeReply(interaction, {
      content: 'Interaction must be a command.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  // Determine whether the result should be public
  const publish = interaction.options.getBoolean(CommandIds.PUBLISH, false) ?? false

  const screenshot = interaction.options.getAttachment(CommandIds.SCREENSHOT)
  if (!screenshot) {
    await safeReply(interaction, {
      content: 'Please attach a screenshot of the HotS custom game lobby.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Defer reply: public unless publish flag is false
  if (publish) {
    await interaction.deferReply()
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  }
  try {
    const response = await fetch(screenshot.url)
    const arrayBuffer = await response.arrayBuffer()
    const imageBuffer = Buffer.from(arrayBuffer)
    const scanSummary = await scanLobbyScreenshot(imageBuffer, guildId, false)

    // Bot's stored teams
    const activePlayers = await getSortedActivePlayers(guildId)
    activePlayers.forEach((p, index) => {
      p.lobbyRank = index
    })
    const { team1, team2 } = await getTeams(guildId, activePlayers)

    const lobbyTeam1Ids = scanSummary.team1DiscordIds ?? []
    const lobbyTeam2Ids = scanSummary.team2DiscordIds ?? []

    // Determine mismatches
    const mismatchedInTeam1 = team1.filter(p => !matchesScanList(p, lobbyTeam1Ids))
    const mismatchedInTeam2 = team2.filter(p => !matchesScanList(p, lobbyTeam2Ids))

    // Players that are on the opposite side in the screenshot
    const team1InLobbyTeam2 = team1.filter(p => matchesScanList(p, lobbyTeam2Ids))
    const team2InLobbyTeam1 = team2.filter(p => matchesScanList(p, lobbyTeam1Ids))

    // Build swap suggestions
    const swaps: string[] = []
    const minSwaps = Math.min(team1InLobbyTeam2.length, team2InLobbyTeam1.length)
    for (let i = 0; i < minSwaps; i++) {
      swaps.push(
        `Swap ${formatPlayerDisplay(team1InLobbyTeam2[i], guildId)} ↔ ${formatPlayerDisplay(team2InLobbyTeam1[i], guildId)}`
      )
    }

    const moves: string[] = []
    for (let i = minSwaps; i < team2InLobbyTeam1.length; i++) {
      moves.push(`Move ${formatPlayerDisplay(team2InLobbyTeam1[i], guildId)} to Team 2`)
    }
    for (let i = minSwaps; i < team1InLobbyTeam2.length; i++) {
      moves.push(`Move ${formatPlayerDisplay(team1InLobbyTeam2[i], guildId)} to Team 1`)
    }

    // Missing or extra players
    const missingFromLobby = [...team1, ...team2].filter(
      p => !matchesScanList(p, lobbyTeam1Ids) && !matchesScanList(p, lobbyTeam2Ids)
    )
    const extraInLobby = [...lobbyTeam1Ids, ...lobbyTeam2Ids].filter(
      id => !team1.some(p => matchesScanList(p, [id])) && !team2.some(p => matchesScanList(p, [id]))
    )
    const unregisteredInLobby = scanSummary.unregistered ?? []

    let reply = ''
    if (
      mismatchedInTeam1.length === 0 &&
      mismatchedInTeam2.length === 0 &&
      missingFromLobby.length === 0 &&
      extraInLobby.length === 0 &&
      unregisteredInLobby.length === 0
    ) {
      reply = '✅ Teams match the lobby screenshot!'
    } else {
      if (swaps.length > 0) {
        reply += '**Suggested swaps:**\n' + swaps.map(s => `- ${s}`).join('\n') + '\n\n'
      }
      if (moves.length > 0) {
        reply += '**Suggested moves:**\n' + moves.map(m => `- ${m}`).join('\n') + '\n\n'
      }
      if (missingFromLobby.length > 0) {
        reply += `**Missing from lobby:** ${missingFromLobby.map(p => formatPlayerDisplay(p, guildId)).join(', ')}\n`
      }
      if (extraInLobby.length > 0) {
        const extraDisplays = await Promise.all(
          extraInLobby.map(async id => {
            const p = await getPlayerByDiscordId(id, guildId)
            return p ? formatPlayerDisplay(p, guildId) : `<@${id}>`
          })
        )
        reply += `**Extra in lobby:** ${extraDisplays.join(', ')}\n`
      }
      if (unregisteredInLobby.length > 0) {
        reply += `**Unregistered in lobby:** ${unregisteredInLobby.map(name => `\`${name}\``).join(', ')}\n`
      }
    }
    await interaction.editReply({ content: reply.trim() })
  } catch (error) {
    console.error('Error in check_teams command:', error)
    await interaction.editReply({
      content: '❌ Failed to process the screenshot. Ensure it is a clear in‑game lobby screenshot.',
    })
  }
}

export async function handleMoveToLobbyCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  // 1. Immediately defer the reply
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const result = await getChannels(guildId, ['lobby'])
  if (!result || result.length === 0) {
    await interaction.editReply({
      content: 'No lobby channel set. Please set a lobby channel first using `/set_lobby_channel`.',
    })
    return
  }
  const lobby = result[0]
  if (!lobby) {
    await interaction.editReply({
      content: 'No lobby channel set. Please set a lobby channel first using `/set_lobby_channel`.',
    })
    return
  }
  // move everybody to the lobby channel
  const lobbyChannel = interaction.guild?.channels.cache.get(lobby.channelId)
  if (!lobbyChannel || !(lobbyChannel instanceof VoiceChannel)) {
    await interaction.editReply({
      content: 'Lobby channel is not a valid voice channel.',
    })
    return
  }
  const players = await getActivePlayers(guildId)
  if (players.length === 0) {
    await interaction.editReply({
      content: 'No active players to move.',
    })
    return
  }

  let numberMoved = 0
  const totalPlayers = players.length

  // Initial update after deferring, showing progress
  await interaction.editReply({
    content: `Moving ${totalPlayers} players to the lobby channel: ${`<@${lobby.channelId}>`}... (0/${totalPlayers} moved)`,
  })

  /** Array to store players that failed to move */
  const failedToMove: Player[] = []
  const movePromises = players.map(async player => {
    if (!player.discordId) {
      return
    }
    const member = interaction.guild?.members.cache.get(player.discordId)
    if (member?.voice) {
      try {
        await member.voice.setChannel(lobbyChannel)
        numberMoved++
      } catch (err) {
        failedToMove.push(player)
        if (err instanceof Error) {
          console.error(`Failed to move ${member?.displayName || player.discordId} to lobby:`, err.message)
        } else {
          console.error(`Failed to move ${member?.displayName || player.discordId} to lobby:`, err)
        }
      } finally {
        await interaction.editReply({
          content: `Moving ${totalPlayers} players to the lobby channel: <#${lobby.channelId}>... (${numberMoved}/${totalPlayers} moved)`,
        })
      }
    } else {
      failedToMove.push(player)
    }
  })

  await Promise.all(movePromises) // Wait for all moves (and their associated edits) to complete
  // Final update
  await interaction.editReply({
    content: `Successfully moved ${numberMoved} of ${totalPlayers} players to the lobby channel: <#${lobby.channelId}>`,
  })

  // If some failed, you might want to send a followUp or log
  if (numberMoved < totalPlayers) {
    await interaction.followUp({
      content: `Note: Failed to move ${totalPlayers - numberMoved} players:\n${failedToMove
        .map(
          player =>
            `${`<@${player.discordId}>`}: ${player.usernames.accounts
              ?.find(a => a.isPrimary)
              ?.hotsBattleTag.replace(/#.*$/, '')}`
        )
        .join('\n')}`,
      flags: safePing(MessageFlags.Ephemeral),
    })
  }
}

export async function handleMoveToTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const result = await getChannels(guildId, ['team1', 'team2'])
  if (!result || result.length === 0) {
    await interaction.editReply({
      content: 'No team channels set. Please set team channels first using `/set_channel_team_id`.',
    })
    return
  }
  if (result.length < 2) {
    // tell them which channel they need to set
    await interaction.editReply({
      content: `You need to set both team channels using \`/set_channel_team_id\`.\nCurrently, only one team channel is set: \`${result[0].channelName}\`.`,
    })
    return
  }
  const teams = await getTeams(guildId)
  let numberMoved = 0
  /** array for storing the ids of all the players that it failed to move: */
  const failedToMove: Player[] = []
  for (const [index, channel] of result.entries()) {
    const teamChannel = interaction.guild?.channels.cache.get(channel.channelId)
    if (!teamChannel || !(teamChannel instanceof VoiceChannel)) {
      await interaction.editReply({
        content: `Team channel \`${channel.channelName}\` is not a valid voice channel.`,
      })
      return
    }
    const team = index === 0 ? teams.team1 : teams.team2 // team1 for index 0, team2 for index 1
    numberMoved += await moveTeamMembersToChannel(interaction, team, teamChannel, failedToMove)
  }
  if (failedToMove.length !== 0) {
    await interaction.editReply({
      content: `Moved ${numberMoved} players to their respective team channels: ${result
        .map(c => `<#${c.channelId}>`)
        .join(', ')}\nWARNING: **${
        teams.team1.length + teams.team2.length - numberMoved
      } players could not be moved.**`,
    })
  } else {
    await interaction.editReply({
      content: `Successfully moved all ${numberMoved} players to their respective team channels: \`${result
        .map(c => c.channelName)
        .join('`, `')}\``,
    })
  }
  if (failedToMove.length > 0) {
    await interaction.followUp({
      content: `Failed to move the following players to their team channels:\n${failedToMove
        .map(
          player =>
            `${`<@${player.discordId}>`}: ${player.usernames.accounts
              ?.find(a => a.isPrimary)
              ?.hotsBattleTag.replace(/#.*$/, '')}`
        )
        .join('\n')}`,
      flags: safePing(MessageFlags.Ephemeral),
    })
  }
}

async function moveTeamMembersToChannel(
  interaction: Interaction,
  team: Player[],
  channel: VoiceChannel,
  failedToMove: Player[]
) {
  let numberMoved = 0
  const movePromises = team.map(async player => {
    if (!player.discordId) {
      return
    }
    const member = interaction.guild?.members.cache.get(player.discordId)
    if (member?.voice) {
      await member.voice
        .setChannel(channel)
        .then(() => {
          numberMoved++
        })
        .catch(() => {
          failedToMove.push(player)
          console.error(`\nMember ${player.discordId}, ${player.usernames.discordDisplayName}, is not on discord:`)
        })
    } else {
      failedToMove.push(player)
      console.warn(
        `Member ${player.discordId}, ${player.usernames.discordDisplayName} is not in a voice channel or does not exist.`
      )
    }
  })
  await Promise.all(movePromises)
  return numberMoved
}

/**
 * Handles the move command interaction, moves a Discord member to a specified voice channel
 * @param interaction The interaction object from Discord, will be a ChatInputCommandInteraction
 * @returns <void>
 */
export async function handleMoveCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const member = interaction.options.getMember(CommandIds.DISCORD_ID)
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to move.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const channel = interaction.options.getChannel('channel', true)
  if (!(channel instanceof VoiceChannel)) {
    await safeReply(interaction, {
      content: 'Please provide a valid voice channel to move the member to.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  // Move the member to the specified voice channel
  const memberToMove = interaction.guild?.members.cache.get(member.user.id)
  if (memberToMove?.voice.channel) {
    try {
      await memberToMove.voice.setChannel(channel)
    } catch (error) {
      console.error('Error moving member:', error)
      await safeReply(interaction, {
        content: `Failed to move <@${member.user.id}> to <@${channel.id}>`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }
  }
  await safeReply(interaction, {
    content: `Moved ${member.user.username} to ${channel.name}.`,
    flags: MessageFlags.Ephemeral,
  })
}

