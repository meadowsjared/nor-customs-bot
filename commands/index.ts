import fs from 'fs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Interaction,
  InteractionReplyOptions,
  MessageFlags,
  MessagePayload,
  ModalBuilder,
  ModalSubmitInteraction,
  TextBasedChannel,
  TextInputBuilder,
  TextInputStyle,
  VoiceChannel,
} from 'discord.js';
import {
  adminUserIds,
  botChannelName,
  chatOrButtonOrModal,
  CommandIds,
  imPlayingBtn,
  joinBtn,
  leaveBtn,
  addAccountBtn,
  norDiscordId,
  rejoinBtn,
  roleBtn,
  roleMap,
} from '../constants';
import { announce, safePing } from '../utils/announce';
import {
  getActivePlayers,
  getPlayerByDiscordId,
  getTeams,
  handleAddHotsAccount,
  markAllPlayersInactive,
  savePlayer,
  setPlayerActive,
  setPlayerDiscordNames,
  setPlayerName,
  setPlayerRole,
  setPrimaryAccount,
  setTeamsFromPlayers,
  storeInteraction,
  changeTeams,
  getStoredInteraction,
} from '../store/player';
import {
  saveChannel,
  getChannels,
  saveLobbyMessage,
  getLobbyMessages,
  deleteLobbyMessages,
  deleteLobbyMessagesById,
} from '../store/channels';
import { DiscordUserNames, Player } from '../types/player';
import { client } from '../index';
import { getReplayFolderPath, parseReplay, setReplayFolderPath } from '../store/hotsReplays';
import path from 'path';
/**
 * Generates the current lobby status message with active players
 * @returns The formatted lobby status message
 */
function generateLobbyStatusMessage(pPreviousPlayersList?: string): string {
  const previousPlayersList =
    pPreviousPlayersList ?? getLobbyMessages([CommandIds.NEW_GAME])?.[0]?.previousPlayersList ?? '';
  const activePlayers = getActivePlayers();
  activePlayers.sort((a, b) => a.lastActive.getTime() - b.lastActive.getTime()); // sort by last_active ascending
  const lobbyPlayers = activePlayers.map(
    (p, index) =>
      `${index + 1}: @${p.usernames.discordDisplayName}: (${p.usernames.accounts
        ?.find(a => a.isPrimary)
        ?.hotsBattleTag.replace(/#.*$/, '')}) \`${getPlayerRolesFormatted(p.role)}\``
  );

  // combine the lobbyPlayers and previousPlayersList, into one string, labeling each section, but skip a section if there are no players in that section
  const playerListWithLabels = [];
  if (previousPlayersList) playerListWithLabels.push(`__**Previous Players**__:\n${previousPlayersList}`);
  playerListWithLabels.push(
    `__**Players in the lobby**__: (${lobbyPlayers.length})\n${lobbyPlayers.join('\n') || 'The lobby is empty.'}`
  );
  if (playerListWithLabels.length === 0) {
    playerListWithLabels.push(`**No Active Players**`);
  }
  const playerListWithLabelsString = playerListWithLabels.join('\n');

  return `A new game has started! All players have been marked as inactive.\n\n${playerListWithLabelsString}\n\nPlease click below if you are going to play.`;
}

/** generates the list of previous players */
function generatePreviousPlayersList(): string {
  const previousPlayers = getActivePlayers().map(p => safePing(`<@${p.discordId}>`));
  if (previousPlayers.length === 0) {
    return '**No Previous Players**';
  }
  return `${previousPlayers.join(' ')}`;
}

/**
 * Updates the lobby announcement message with current player status
 * @param interaction The interaction object for guild access
 */
async function updateLobbyMessage(interaction: chatOrButtonOrModal) {
  const lobbyMessages = getLobbyMessages([CommandIds.NEW_GAME]);
  if (!lobbyMessages || lobbyMessages.length === 0) {
    return; // No lobby message to update
  }

  try {
    const channel = interaction.guild?.channels.cache.get(lobbyMessages[0].channelId);
    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(lobbyMessages[0].messageId);
      // purposely don't pass in the previousPlayersList, so it uses the stored value in the database
      const updatedContent = generateLobbyStatusMessage();
      await message.edit({
        content: updatedContent,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(imPlayingBtn)],
      });
    }
  } catch (error) {
    console.error('Failed to update lobby message:', error);
    // If the message doesn't exist anymore, clear the stored reference
  }
}

export async function handleNewGameCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  // combine the observers, team1, and team2, into one string, labeling each section, but skip a section if there are no players in that section

  const previousPlayersList = generatePreviousPlayersList();
  markAllPlayersInactive();

  // Generate the initial lobby status message
  const lobbyStatusMessage = generateLobbyStatusMessage(previousPlayersList);

  // announce in the channel that a new game has started and all players have been marked as inactive, so they need to hit the button if they are going to play
  const sentMessage = await announce(interaction, lobbyStatusMessage, undefined, [
    new ActionRowBuilder<ButtonBuilder>().addComponents(imPlayingBtn),
  ]);

  // Store the message ID so we can update it later
  if (sentMessage) {
    saveLobbyMessage(CommandIds.NEW_GAME, sentMessage.id, sentMessage.channelId, previousPlayersList);
  }

  await safeReply(interaction, {
    content: 'Game announced!', // empty content to avoid sending a message in the channel, since we already announced it'
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Safely replies to an interaction, using followUp if already replied
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param replyOptions The options for the reply message
 * @returns Promise<Message<boolean> | InteractionResponse<boolean> | undefined>
 */
export async function safeReply(
  interaction: chatOrButtonOrModal | undefined,
  options: string | MessagePayload | InteractionReplyOptions
) {
  if (!interaction) {
    // post a new message
    if (!process.env.NOR_DISCORD_ID) {
      console.error('No NOR_DISCORD_ID environment variable set.');
      return;
    }
    // use process.env.NOR_DISCORD_ID to get the channel
    const guild = client.guilds.cache.get(process.env.NOR_DISCORD_ID);
    if (!guild) {
      console.error(`Guild with ID ${process.env.NOR_DISCORD_ID} not found.`);
      return;
    }
    const channel = guild.channels.cache.find(ch => ch.name === botChannelName);
    if (!channel?.isTextBased()) {
      console.error(`Channel with name ${botChannelName} not found or is not text-based.`);
      return;
    }
    const message = getMessageContent(options);
    return channel.send({
      content: message,
    });
  }
  if (interaction.replied || interaction.deferred) {
    return await interaction.followUp(options);
  } else {
    try {
      return await interaction.reply(options);
    } catch (error) {
      console.error('Error replying to interaction, attempting followUp:', error);
    }
  }
}

function getMessageContent(options: string | MessagePayload | InteractionReplyOptions): string {
  if (typeof options === 'string') {
    return options;
  } else if ('content' in options && typeof options.content === 'string') {
    return options.content;
  } else {
    return 'No content';
  }
}

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
  type TeamName = 'team1' | 'team2';
  type Teams = {
    [K in TeamName]: string[];
  };

  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const originalTeamsData = interaction.options.getString('teams_data', true);
  const splitResult = originalTeamsData.split(',');
  const team1Input: number[] | null = splitResult[0]
    ?.split(/\W/)
    .map(n => parseInt(n, 10))
    .filter(n => !isNaN(n));
  const team2Input: number[] | null = splitResult[1]
    ?.split(/\W/)
    .map(n => parseInt(n, 10))
    .filter(n => !isNaN(n));
  // now that we have the new team assignments
  const activePlayers = getActivePlayers();
  activePlayers.sort((a, b) => (b.mmr ?? 0) - (a.mmr ?? 0));
  activePlayers.forEach((p, index) => (p.draftRank = index));
  if (team1Input.length > activePlayers.length) {
    // the maximum length is the total number of players
    await safeReply(interaction, {
      content: `Too many players provided. There are currently ${activePlayers.length} players in total.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // check if the teamsData contains any duplicates
  const uniqueTeamsData = Array.from(new Set(team1Input));
  if (uniqueTeamsData.length !== team1Input.length) {
    // Find the duplicates
    const duplicates = team1Input.filter((num, index) => team1Input.indexOf(num) !== index);
    const uniqueDuplicates = Array.from(new Set(duplicates));

    await safeReply(interaction, {
      content: `Duplicate player numbers provided: \`${uniqueDuplicates.join(
        ', '
      )}\`. Please provide each player number only once.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // go through and subtract one from each number, so we're using 0-based indexes
  for (let i = 0; i < (team1Input.length ?? 0); i++) {
    team1Input[i] = team1Input[i] - 1;
  }
  for (let i = 0; i < (team2Input?.length ?? 0); i++) {
    team2Input[i] = team2Input[i] - 1;
  }

  // populate team 2
  const team2InputEffective =
    team2Input ??
    activePlayers.reduce((acc: number[], _, index: number) => {
      if (!team1Input.includes(index) && acc.length < 5) {
        acc.push(index);
      }
      return acc;
    }, []);
  // now we have the two teams, we need to set them in the database
  const team1: { player: Player; index: number }[] = [];
  const team2: { player: Player; index: number }[] = [];
  const spectators: { player: Player; index: number }[] = [];
  activePlayers.forEach(p => {
    if (team1Input.includes(p.draftRank)) {
      team1.push({ player: p, index: p.draftRank });
      return;
    }
    if (team2InputEffective.includes(p.draftRank)) {
      team2.push({ player: p, index: p.draftRank });
      return;
    }
    spectators.push({ player: p, index: p.draftRank });
  });
  // set the teams in the database
  setTeamsFromPlayers(team1, team2, spectators);
  generateTeamsMessage(interaction, team1, team2);
}

/**
 * Handles the /draft command interaction, which creates teams from the active players.
 * The teams are created by sorting the players by their MMR and alternating them between the two teams.
 * The teams are then saved to the database and a message is generated to show who is on what team.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns Promise<void>
 */
export async function handleDraftTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const publish = interaction.options.getBoolean('publish', false) ?? false;
  const activePlayers = getActivePlayers();
  if (activePlayers.length < 1) {
    await safeReply(interaction, {
      content: 'Not enough players to draft teams.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // sort the players by their MMR
  const sortedPlayers = [...activePlayers].sort((a, b) => {
    const aMmr = getPlayerMMR(a);
    const bMmr = getPlayerMMR(b);
    return bMmr - aMmr;
  });
  // go through the sorted players, and alternate adding them to each team
  const team1: { player: Player; index: number }[] = [];
  const team2: { player: Player; index: number }[] = [];
  const spectators: { player: Player; index: number }[] = [];
  for (let i = 0; i < sortedPlayers.length; i++) {
    if (((i % 2 === 0 && i !== 0) || i === 1) && team2.length < 5) {
      team2.push({ player: sortedPlayers[i], index: i });
    } else if (team1.length < 5) {
      team1.push({ player: sortedPlayers[i], index: i });
    } else {
      spectators.push({ player: sortedPlayers[i], index: i });
    }
  }
  // set the teams in the database
  setTeamsFromPlayers(team1, team2, spectators);
  await generateTeamsMessage(interaction, team1, team2, publish, true);
}

function getPlayerMMR(player: Player): number {
  return (
    player.usernames.accounts?.reduce(
      (bestMMR, account) => Math.max(bestMMR, account.hpQmMMR ?? 0, account.hpSlMMR ?? 0, account.hpArMMR ?? 0),
      0
    ) ?? 0
  );
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
async function generateTeamsMessage(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  team1: { player: Player; index: number }[],
  team2: { player: Player; index: number }[],
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
    });
    return;
  }
  const activePlayers = getActivePlayers();
  team1.sort((a, b) => a.index - b.index);
  team2.sort((a, b) => a.index - b.index);
  activePlayers.sort((a, b) => (b.mmr ?? 0) - (a.mmr ?? 0));
  activePlayers.forEach((p, index) => (p.draftRank = index));
  const team1List = team1
    .map(
      p =>
        `\`${p.index + 1}: ${getPlayerMMR(p.player)}\` ${safePing(
          `<@${p.player.discordId}>`
        )} ${p.player.usernames.accounts?.find(account => account.isPrimary)?.hotsBattleTag.replace(/#.*$/, '')}`
    )
    .join('\n');
  const team2List = team2
    .map(
      p =>
        `\`${p.index + 1}: ${getPlayerMMR(p.player)}\` ${safePing(
          `<@${p.player.discordId}>`
        )} ${p.player.usernames.accounts?.find(account => account.isPrimary)?.hotsBattleTag.replace(/#.*$/, '')}`
    )
    .join('\n');
  const spectators = activePlayers.filter(
    p => team1.every(t => t.player.discordId !== p.discordId) && team2.every(t => t.player.discordId !== p.discordId)
  );
  const spectatorList = spectators
    .map(
      p =>
        `\`${p.draftRank + 1}: ${getPlayerMMR(p)}\` ${safePing(`<@${p.discordId}>`)} ${p.usernames.accounts
          ?.find(account => account.isPrimary)
          ?.hotsBattleTag.replace(/#.*$/, '')}`
    )
    .join('\n');

  const team1lengthMessage = team1.length === 5 ? '' : ` (${team1.length} players)`;
  const team2lengthMessage = team2.length === 5 ? '' : ` (${team2.length} players)`;
  const team1embed = new EmbedBuilder()
    .setTitle(`Team 1${team1lengthMessage}`)
    .setDescription(team1List || '* No players in this team')
    .setColor('#0099ff');
  const team2embed = new EmbedBuilder()
    .setTitle(`💩 Filthy Team 2${team2lengthMessage}`)
    .setDescription(team2List || '* No players in this team')
    .setColor('#8B4513');
  const spectatorEmbedAr =
    spectators.length > 0
      ? [new EmbedBuilder().setTitle('Spectators').setDescription(spectatorList).setColor(`#909000`)]
      : [];
  const embeds = [team1embed, team2embed, ...spectatorEmbedAr];
  let messages = getLobbyMessages([CommandIds.TEAMS_EPHEMERAL, CommandIds.TEAMS]);
  if (publish || isDraft) {
    // clear the previous message from the database, so it doesn't get updated until it's published again
    if (messages) {
      messages
        .filter(msg => msg.messageType === CommandIds.TEAMS_EPHEMERAL)
        .forEach(async msg => {
          // we know it's an ephemeral message so:
          const message = getStoredInteraction(msg.messageId, msg.channelId);
          message?.deleteReply().catch(console.error);
        });
      messages = messages.filter(msg => msg.messageType !== CommandIds.TEAMS_EPHEMERAL);
    }

    // if publish or isDraft is true, we're deleting the old messages from the database
    deleteLobbyMessages([CommandIds.TEAMS_EPHEMERAL, CommandIds.TEAMS]);
  }

  if (publish) {
    // if we're publishing it, then we know the ephemeral messages got deleted above, so just post a new message
    const message = await safeReply(interaction, {
      content: safePing(`<@${norDiscordId}>`),
      embeds,
    });
    if (message) {
      const fetchedMessage = await message.fetch();
      saveLobbyMessage(CommandIds.TEAMS, fetchedMessage.id, interaction.channelId, ''); // store the interaction ID as the message ID, so we know it was a draft
    }
    return; // no need to update anything
  }
  if (isDraft) {
    // else then it's a ephemeral
    const message = await safeReply(interaction, {
      content: safePing(`<@${norDiscordId}>`),
      embeds,
      flags: MessageFlags.Ephemeral,
    });
    if (message) {
      storeInteraction(message.id, interaction.channelId, interaction);
      saveLobbyMessage(CommandIds.TEAMS_EPHEMERAL, message.id, interaction.channelId, '');
    }
    return;
  }

  // if we got here, we know isDraft === false
  // therefore we're editing the previous message
  // also of note, there should only be a single
  // ephemeral message, OR a published message
  // never both
  const reply = await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  messages?.forEach(async msg => {
    const channel = interaction.guild?.channels.cache.get(msg.channelId);
    if (!channel?.isTextBased()) return;
    if (messages) {
      try {
        if (msg.messageType === CommandIds.TEAMS_EPHEMERAL) {
          const prevInteraction = getStoredInteraction(msg.messageId, msg.channelId);
          if (!prevInteraction) return;
          await prevInteraction.editReply({
            content: safePing(`<@${norDiscordId}>`),
            embeds,
          });
          return;
        }
        // so it's not an ephemeral message, so:
        const previousMessage = await channel.messages.fetch(msg.messageId);
        if (!previousMessage) return;
        const message = await previousMessage.edit({
          content: safePing(`<@${norDiscordId}>`),
          embeds,
        });
        // only save the message if we successfully edited it
        const fetchedMessage = await message.fetch();
        saveLobbyMessage(CommandIds.TEAMS, fetchedMessage.id, interaction.channelId, ''); // store the interaction ID as the message ID, so we know it was a draft
        return;
      } catch (error) {
        // if we couldn't edit the message, then delete it from the database
        deleteLobbyMessages([msg.messageType]);
        console.error('Failed to update draft message:', [msg.messageType], error);
      }
    }
  });
  await reply.delete().catch(console.error);
}

export async function handleSwapTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    await safeReply(interaction, {
      content: 'Interaction is not a command or button interaction',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  /** this is a 1-based index */
  const playerANumber = interaction.options.getInteger('player-a', true) - 1;
  /** this is a 1-based index */
  const playerBNumber = interaction.options.getInteger('player-b', true) - 1;
  const activePlayers = getActivePlayers();
  activePlayers.sort((a, b) => (b.mmr ?? 0) - (a.mmr ?? 0));
  activePlayers.forEach((p, index) => (p.draftRank = index));
  // get the discord_id of the two players
  const playerA = activePlayers.find(p => (p.draftRank ?? NaN) === playerANumber);
  const playerB = activePlayers.find(p => (p.draftRank ?? NaN) === playerBNumber);
  // now we have the teams, and we know who to swap
  if (
    playerANumber < 0 ||
    playerANumber > activePlayers.length ||
    playerBNumber < 0 ||
    playerBNumber > activePlayers.length ||
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
    });
    return;
  }
  if (playerA.team === playerB.team) {
    await safeReply(interaction, {
      content: `Both players are on the same team. Cannot swap.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // swap the teams
  // note we set playerA to playerB's team, and playerB to playerA's team
  changeTeams([
    { playerId: playerA.discordId, newTeam: playerB.team ?? null },
    { playerId: playerB.discordId, newTeam: playerA.team ?? null },
  ]);
  const { team1: newTeam1, team2: newTeam2 } = getTeams();
  const team1Obj = newTeam1.map(p => ({ player: p, index: p.draftRank ?? 0 }));
  const team2Obj = newTeam2.map(p => ({ player: p, index: p.draftRank ?? 0 }));
  await generateTeamsMessage(interaction, team1Obj, team2Obj);
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
    console.error('Interaction is not a command or button interaction');
    return;
  }
  // get the teams from the database
  const { team1, team2 } = getTeams();
  generateTeamsMessage(
    interaction,
    team1.map(p => ({ player: p, index: p.draftRank ?? 0 })),
    team2.map(p => ({ player: p, index: p.draftRank ?? 0 })),
    true
  );
}

export async function handleMoveToLobbyCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  // 1. Immediately defer the reply
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = getChannels(['lobby']);
  if (!result || result.length === 0) {
    await interaction.editReply({
      content: 'No lobby channel set. Please set a lobby channel first using `/set_lobby_channel`.',
    });
    return;
  }
  const lobby = getChannels(['lobby'])?.[0];
  if (!lobby) {
    await interaction.editReply({
      content: 'No lobby channel set. Please set a lobby channel first using `/set_lobby_channel`.',
    });
    return;
  }
  // move everybody to the lobby channel
  const lobbyChannel = interaction.guild?.channels.cache.get(lobby.channelId);
  if (!lobbyChannel || !(lobbyChannel instanceof VoiceChannel)) {
    await interaction.editReply({
      content: 'Lobby channel is not a valid voice channel.',
    });
    return;
  }
  const players = getActivePlayers();
  if (players.length === 0) {
    await interaction.editReply({
      content: 'No active players to move.',
    });
    return;
  }

  let numberMoved = 0;
  const totalPlayers = players.length;

  // Initial update after deferring, showing progress
  await interaction.editReply({
    content: `Moving ${totalPlayers} players to the lobby channel: ${safePing(
      `<@${lobby.channelId}>`
    )}... (0/${totalPlayers} moved)`,
  });

  /** Array to store players that failed to move */
  const failedToMove: Player[] = [];
  const movePromises = players.map(async player => {
    const member = interaction.guild?.members.cache.get(player.discordId);
    if (member?.voice) {
      try {
        await member.voice.setChannel(lobbyChannel);
        numberMoved++;
      } catch (err) {
        failedToMove.push(player);
        if (err instanceof Error) {
          console.error(`Failed to move ${member?.displayName || player.discordId} to lobby:`, err.message);
        } else {
          console.error(`Failed to move ${member?.displayName || player.discordId} to lobby:`, err);
        }
      } finally {
        await interaction.editReply({
          content: `Moving ${totalPlayers} players to the lobby channel: <#${lobby.channelId}>... (${numberMoved}/${totalPlayers} moved)`,
        });
      }
    } else {
      failedToMove.push(player);
    }
  });

  await Promise.all(movePromises); // Wait for all moves (and their associated edits) to complete
  // Final update
  await interaction.editReply({
    content: `Successfully moved ${numberMoved} of ${totalPlayers} players to the lobby channel: <#${lobby.channelId}>`,
  });

  // If some failed, you might want to send a followUp or log
  if (numberMoved < totalPlayers) {
    await interaction.followUp({
      content: `Note: Failed to move ${totalPlayers - numberMoved} players:\n${failedToMove
        .map(
          player =>
            `${safePing(`<@${player.discordId}>`)}: ${player.usernames.accounts
              ?.find(a => a.isPrimary)
              ?.hotsBattleTag.replace(/#.*$/, '')}`
        )
        .join('\n')}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleMoveToTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = getChannels(['team1', 'team2']);
  if (!result || result.length === 0) {
    await interaction.editReply({
      content: 'No team channels set. Please set team channels first using `/set_channel_team_id`.',
    });
    return;
  }
  if (result.length < 2) {
    // tell them which channel they need to set
    await interaction.editReply({
      content: `You need to set both team channels using \`/set_channel_team_id\`.\nCurrently, only one team channel is set: \`${result[0].channelName}\`.`,
    });
    return;
  }
  const teams = getTeams();
  let numberMoved = 0;
  /** array for storing the ids of all the players that it failed to move: */
  const failedToMove: Player[] = [];
  for (const [index, channel] of result.entries()) {
    // result.forEach((channel, index) => {
    const teamChannel = interaction.guild?.channels.cache.get(channel.channelId);
    if (!teamChannel || !(teamChannel instanceof VoiceChannel)) {
      await interaction.editReply({
        content: `Team channel \`${channel.channelName}\` is not a valid voice channel.`,
      });
      return;
    }
    const team = index === 0 ? teams.team1 : teams.team2; // team1 for index 0, team2 for index 1
    numberMoved += await moveTeamMembersToChannel(interaction, team, teamChannel, failedToMove);
    // });
  }
  if (failedToMove.length !== 0) {
    await interaction.editReply({
      content: `Moved ${numberMoved} players to their respective team channels: ${result
        .map(c => `<#${c.channelId}>`)
        .join(', ')}\nWARNING: **${
        teams.team1.length + teams.team2.length - numberMoved
      } players could not be moved.**`,
    });
  } else {
    await interaction.editReply({
      content: `Successfully moved all ${numberMoved} players to their respective team channels: \`${result
        .map(c => c.channelName)
        .join('`, `')}\``,
    });
  }
  if (failedToMove.length > 0) {
    await interaction.followUp({
      content: `Failed to move the following players to their team channels:\n${failedToMove
        .map(
          player =>
            `${safePing(`<@${player.discordId}>`)}: ${player.usernames.accounts
              ?.find(a => a.isPrimary)
              ?.hotsBattleTag.replace(/#.*$/, '')}`
        )
        .join('\n')}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function moveTeamMembersToChannel(
  interaction: Interaction,
  team: Player[],
  channel: VoiceChannel,
  failedToMove: Player[]
) {
  let numberMoved = 0;
  const movePromises = team.map(async player => {
    const member = interaction.guild?.members.cache.get(player.discordId);
    if (member?.voice) {
      await member.voice
        .setChannel(channel)
        .then(() => {
          numberMoved++;
        })
        .catch(() => {
          failedToMove.push(player);
          console.error(`\nMember ${player.discordId}, ${player.usernames.discordDisplayName}, is not on discord:`);
        });
    } else {
      failedToMove.push(player);
      console.warn(
        `Member ${player.discordId}, ${player.usernames.discordDisplayName} is not in a voice channel or does not exist.`
      );
    }
  });
  await Promise.all(movePromises);
  return numberMoved;
}

export async function handleSetChannelTeamIdCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const channel = interaction.options.getChannel('channel_id', true);
  const teamId = interaction.options.getString('team_number', true);
  if (!(channel instanceof VoiceChannel)) {
    await safeReply(interaction, {
      content: 'Please select a valid voice channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  saveChannel(teamId, channel);
  await safeReply(interaction, {
    content: `\`${teamId}\` channel set to <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleSetLobbyChannelCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand() || interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const channel = interaction.options.getChannel('channel_id', true);
  // if channel isn't guild voice, return
  if (!(channel instanceof VoiceChannel)) {
    await safeReply(interaction, {
      content: 'Please select a valid voice channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  saveChannel('lobby', channel);
  // This command is not implemented yet
  await safeReply(interaction, {
    content: `\`lobby\` channel set to <#${channel.id}>`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleGuideCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  // inside a command, event listener, etc.
  const exampleEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Nor's Hots Customs — Lobby Guide")
    // .setDescription(
    //   'This is a custom lobby for Heroes of the Storm. Use the commands below to join, leave, or manage your role in the lobby.'
    // )
    // this shows up in the upper right corner of the embed
    // .setThumbnail(
    //   'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png'
    // )
    .setDescription(
      [
        'Commands:',
        '```🟢 /join        — Join the lobby with your battle tag',
        '                  and role',
        '🔴 /leave       — Leave the lobby',
        '🔄 /rejoin      — Rejoin the lobby',
        '✏️ /add-account — Add a HotS account',
        '🎭 /role        — Change your role```',
      ].join('\n')
    )
    .addFields({ name: 'Roles', value: '🛡️ Tank, ⚔️ Assassin, 💪 Bruiser, 💉 Healer, 🔄 Flex' })
    // .addFields(
    //   { name: '`/join`', value: 'Join the lobby with your Heroes of the Storm battle tag and role.' },
    //   { name: '`/leave`', value: 'Leave the lobby.' },
    //   { name: '`/rejoin`', value: 'Rejoin the lobby with your previous battle tag and role.' },
    //   { name: '`/add-account`', value: 'Add a HotS account.' },
    //   { name: '`/role`', value: 'Change your role in the lobby.' }
    // )
    .setFooter({ text: 'Enjoy playing!' })
    .setImage(
      'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png'
    );
  await safeReply(interaction, { embeds: [exampleEmbed] });
}

/**
 *
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param isButton Whether the interaction is a button interaction or not.
 * @returns
 */
export async function handlePlayersCommand(
  interaction: Interaction<CacheType>,
  onlyRaw: boolean = false,
  pingLobby: boolean = false
) {
  // check if interaction can be replied to
  if (!interaction.isChatInputCommand() && !interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }

  const players = getActivePlayers();

  const playerList =
    players
      .map(({ discordId, usernames, role }) => {
        if (pingLobby) {
          // if pingLobby is true, mention the user
          return `${safePing(`<@${discordId}>`)}: (${usernames.accounts
            ?.find(a => a.isPrimary)
            ?.hotsBattleTag.replace(/#.*$/, '')}) \`${getPlayerRolesFormatted(role)}\``;
        }
        const user = interaction.guild?.members.cache.get(discordId)?.displayName;
        return `@${user}: (${usernames.accounts
          ?.find(a => a.isPrimary)
          ?.hotsBattleTag.replace(/#.*$/, '')}) \`${getPlayerRolesFormatted(role)}\``;
      })
      .join('\n') || 'No players in the lobby';
  const rawPlayerList = Object.values(players)
    .filter(player => player.active)
    .map(
      ({ usernames, role }) =>
        `${usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag.replace(/#.*$/, '')} ${role}`
    );
  await safeReply(interaction, {
    content: `Players in the lobby: **${rawPlayerList.length}**\n${playerList}`,
    flags: onlyRaw ? MessageFlags.Ephemeral : undefined,
  });
  if (rawPlayerList.length > 0) {
    // show a public message in the channel, if there are players in the lobby
    const channel = interaction.guild?.channels.cache.find(ch => ch.name === botChannelName);
    if (channel?.isTextBased()) {
      interaction.followUp({
        content: `\`${rawPlayerList.join(',') || 'No players in the lobby'}\``,
        flags: MessageFlags.Ephemeral,
      });
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
  const { player } = setPlayerActive(interaction.user.id, false); // Mark player as inactive in the database
  if (player) {
    // Update the lobby message instead of announcing
    await updateLobbyMessage(interaction);
    await safeReply(interaction, {
      content: `You left the lobby`,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(rejoinBtn)],
    });
  } else {
    await safeReply(interaction, { content: 'You are not in the lobby', flags: MessageFlags.Ephemeral });
  }
}

export async function handleClearCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  markAllPlayersInactive(); // Mark all players as inactive in the database
  await updateLobbyMessage(interaction); // Update the lobby message to show no players
  await safeReply(interaction, {
    content: 'All players have been removed from the lobby.',
    flags: MessageFlags.Ephemeral,
  });
}

/**
 *  Handles the rejoin command interaction, allows a user to rejoin the lobby with their previous battle tag and role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 */
export async function handleRejoinCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  newUser = false
) {
  // first check it the user has a hotsBattleTag in the database
  const existingPlayer = getPlayerByDiscordId(interaction.user.id);
  if (!existingPlayer?.usernames.accounts?.find(a => a.isPrimary)) {
    // if they don't have a hotsBattleTag, show the modal to collect it
    await showJoinModal(interaction);
    return;
  }
  const { player, updated } = setPlayerActive(interaction.user.id, true); // Mark player as active in the database
  if (player) {
    if (updated === true) {
      // Update the lobby message instead of announcing
      await updateLobbyMessage(interaction);
    }
    const joinVerb = newUser ? 'joined' : 'rejoined';
    const content =
      (updated === false ? `You are already in` : `You have ${joinVerb}`) +
      ` the lobby as: \`${player.usernames.accounts
        ?.find(a => a.isPrimary)
        ?.hotsBattleTag.replace(/#.*$/, '')}\`, \`${getPlayerRolesFormatted(
        player.role
      )}\`\nUse /leave to leave the lobby, or use the buttons below.`;
    await safeReply(interaction, {
      content,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, addAccountBtn, roleBtn)],
    });
    return;
  }
  if (player === undefined) {
    // show a dialog to collect the battle tag and role
    await showJoinModal(interaction);
  }
}

/**
 * Shows a modal to the user to collect their battle tag and role, then returns the data to the handleJoinCommand function
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns { Promise<void> }
 */
async function showJoinModal(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
): Promise<void> {
  const { hotsBattleTag, modalInteraction } = await handleUserNameModalSubmit(interaction);
  if (!modalInteraction || !hotsBattleTag) {
    // If modal interaction is undefined, it means the user did not respond in time
    console.log('error: User did not respond to the modal in time');
    return;
  }
  const discordData = fetchDiscordNames(modalInteraction);
  savePlayer(
    interaction,
    modalInteraction.user.id,
    {
      discordId: modalInteraction.user.id,
      usernames: { ...discordData },
      role: CommandIds.ROLE_FLEX, // Default role is Flex
      active: false,
      team: undefined,
      draftRank: NaN,
      mmr: 0,
      lastActive: new Date(),
    },
    hotsBattleTag
  ); // Save player data to the database with default role Flex
  await handleEditRoleCommand(modalInteraction, true); // Show the edit role buttons
}

export async function handleLookupByDiscordIdCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const discordId = interaction.options.getString(CommandIds.DISCORD_ID, true);
  const displayName = interaction.options.getString(CommandIds.DISCORD_DISPLAY_NAME, true);
  const discordName = interaction.options.getString(CommandIds.DISCORD_NAME, true);
  const discordData: DiscordUserNames = {
    discordName: discordName,
    discordGlobalName: displayName,
    discordDisplayName: displayName,
  };
  return await handleLookupCommandSub(interaction, discordId, discordData);
}

export async function handleLookupCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const member = interaction.options.getMember(CommandIds.DISCORD_ID);
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to look up.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const discordId = member.user.id;
  const discordData = fetchDiscordNames(interaction, discordId);
  return await handleLookupCommandSub(interaction, discordId, discordData);
  // return;
}

async function handleLookupCommandSub(
  interaction: ChatInputCommandInteraction<CacheType>,
  discordId: string,
  discordData: DiscordUserNames
) {
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG, false) ?? '';
  const player = getPlayerByDiscordId(discordId);
  if (player || (!player && hotsBattleTag === '')) {
    const message = player
      ? `${hotsBattleTag || 'Player'} found in the lobby with role: \`${getPlayerRolesFormatted(player.role)}\``
      : `${hotsBattleTag || 'Player'} not found in the lobby, adding them with default role \`${getPlayerRolesFormatted(
          CommandIds.ROLE_FLEX
        )}\`.`;
    // show the player's hots_accounts.hotsBattleTag
    const accounts =
      player?.usernames.accounts
        ?.map((a, index) => `${index + 1}. ` + a.hotsBattleTag + (a.isPrimary ? ' (Primary)' : ''))
        .join('\n') || 'No HotS accounts';

    await safeReply(interaction, {
      content: `${safePing(`<@${discordId}>`)}\nDiscord ID: \`${discordId}\`\ndiscordName: \`${
        discordData.discordName
      }\`\ndiscordGlobalName: \`${discordData.discordGlobalName}\`\nDisplay Name: \`${
        discordData.discordDisplayName
      }\`\n${message}\nHotS Accounts:\n${accounts}`,
      flags: MessageFlags.Ephemeral,
    });
  }
  // save the player to the database if they are not already there
  if (!player) {
    await savePlayer(
      interaction,
      discordId,
      {
        discordId,
        usernames: {
          ...discordData,
        },
        role: CommandIds.ROLE_FLEX, // Default role is Flex
        active: false,
        team: undefined,
        draftRank: NaN,
        mmr: 0,
        lastActive: new Date(),
      },
      hotsBattleTag
    );
    return;
  }
  // update the player's Discord data in the database
  setPlayerDiscordNames(discordId, discordData);
  // If a hotsBattleTag is provided, and does this player already have this specific battle tag?
  if (
    hotsBattleTag &&
    player.usernames.accounts?.some(a => a.hotsBattleTag.toLowerCase() === hotsBattleTag.toLowerCase())
  ) {
    setPlayerName(interaction, discordId, hotsBattleTag); // Update the player's Heroes of the Storm name in the database
  } else if (hotsBattleTag) {
    handleAddHotsAccountCommandSub(interaction, discordId, hotsBattleTag); // Add the new battle tag to the player's accounts in the database
  }
  // return;
}

/**
 * Handles the edit role command interaction, shows buttons to edit the user's role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param discordId The Discord ID of the user to edit the role for.
 */
export async function handleAdminShowRoleButtons(
  interaction: ButtonInteraction<CacheType> | ChatInputCommandInteraction<CacheType>,
  discordId: string
) {
  const player = getPlayerByDiscordId(discordId); // Get player by Discord ID
  if (!player) {
    if (interaction.replied) {
      await interaction.followUp({
        content: 'You are not in the lobby. Click the button below to join.',
        flags: MessageFlags.Ephemeral,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
      });
      return;
    }
    await safeReply(interaction, {
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    });
    return;
  }
  const roles = ', current role: ' + getPlayerRolesFormatted(player.role);
  // create a button that will set this interaction to add mode
  const row2 = getEditRoleRow(discordId, CommandIds.ROLE_EDIT_REPLACE);
  const content = (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + 'Replace Mode' + roles; // Default content for the reply
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
  });
}

/**
 * Handles the admin add hots account button interaction, shows a modal to collect the battle tag and adds it to the player's account
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param discordId The Discord ID of the user to add the HotS account for.
 * @returns Promise<void>
 */
export async function handleAdminAddHotsAccountButton(interaction: ButtonInteraction<CacheType>, discordId: string) {
  const { hotsBattleTag, modalInteraction } = await handleUserNameModalSubmit(interaction, discordId);
  if (!modalInteraction || !hotsBattleTag) {
    // If modal interaction is undefined, it means the user did not respond in time
    return;
  }

  const player = getPlayerByDiscordId(discordId);
  if (player) {
    await handleAddHotsAccount(modalInteraction, discordId, hotsBattleTag); // Update the player's battle tag in the database
  }
}

/**
 * Handles the join command interaction, adds the user to the lobby with their battle tag and role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 */
export async function handleJoinCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    await handleRejoinCommand(interaction, true);
    return; // If it's a button interaction, we handle rejoin directly
  }
  const role = interaction.options.getString(CommandIds.ROLE, true);
  const discordData = fetchDiscordNames(interaction);
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG, true);
  const newPlayer: Player = {
    discordId: interaction.user.id,
    usernames: { ...discordData },
    role,
    active: true,
    team: undefined,
    draftRank: NaN,
    mmr: 0,
    lastActive: new Date(),
  };
  await savePlayer(interaction, interaction.user.id, newPlayer, hotsBattleTag); // Save player data to the database
  // announce in the channel who has joined
  await handleUserJoined(interaction, hotsBattleTag, role);
}

/**
 * Handles the user joining the lobby, announces their presence and provides buttons for further actions
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param hotsBattleTag The hots battleTag of the user who joined.
 * @param role The role of the user who joined, based on the roleMap keys.
 * @param skipReply (optional) Whether to skip the reply and just follow up with the components.
 */
async function handleUserJoined(
  interaction: chatOrButtonOrModal,
  hotsBattleTag: string,
  role: string,
  skipReply = false
) {
  // Update the lobby message instead of announcing
  await updateLobbyMessage(interaction);

  const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, addAccountBtn, roleBtn)];
  if (skipReply) {
    await interaction.followUp({
      components,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await safeReply(interaction, {
    components,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleAddHotsAccountCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    const { hotsBattleTag, modalInteraction } = await handleUserNameModalSubmit(interaction);
    if (!modalInteraction || !hotsBattleTag) {
      // If modal interaction is undefined, it means the user did not respond in time
      return;
    }
    const player = getPlayerByDiscordId(modalInteraction.user.id);
    if (player) {
      await handleAddHotsAccount(modalInteraction, modalInteraction.user.id, hotsBattleTag); // Update the player's battle tag in the database
    }
    return;
  }
  const discordId = interaction.user.id;
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG);
  // check if the battleTag is valid, it should be in the format of Name#1234
  await handleAddHotsAccountCommandSub(interaction, discordId, hotsBattleTag);
}

export async function handleAdminAddHotsAccountByDiscordIdCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const discordId = interaction.options.getString(CommandIds.DISCORD_ID, true);
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG);
  await handleAddHotsAccountCommandSub(interaction, discordId, hotsBattleTag);
}

export async function handleAdminAddHotsAccountCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const member = interaction.options.getMember(CommandIds.DISCORD_ID);
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to look up.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG);
  // check if the battleTag is valid, it should be in the format of Name#1234
  await handleAddHotsAccountCommandSub(interaction, member.user.id, hotsBattleTag);
}

export async function handleAdminPrimaryCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordIdParam?: string,
  battleTagParam?: string,
  messageIdParam?: string,
  channelIdParam?: string
) {
  const discordId = getDiscordId(interaction, discordIdParam);
  if (!discordId) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord ID or member to look up.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    await safeReply(interaction, {
      content: 'The specified user does not exist in the database.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  } else if (!player.usernames.accounts || player.usernames.accounts.length === 0) {
    await safeReply(interaction, {
      content: 'The specified user does not have any Heroes of the Storm accounts associated with their Discord ID.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const battleTag = getBattleTag(interaction, battleTagParam);
  if (!battleTag || !messageIdParam || !channelIdParam) {
    // if they didn't provide a battle tag, then show them a list of buttons for each account the user has
    const channelId = interaction.channelId;
    const message = await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (player.usernames.accounts.length === 1) {
      // set that account as primary directly
      await setPrimaryAccount(
        interaction,
        discordId,
        player.usernames.accounts[0].hotsBattleTag,
        message.id,
        channelId
      );
      return;
    }
    if (!battleTagParam && battleTag) {
      if (!player.usernames.accounts.some(account => account.hotsBattleTag === battleTag)) {
        // set that account as primary
        console.log('Setting primary account directly to', battleTag);
        await safeReply(interaction, {
          content: `The specified battle tag \`${battleTag}\` is not associated with the user <@${discordId}>.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await setPrimaryAccount(interaction, discordId, battleTag, message.id, channelId);
      return;
    }
    const accountButtons = player.usernames.accounts.map(account => {
      return new ButtonBuilder()
        .setCustomId(
          `${CommandIds.ADMIN}_${CommandIds.PRIMARY}_${discordId}_${account.hotsBattleTag}_${message.id}_${channelId}`
        )
        .setLabel(account.hotsBattleTag)
        .setStyle(account.isPrimary ? ButtonStyle.Primary : ButtonStyle.Secondary);
    });
    await interaction.editReply({
      content: 'Please select the account to set as primary using the buttons below.',
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...accountButtons)],
    });
    if (!message) {
      await safeReply(interaction, {
        content: 'An error occurred while trying to send the message. Please try again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    storeInteraction(message.id, interaction.channelId, interaction);
    return;
  }
  await setPrimaryAccount(interaction, discordId, battleTag, messageIdParam, channelIdParam);
}

function getDiscordId(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordIdParam?: string
): string | undefined {
  if (discordIdParam) {
    return discordIdParam;
  }
  if (!interaction.isChatInputCommand()) {
    return undefined;
  }
  const member = interaction.options.getMember(CommandIds.DISCORD_ID);
  if (member && 'user' in member) {
    return member.user.id;
  }
  return undefined;
}

function getBattleTag(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  battleTagParam?: string
) {
  if (battleTagParam) {
    return battleTagParam;
  }
  if (!interaction.isChatInputCommand()) {
    return undefined;
  }
  return interaction.options.getString(CommandIds.BATTLE_TAG, false) ?? undefined;
}

async function handleAddHotsAccountCommandSub(
  interaction: ChatInputCommandInteraction<CacheType>,
  discordId: string,
  hotsBattleTag: string | null
) {
  if (!hotsBattleTag) {
    // if they didn't provide a battle tag, then show them all the accounts they have associated with their discord id
    const player = getPlayerByDiscordId(discordId);
    if (!player?.usernames.accounts || player.usernames.accounts.length === 0) {
      await safeReply(interaction, {
        content: 'You have no Heroes of the Storm accounts associated with your Discord ID.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const accountsList = player.usernames.accounts
      .map(account => `* \`${account.hotsBattleTag}\` ${account.isPrimary ? '(Primary)' : ''}`)
      .join('\n');
    await safeReply(interaction, {
      content: `${
        interaction.user.id === discordId ? 'Your' : `<@${discordId}>'s`
      } associated Heroes of the Storm accounts:\n${accountsList}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await handleAddHotsAccount(interaction, discordId, hotsBattleTag);
}

/**
 * Handles the user name modal submission.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param discordId (optional) The Discord ID of the user, if not provided, it will use the interaction user ID.
 * @returns An object containing the battle tag and the modal interaction.
 */
async function handleUserNameModalSubmit(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordId?: string
): Promise<{
  hotsBattleTag: string | undefined;
  modalInteraction: ModalSubmitInteraction<CacheType> | undefined;
}> {
  const previousPlayer = getPlayerByDiscordId(discordId ?? interaction.user.id);

  // create a modal with a text field to collect the battle tag
  const battleTagInput = new TextInputBuilder()
    .setCustomId(CommandIds.BATTLE_TAG)
    .setLabel('Battle Tag (e.g. Name#1234)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Your Heroes of the Storm battle tag')
    .setValue(
      previousPlayer?.usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag ??
        previousPlayer?.usernames.accounts?.[0]?.hotsBattleTag ??
        interaction.user.displayName ??
        ''
    ); // Use previous battle tag if available
  // Add the input to an action row
  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(battleTagInput);

  // Create the modal
  const modal = new ModalBuilder().setCustomId('battleTag').setTitle('Set Your battle tag').addComponents(actionRow);
  // get the battle tag from the TextInputBuilder
  await interaction.showModal(modal);
  let modalInteraction: ModalSubmitInteraction<CacheType>;
  try {
    modalInteraction = await interaction.awaitModalSubmit({
      filter: i => i.customId === 'battleTag',
      time: 5 * 60 * 1000,
    }); // 5 minutes timeout
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'InteractionCollectorError') {
      return { hotsBattleTag: undefined, modalInteraction: undefined }; // Return undefined if the modal interaction is not received
    }
    console.error('Error awaiting modal submit:', error);
    return { hotsBattleTag: undefined, modalInteraction: undefined }; // Return undefined if the modal interaction is not received
  }
  const hotsBattleTag = modalInteraction.fields.getTextInputValue(CommandIds.BATTLE_TAG);
  return { hotsBattleTag, modalInteraction };
}

function createEditRoleButtonDisabled(discordId: string, commandId: string, emoji: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(`${commandId}_${discordId}`).setLabel(emoji).setStyle(ButtonStyle.Secondary);
}

function createEditRoleButtonEnabled(discordId: string, commandId: string, emoji: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(`${commandId}_${discordId}`).setEmoji(emoji).setStyle(ButtonStyle.Primary);
}

function getEditRoleRow(discordId: string, action: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...Object.entries(roleMap).map(([key, label]) => {
      return new ButtonBuilder()
        .setCustomId(`${action}_${discordId}_${key}`) // Use the action
        .setLabel(label)
        .setStyle(ButtonStyle.Primary);
    })
  );
}

/**
 * Handles the edit role command interaction, shows buttons to edit the user's role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns {Promise<void>}
 */
export async function handleEditRoleCommand(interaction: chatOrButtonOrModal, setActive = false): Promise<void> {
  const player = getPlayerByDiscordId(interaction.user.id); // Get player by Discord ID
  if (!player) {
    if (interaction.replied) {
      await interaction.followUp({
        content: 'You are not in the lobby. Click the button below to join.',
        flags: MessageFlags.Ephemeral,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
      });
      return;
    }
    await safeReply(interaction, {
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    });
    return;
  }
  const roles = ', current role: ' + getPlayerRolesFormatted(player.role);
  // create a button that will set this interaction to add mode
  const activeSuffix = setActive ? '_' + CommandIds.ACTIVE : '';
  const row2 = getEditRoleRow(interaction.user.id, CommandIds.ROLE_EDIT_REPLACE + activeSuffix);
  const content = (setActive ? 'You must click a role to join the lobby\n' : '') + 'Replace Mode' + roles; // Default content for the reply
  await safeReply(interaction, {
    content,
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(interaction.user.id, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonEnabled(interaction.user.id, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(interaction.user.id, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
      ),
      row2,
    ],
  });
}

export async function handleEditRoleButtonCommand(
  interaction: ButtonInteraction<CacheType> | ChatInputCommandInteraction<CacheType>,
  discordId: string,
  action: string,
  role?: keyof typeof roleMap,
  setActive = false
) {
  if (!interaction.isButton()) {
    await safeReply(interaction, {
      content: 'This command can only be used with buttons.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    await safeReply(interaction, {
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    });
    return;
  }
  const roles = ', current role: ' + getPlayerRolesFormatted(player.role); // Get the formatted roles of the player

  const row2 = getEditRoleRow(discordId, action);
  // Handle the role editing logic based on the action
  let setActiveNext: boolean;
  if (setActive === true && player.active === false && role !== undefined) {
    // If the action is set to active, we need to handle it differently
    setPlayerActive(discordId, true); // Set the player as active
    setActiveNext = false; // Reset the active state for the next interaction
  } else {
    setActiveNext = setActive; // Keep the active state as is
  }
  const activeSuffix = setActiveNext ? '_' + CommandIds.ACTIVE : '';
  const activePrefix = setActive ? 'You must click a role to join the lobby\n' : ''; // Default content for the reply
  switch (action) {
    case CommandIds.ROLE_EDIT_ADD:
      showAddButtons(interaction, discordId, player, role, roles, activePrefix, row2, activeSuffix);
      break;
    case CommandIds.ROLE_EDIT_REMOVE:
      showRemoveButtons(interaction, discordId, player, role, roles, activePrefix, row2, activeSuffix);
      break;
    case CommandIds.ROLE_EDIT_REPLACE:
      showReplaceButtons(interaction, discordId, player, role, roles, activePrefix, row2, activeSuffix);
      break;
  }
  if (setActive === true && player.active === false && role !== undefined) {
    // If setActive is true, we need to set the player as active
    announce(
      interaction,
      `${safePing(`<@${interaction.user.id}>`)} (${player.usernames.accounts
        ?.find(a => a.isPrimary)
        ?.hotsBattleTag.replace(/#.*$/, '')}) has joined the lobby as \`${getPlayerRolesFormatted(player.role)}\``
    );
  }
}

function showAddButtons(
  interaction: ButtonInteraction<CacheType>,
  discordId: string,
  player: Player,
  role: string | undefined,
  roles: string,
  activePrefix: string,
  row2: ActionRowBuilder<ButtonBuilder>,
  activeSuffix: string
) {
  if (role && !player.role.includes(role)) {
    // If the role is specified and does not exist in the player's roles, add it
    const newRoles = player.role + role; // Append the new role
    setPlayerRole(discordId, newRoles); // Update the player's role in the database
    roles = ', current role: ' + getPlayerRolesFormatted(newRoles);
  }
  interaction.update({
    content:
      (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + activePrefix + 'Add Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonEnabled(discordId, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
      ),
      row2,
    ],
  });
}

function showRemoveButtons(
  interaction: ButtonInteraction<CacheType>,
  discordId: string,
  player: Player,
  role: string | undefined,
  roles: string,
  activePrefix: string,
  row2: ActionRowBuilder<ButtonBuilder>,
  activeSuffix: string
) {
  if (role && player.role.includes(role)) {
    // If the role is specified and exists in the player's roles, remove it
    const newRoles = player.role
      .split('')
      .filter(r => r !== role)
      .join('');
    setPlayerRole(discordId, newRoles); // Update the player's role in the database
    roles = ', current role: ' + getPlayerRolesFormatted(newRoles);
  }
  interaction.update({
    content:
      (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + activePrefix + 'Remove Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonEnabled(discordId, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
      ),
      row2,
    ],
  });
}

function showReplaceButtons(
  interaction: ButtonInteraction<CacheType>,
  discordId: string,
  player: Player,
  role: string | undefined,
  roles: string,
  activePrefix: string,
  row2: ActionRowBuilder<ButtonBuilder>,
  activeSuffix: string
) {
  if (role) {
    setPlayerRole(discordId, role);
    roles = ', current role: ' + getPlayerRolesFormatted(role);
  }
  interaction.update({
    content:
      (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + activePrefix + 'Replace Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonEnabled(discordId, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
      ),
      row2,
    ],
  });
}

/**
 * gets the roles of the player as a pretty string
 * @param player The player object to get the roles from.
 * @returns A string of the player's roles, formatted as a list.
 */
function getPlayerRolesFormatted(role: string): string {
  return role
    .split('')
    .map(r => roleMap[r])
    .join(', ');
}

export async function handleTwitchCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  // inside a command, event listener, etc.
  const exampleEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Norator's Twitch Channel")
    .setURL('https://www.twitch.tv/norator')
    .setAuthor({
      name: 'Nor is bald',
      iconURL:
        'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png',
      url: 'https://www.twitch.tv/norator',
    })
    .setDescription('Join Norator on Twitch for Heroes of the Storm content!')
    .setThumbnail(
      'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png'
    );

  await safeReply(interaction, { embeds: [exampleEmbed] });
}

/**
 * Handles the move command interaction, moves a Discord member to a specified voice channel
 * @param interaction The interaction object from Discord, will be a ChatInputCommandInteraction
 * @returns <void>
 */
export async function handleMoveCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const member = interaction.options.getMember(CommandIds.DISCORD_ID);
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to move.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const channel = interaction.options.getChannel('channel', true);
  if (!(channel instanceof VoiceChannel)) {
    await safeReply(interaction, {
      content: 'Please provide a valid voice channel to move the member to.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // Move the member to the specified voice channel
  const memberToMove = interaction.guild?.members.cache.get(member.user.id);
  if (memberToMove?.voice.channel) {
    try {
      await memberToMove.voice.setChannel(channel);
    } catch (error) {
      console.error('Error moving member:', error);
      console.log('resuming...');
      await safeReply(interaction, {
        content: `Failed to move <@${member.user.id}> to <@${channel.id}>`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }
  await safeReply(interaction, {
    content: `Moved ${member.user.username} to ${channel.name}.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleDeleteMessageCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'This command can only be used as a slash command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if ((await userIsAdmin(interaction)) === false) {
    await safeReply(interaction, {
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const messageId = interaction.options.getString('message_id', true);
  const channel = interaction.channel;

  await deleteMessage(interaction, channel, messageId);
}

async function deleteMessage(
  interaction: ChatInputCommandInteraction<CacheType>,
  channel: TextBasedChannel | null,
  messageId: string
) {
  if (!channel) {
    await safeReply(interaction, {
      content: 'Channel not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const message = await channel.messages.fetch(messageId);
    if (message.embeds.length !== 0) {
      // delete the embed
      await message.edit({ embeds: [], content: '*[Message Deleted]*' });
    }
    await message.delete();
    await safeReply(interaction, {
      content: `Deleted message: ${message.content}`,
      flags: MessageFlags.Ephemeral,
    });
    await interaction.deleteReply();
    deleteLobbyMessagesById([messageId]); // if the message was a lobby message, remove it from the stored messages
  } catch (error) {
    console.error('Error deleting message:', error);
    await safeReply(interaction, {
      content: `Failed to delete message. Please make sure the message ID is correct.\nmessageId: ${messageId}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

function fetchDiscordNames(interaction: Interaction, id?: string): DiscordUserNames {
  const discordUser = interaction.guild?.members.cache.get(id ?? interaction.user.id)?.user;
  const discordDisplayName = discordUser?.displayName ?? 'N/A';
  const discordGlobalName = discordUser?.globalName ?? 'N/A';

  return {
    discordName: discordUser?.username ?? 'N/A',
    discordDisplayName,
    discordGlobalName,
  };
}

function getMemberFromInteraction(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>,
  pId?: string
) {
  if (interaction.isChatInputCommand()) {
    return interaction.options.getMember(CommandIds.DISCORD_ID);
  }
  if (pId) {
    return interaction.guild?.members.cache.get(pId) ?? null;
  }
  return null;
}

export function handleAdminSetRoleCommand(interaction: ChatInputCommandInteraction<CacheType>): void;
export function handleAdminSetRoleCommand(
  interaction: ButtonInteraction<CacheType>,
  discordId: string,
  pRole: keyof typeof roleMap
): void;
export async function handleAdminSetRoleCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordId?: string,
  pRole?: keyof typeof roleMap
) {
  if (!userIsAdmin(interaction)) {
    return;
  }
  const member = getMemberFromInteraction(interaction, discordId);
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to set their name.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const role = pRole
    ? pRole
    : interaction.isChatInputCommand() && interaction.options.getString(CommandIds.ROLE, false);
  if (interaction.isChatInputCommand() && !role) {
    const member = interaction.options.getMember(CommandIds.DISCORD_ID);
    if (member && 'user' in member) {
      await handleAdminShowRoleButtons(interaction, member.user.id);
      return;
    }
  }
  if (!role) {
    await safeReply(interaction, {
      content: 'Please provide a valid role to set for the member.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const id = member.user.id;
  const player = setPlayerRole(id, role);
  if (!player) {
    await safeReply(interaction, {
      content: 'Player not found in the lobby. Please make sure they have joined first.',
      flags: MessageFlags.Ephemeral,
    });
  }
  await safeReply(interaction, {
    content: `Set ${member.user.displayName}'s role to \`${getPlayerRolesFormatted(role)}\``,
    flags: MessageFlags.Ephemeral,
  });
  // return;
}

function getActiveFromInteraction(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pActive?: boolean
): boolean {
  if (interaction.isChatInputCommand()) {
    return interaction.options.getBoolean(CommandIds.ACTIVE, true);
  }
  // If it's a button interaction, we assume the active status is true
  return pActive ?? true; // Default to true if not provided
}

export async function handleAdminSetActiveCommand(interaction: ChatInputCommandInteraction<CacheType>): Promise<void>;
export async function handleAdminSetActiveCommand(
  interaction: ButtonInteraction<CacheType>,
  pId: string,
  pActive: boolean
): Promise<void>;
export async function handleAdminSetActiveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pId?: string,
  pActive?: boolean
): Promise<void> {
  if (!(await userIsAdmin(interaction))) {
    await safeReply(interaction, {
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const member = getMemberFromInteraction(interaction, pId);
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to set their active status.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const isActive = getActiveFromInteraction(interaction, pActive); // Get the active status from the interaction or use the provided value
  const id = pId ?? member.user.id;
  const { player, updated } = setPlayerActive(id, isActive); // Set player as active in the database
  if (!player) {
    await safeReply(interaction, {
      content: 'Player not found in the lobby. Please make sure they have joined first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (updated) {
    const adminJoinBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.JOIN}_${id}`)
      .setLabel('Admin Join')
      .setStyle(ButtonStyle.Primary);
    const adminLeaveBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.LEAVE}_${id}`)
      .setLabel('Admin Leave')
      .setStyle(ButtonStyle.Danger);
    const adminAddAccountBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.ADD_ACCOUNT}_${id}`)
      .setLabel('Admin Add Account')
      .setStyle(ButtonStyle.Secondary);
    const adminRoleBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.ROLE}_${id}`)
      .setLabel('Admin Role')
      .setStyle(ButtonStyle.Secondary);
    await safeReply(interaction, {
      content: `Set ${member.user.displayName}'s active status to \`${
        isActive ? CommandIds.ACTIVE : CommandIds.INACTIVE
      }\``,
      flags: MessageFlags.Ephemeral,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          isActive ? adminLeaveBtn : adminJoinBtn,
          adminAddAccountBtn,
          adminRoleBtn
        ),
      ],
    });
    await updateLobbyMessage(interaction);
  } else {
    await safeReply(interaction, {
      content: `${player.usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag.replace(/#.*$/, '')} is already ${
        isActive ? CommandIds.ACTIVE : CommandIds.INACTIVE
      }.`,
      flags: MessageFlags.Ephemeral,
    });
  }
  // return;
}

export async function handleSetReplayFolderCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!(await userIsAdmin(interaction))) {
    return;
  }
  if (!interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'This command can only be used as a slash command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const folderPath = interaction.options.getString(CommandIds.REPLAY_FOLDER_PATH, true);
  setReplayFolderPath(folderPath);
  await safeReply(interaction, {
    content: `Replay folder path set to:\n\`${folderPath}\``,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleGetReplayFolderCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!(await userIsAdmin(interaction))) {
    return;
  }
  const folderPath = getReplayFolderPath();
  await safeReply(interaction, {
    content: `Current replay folder path is:\n\`${folderPath}\``,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleListReplaysCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!(await userIsAdmin(interaction))) {
    return;
  }
  if (!interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'This command can only be used as a slash command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const folderPath = getReplayFolderPath();
  if (!folderPath) {
    await safeReply(interaction, {
      content: `Replay folder path is not set. Please set it using the \`/${CommandIds.SET_REPLAY_FOLDER}\` command.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // list all the files in the replay folder
  let files: string[] = [];
  try {
    files = fs.readdirSync(folderPath);
  } catch (error) {
    console.error('Error reading replay folder:', error);
    await safeReply(interaction, {
      content: `Error reading replay folder. Please make sure the folder path is correct.\n\`${folderPath}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (files.length === 0) {
    await safeReply(interaction, {
      content: `No replay files found in the folder:\n\`${folderPath}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // filter the files to only include .StormReplay files
  files = files.filter(file => file.endsWith('.StormReplay'));
  if (files.length === 0) {
    await safeReply(interaction, {
      content: `No .StormReplay files found in the folder:\n\`${folderPath}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // sort the files by date
  files.sort((a, b) => {
    const aStat = fs.statSync(path.join(folderPath, a));
    const bStat = fs.statSync(path.join(folderPath, b));
    return bStat.mtime.getTime() - aStat.mtime.getTime();
  });

  const maxContentLength = 1800; // Leave some buffer for the header text
  // split the content into multiple messages if it's too long
  const maxMessages = 3;

  let currentChunk = `Found the following .StormReplay files in the folder:\n\`${folderPath}\`\n\n`;
  const filesToShow = files.slice(0, maxMessages);
  // process each file
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  for (const [index, file] of filesToShow.entries()) {
    if (currentChunk.length + file.length + 1 <= maxContentLength) {
      currentChunk += `${index + 1}. ${file}\n`;
      const replayData = await parseReplay(path.join(folderPath, file));
      if (replayData) {
        currentChunk += `  - Replay ID: ${replayData.replayId}\n`;
        currentChunk += `  - Map: ${replayData.map}, Type: ${replayData.type}, Date: ${new Date(
          replayData.date
        ).getUTCDate()}\n  - Winner: ${replayData.winner}, Duration: ${Math.floor(replayData.length / 60)}m ${
          replayData.length % 60
        }s, takedowns: ${replayData.team0Takedowns} - ${replayData.team1Takedowns}\n  - Players:\n${
          replayData.team0Players
        } vs\n${replayData.team1Players}\n`;
      }
      await interaction.editReply({
        content: currentChunk,
      });
      // return; // stop after one, for testing
    }
  }
}

/**
 * Checks if the user is an admin based on their Discord ID.
 * If the user is an admin, it returns true; otherwise, it replies with a message
 * indicating they do not have permission and returns false.
 * @param interaction The ChatInputCommandInteraction object from Discord
 * @returns boolean indicating if the user is an admin
 */
async function userIsAdmin(interaction: chatOrButtonOrModal): Promise<boolean> {
  const isAdmin = adminUserIds.includes(interaction.user.id);
  if (isAdmin) {
    return true;
  }
  await safeReply(interaction, {
    content: 'You do not have permission to use this command.',
    flags: MessageFlags.Ephemeral,
  });
  return false;
}
