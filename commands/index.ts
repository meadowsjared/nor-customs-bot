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
  battleTagBtn,
  norDiscordId,
  rejoinBtn,
  roleBtn,
  roleMap,
} from '../constants';
import { announce } from '../utils/announce';
import {
  getActivePlayers,
  getPlayerByDiscordId,
  getTeams,
  handleAddHotsAccount,
  markAllPlayersInactive,
  markPlayerActive,
  markPlayerInactive,
  savePlayer,
  setPlayerActive,
  setPlayerDiscordNames,
  setPlayerName,
  setPlayerRole,
  setTeams,
} from '../store/player';
import { saveChannel, getChannels, saveLobbyMessage, getLobbyMessage } from '../store/channels';
import { DiscordUserNames, Player } from '../types/player';

/**
 * Generates the current lobby status message with active players
 * @returns The formatted lobby status message
 */
function generateLobbyStatusMessage(pPreviousPlayersList?: string): string {
  const previousPlayersList = pPreviousPlayersList ?? getLobbyMessage()?.previousPlayersList ?? '';
  const activePlayers = getActivePlayers();
  const lobbyPlayers = activePlayers
    .filter(p => p?.team === undefined)
    .map(
      (p, index) =>
        `${index + 1}: @${p.usernames.discordDisplayName}: (${p.usernames.accounts
          ?.find(a => a.isPrimary)
          ?.hotsBattleTag.replace(/#.*$/, '')}) \`${getPlayerRolesFormatted(p.role)}\``
    );

  // combine the lobbyPlayers and previousPlayersList, into one string, labeling each section, but skip a section if there are no players in that section
  const playerListWithLabels = [];
  if (previousPlayersList) playerListWithLabels.push(`**Previous Players**:\n${previousPlayersList}`);
  playerListWithLabels.push(
    `**Players in the lobby**: (${lobbyPlayers.length})\n${lobbyPlayers.join('\n') || 'The lobby is empty.'}`
  );
  if (playerListWithLabels.length === 0) {
    playerListWithLabels.push(`**No Active Players**`);
  }
  const playerListWithLabelsString = playerListWithLabels.join('\n');

  return `A new game has started! All players have been marked as inactive.\n\n${playerListWithLabelsString}\n\nPlease click below if you are going to play.`;
}

/** generates the list of previous players */
function generatePreviousPlayersList(): string {
  const previousPlayers = getActivePlayers().map(p => `<@${p.discordId}>`);
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
  const lobbyMessage = getLobbyMessage();
  if (!lobbyMessage) {
    return; // No lobby message to update
  }

  try {
    const channel = interaction.guild?.channels.cache.get(lobbyMessage.channelId);
    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(lobbyMessage.messageId);
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
    saveLobbyMessage(sentMessage.id, sentMessage.channelId, previousPlayersList);
  }

  safeReply(interaction, {
    content: 'Game announced!', // empty content to avoid sending a message in the channel, since we already announced it'
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Safely replies to an interaction, using followUp if already replied
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param replyOptions The options for the reply message
 * @returns Promise<void>
 */
export async function safeReply(
  interaction: chatOrButtonOrModal,
  options: string | MessagePayload | InteractionReplyOptions
) {
  if (interaction.replied) {
    await interaction.followUp(options);
  } else {
    await interaction.reply(options);
  }
}

/**
 * Handles the /load_teams command interaction, which loads teams from a JSON string provided in the command options.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 * note: If the interaction is not a command or button interaction, it logs an error and returns.
 * This function also sets the teams in the database, for use with the handleMoveToTeamsCommand and handleMoveToLobbyCommand functions.
 **/
export async function handleLoadTeamsCommand(
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
  const teamsData: Teams = JSON.parse(interaction.options.getString('teams_data', true));
  const activePlayers = getActivePlayers();
  const team1 = teamsData.team1
    .map(name =>
      activePlayers.find(player =>
        player.usernames.accounts?.some(
          account => account.hotsBattleTag.replace(/#.*$/, '').toLowerCase() === name.toLowerCase()
        )
      )
    )
    .filter(p => p !== undefined);
  const team2 = teamsData.team2
    .map(name =>
      activePlayers.find(player =>
        player.usernames.accounts?.some(
          account => account.hotsBattleTag.replace(/#.*$/, '').toLowerCase() === name.toLowerCase()
        )
      )
    )
    .filter(p => p !== undefined);
  setTeams(
    team1.map(p => p.discordId),
    team2.map(p => p.discordId)
  ); // Save the teams to the database

  const team1Message = team1
    .map(
      p =>
        `* ${p.usernames.discordDisplayName} (${p.usernames.accounts
          ?.find(account => account.isPrimary)
          ?.hotsBattleTag.replace(/#.*$/, '')})`
    )
    .join('\n');
  const team2Message = team2
    .map(
      p =>
        `* ${p.usernames.discordDisplayName} (${p.usernames.accounts
          ?.find(account => account.isPrimary)
          ?.hotsBattleTag.replace(/#.*$/, '')})`
    )
    .join('\n');

  const team1lengthMessage = team1.length === 5 ? '' : ` (${team1.length} players)`;
  const team2lengthMessage = team2.length === 5 ? '' : ` (${team2.length} players)`;
  const team1embed = new EmbedBuilder()
    .setTitle(`Team 1${team1lengthMessage}`)
    .setDescription(team1Message || '* No players in this team')
    .setColor('#0099ff');
  const team2embed = new EmbedBuilder()
    .setTitle(`💩 Filthy Team 2${team2lengthMessage}`)
    .setDescription(team2Message || '* No players in this team')
    .setColor('#8B4513');
  await safeReply(interaction, {
    content: `<@${norDiscordId}>`,
    embeds: [team1embed, team2embed],
    // flags: MessageFlags.Ephemeral,
  });
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
    content: `Moving ${totalPlayers} players to the lobby channel: <@${lobby.channelId}>... (0/${totalPlayers} moved)`,
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
            `<@${player.discordId}>: ${player.usernames.accounts
              ?.find(a => a.isPrimary)
              ?.hotsBattleTag.replace(/#.*$/, '')}`
        )
        .join('\n')}`,
      ephemeral: true,
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
      interaction.editReply({
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
            `<@${player.discordId}>: ${player.usernames.accounts
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
        .catch(_err => {
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
        '```🟢 /join   — Join the lobby with your battle tag and role',
        '🔴 /leave  — Leave the lobby',
        '🔄 /rejoin — Rejoin the lobby',
        '✏️ /battle-tag   — Change your hots battle tag',
        '🎭 /role   — Change your role```',
      ].join('\n')
    )
    .addFields({ name: 'Roles', value: '🛡️ Tank, ⚔️ Assassin, 💪 Bruiser, 💉 Healer, 🔄 Flex' })
    // .addFields(
    //   { name: '`/join`', value: 'Join the lobby with your Heroes of the Storm battle tag and role.' },
    //   { name: '`/leave`', value: 'Leave the lobby.' },
    //   { name: '`/rejoin`', value: 'Rejoin the lobby with your previous battle tag and role.' },
    //   { name: '`/battle-tag`', value: 'Change your Heroes of the Storm battle tag.' },
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
          return `<@${discordId}>: (${usernames.accounts
            ?.find(a => a.isPrimary)
            ?.hotsBattleTag.replace(/#.*$/, '')}) \`${getPlayerRolesFormatted(role)}\``;
        }
        const user = interaction.guild?.members.cache.get(discordId)?.displayName;
        return `@${user}: (${usernames.accounts
          ?.find(a => a.isPrimary)
          ?.hotsBattleTag.replace(/#.*$/, '')}) \`${getPlayerRolesFormatted(role)}\``;
      })
      .join('\n') || 'No players in the lobby';
  const rawPlayerList = Array.from(players.entries())
    .filter(([_, player]) => player.active)
    .map(
      ([_, { usernames, role }]) =>
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
  const player = markPlayerInactive(interaction.user.id); // Mark player as inactive in the database
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
  const result = markPlayerActive(interaction.user.id); // Mark player as active in the database
  if (result.player) {
    if (result.alreadyActive === false) {
      // Update the lobby message instead of announcing
      await updateLobbyMessage(interaction);
    }
    const joinVerb = newUser ? 'joined' : 'rejoined';
    const content =
      (result.alreadyActive === true ? `You are already in` : `You have ${joinVerb}`) +
      ` the lobby as: \`${result.player.usernames.accounts
        ?.find(a => a.isPrimary)
        ?.hotsBattleTag.replace(/#.*$/, '')}\`, \`${getPlayerRolesFormatted(
        result.player.role
      )}\`\nUse /leave to leave the lobby, or use the buttons below.`;
    await safeReply(interaction, {
      content,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, battleTagBtn, roleBtn)],
    });
    return;
  }
  if (result.player === undefined) {
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
    },
    hotsBattleTag
  ); // Save player data to the database with default role Flex
  await handleEditRoleCommand(modalInteraction, true); // Show the edit role buttons
}

/**
 * Handles the admin command interaction, shows buttons to manage roles and players
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 */
export async function handleAdminShowRoleButtons(interaction: ButtonInteraction<CacheType>, pId: string) {
  const rolesRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...Object.entries(roleMap).map(([key, label]) => {
      return new ButtonBuilder()
        .setCustomId(`${CommandIds.ROLE_ADMIN}_${pId}_${key}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary);
    })
  );

  const components = [rolesRow];
  await safeReply(interaction, {
    content: 'Please select their new role using the buttons below.',
    components,
    flags: MessageFlags.Ephemeral,
  });
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

  const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, battleTagBtn, roleBtn)];
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

/**
 * Handles the battle tag command interaction, changes the users battle tag in the lobby
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 */
export async function handleBattleTagCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    const playerExists = getPlayerByDiscordId(interaction.user.id); // Get player by Discord ID
    if (!playerExists) {
      // If player does not exist, show a modal to collect the battle tag and role
      await showJoinModal(interaction);
      return;
    }
    const { hotsBattleTag, modalInteraction } = await handleUserNameModalSubmit(interaction);
    if (!modalInteraction || !hotsBattleTag) {
      // If modal interaction is undefined, it means the user did not respond in time
      return;
    }

    const player = getPlayerByDiscordId(modalInteraction.user.id);
    if (player) {
      setPlayerName(interaction, modalInteraction.user.id, hotsBattleTag); // Update the player's battle tag in the database
      await safeReply(modalInteraction, {
        content: `Your battle tag has been set to: \`${hotsBattleTag}\``,
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }
  const battleTag = interaction.options.getString(CommandIds.BATTLE_TAG, false);
  const player = getPlayerByDiscordId(interaction.user.id); // Get player by Discord ID
  if (player && battleTag) {
    // If player exists and battleTag is provided
    const newPlayer: Player = {
      ...player,
      usernames: { ...player.usernames }, // Update the hots battle tag
    };
    await savePlayer(interaction, interaction.user.id, newPlayer, battleTag); // Save player data to the database
    await safeReply(interaction, {
      content: `Your battle tag has been set to: \`${battleTag}\``,
      flags: MessageFlags.Ephemeral,
    });
  } else if (battleTag) {
    const discordData = fetchDiscordNames(interaction);
    await savePlayer(interaction, interaction.user.id, {
      discordId: interaction.user.id,
      usernames: { ...discordData },
      role: CommandIds.ROLE_FLEX, // Default role is Flex
      active: false,
      team: undefined,
    });
    await safeReply(interaction, {
      content: `Your battle tag has been set to: \`${battleTag}\``,
      flags: MessageFlags.Ephemeral,
    });
    // If player does not exist, we know their name, but not their role
    await handleEditRoleCommand(interaction); // Show the edit role buttons
    return;
  } else {
    // If player does not exist, show a modal to collect the battle tag and role
    await showJoinModal(interaction);
    return;
  }
}

export async function handleAddHotsAccountCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const discordId = interaction.user.id;
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG);
  // check if the battleTag is valid, it should be in the format of Name#1234
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
 * @returns An object containing the battle tag and the modal interaction.
 */
async function handleUserNameModalSubmit(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
): Promise<{
  hotsBattleTag: string | undefined;
  modalInteraction: ModalSubmitInteraction<CacheType> | undefined;
}> {
  const previousPlayer = getPlayerByDiscordId(interaction.user.id);

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

/**
 * Handles the admin show battle tag modal interaction, shows a modal to set the player's Heroes of the Storm battle tag
 * @param interaction The interaction object from Discord, either a ButtonInteraction.
 * @param pId The Discord ID of the player whose battle tag is being set.
 */
export async function handleAdminShowBattleTagModal(
  interaction: ButtonInteraction<CacheType>,
  pId: string
): Promise<{ battleTag?: string; modalInteraction?: ModalSubmitInteraction<CacheType> }> {
  const previousPlayer = getPlayerByDiscordId(pId);
  // create a modal with a text field to collect the battle tag
  const adminBattleTagInput = new TextInputBuilder()
    .setCustomId('adminBattleTagInput')
    .setLabel('Enter their Heroes of the Storm battle tag (e.g. Name#1234)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Their Heroes of the Storm battle tag')
    .setValue(previousPlayer?.usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag ?? '');

  // Add the input to an action row
  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(adminBattleTagInput);

  // Create the modal
  const modal = new ModalBuilder().setCustomId('battleTag').setTitle('Set Their battle tag').addComponents(actionRow);
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
      return { battleTag: undefined, modalInteraction: undefined }; // Return undefined if the modal interaction is not received
    }
    console.error('Error awaiting modal submit:', error);
    return { battleTag: undefined, modalInteraction: undefined }; // Return undefined if the modal interaction is not received
  }
  const battleTag = modalInteraction.fields.getTextInputValue('adminBattleTagInput');
  if (!battleTag) {
    await safeReply(modalInteraction, {
      content: 'You must provide a battle tag.',
      flags: MessageFlags.Ephemeral,
    });
    return { battleTag: undefined, modalInteraction: undefined };
  }
  handleAdminSetBattleTagCommand(modalInteraction, pId, battleTag);
  return { battleTag, modalInteraction };
}

function createEditRoleButtonDisabled(
  interaction: chatOrButtonOrModal,
  commandId: string,
  emoji: string
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${commandId}_${interaction.user.id}`)
    .setLabel(emoji)
    .setStyle(ButtonStyle.Secondary);
}

function createEditRoleButtonEnabled(
  interaction: chatOrButtonOrModal,
  commandId: string,
  emoji: string
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${commandId}_${interaction.user.id}`)
    .setEmoji(emoji)
    .setStyle(ButtonStyle.Primary);
}

function getEditRoleRow(
  interaction: chatOrButtonOrModal,
  action: string,
  setActive = false
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...Object.entries(roleMap).map(([key, label]) => {
      return new ButtonBuilder()
        .setCustomId(`${action}_${interaction.user.id}_${key}`) // Use the action
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
  let roles = ', current role: ' + getPlayerRolesFormatted(player.role);
  // create a button that will set this interaction to add mode
  const activeSuffix = setActive ? '_' + CommandIds.ACTIVE : '';
  const row2 = getEditRoleRow(interaction, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, setActive);
  const content = (setActive ? 'You must click a role to join the lobby\n' : '') + 'Replace Mode' + roles; // Default content for the reply
  if (interaction.replied) {
    await interaction.followUp({
      content,
      flags: MessageFlags.Ephemeral,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          createEditRoleButtonDisabled(interaction, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
          createEditRoleButtonEnabled(interaction, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
          createEditRoleButtonDisabled(interaction, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
        ),
        row2,
      ],
    });
    return;
  }
  await safeReply(interaction, {
    content,
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(interaction, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonEnabled(interaction, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(interaction, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
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
    safeReply(interaction, {
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
  let roles = ', current role: ' + getPlayerRolesFormatted(player.role); // Get the formatted roles of the player

  const row2 = getEditRoleRow(interaction, action, setActive);
  // Handle the role editing logic based on the action
  let setActiveNext: boolean;
  if (setActive === true && player.active === false && role !== undefined) {
    // If the action is set to active, we need to handle it differently
    setPlayerActive(interaction.user.id, true); // Set the player as active
    setActiveNext = false; // Reset the active state for the next interaction
  } else {
    setActiveNext = setActive; // Keep the active state as is
  }
  const activeSuffix = setActiveNext ? '_' + CommandIds.ACTIVE : '';
  const activePrefix = setActive ? 'You must click a role to join the lobby\n' : ''; // Default content for the reply
  switch (action) {
    case CommandIds.ROLE_EDIT_ADD:
      showAddButtons(interaction, player, role, roles, activePrefix, row2, activeSuffix);
      break;
    case CommandIds.ROLE_EDIT_REMOVE:
      showRemoveButtons(interaction, player, role, roles, activePrefix, row2, activeSuffix);
      break;
    case CommandIds.ROLE_EDIT_REPLACE:
      showReplaceButtons(interaction, player, role, roles, activePrefix, row2, activeSuffix);
      break;
  }
  if (setActive === true && player.active === false && role !== undefined) {
    // If setActive is true, we need to set the player as active
    announce(
      interaction,
      `<@${interaction.user.id}> (${player.usernames.accounts
        ?.find(a => a.isPrimary)
        ?.hotsBattleTag.replace(/#.*$/, '')}) has joined the lobby as \`${getPlayerRolesFormatted(player.role)}\``
    );
  }
}

function showAddButtons(
  interaction: ButtonInteraction<CacheType>,
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
    setPlayerRole(interaction.user.id, newRoles); // Update the player's role in the database
    roles = ', current role: ' + getPlayerRolesFormatted(newRoles);
  }
  interaction.update({
    content: activePrefix + 'Add Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonEnabled(interaction, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonDisabled(interaction, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(interaction, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
      ),
      row2,
    ],
  });
}

function showRemoveButtons(
  interaction: ButtonInteraction<CacheType>,
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
    setPlayerRole(interaction.user.id, newRoles); // Update the player's role in the database
    roles = ', current role: ' + getPlayerRolesFormatted(newRoles);
  }
  interaction.update({
    content: activePrefix + 'Remove Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(interaction, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonDisabled(interaction, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonEnabled(interaction, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
      ),
      row2,
    ],
  });
}

function showReplaceButtons(
  interaction: ButtonInteraction<CacheType>,
  player: Player,
  role: string | undefined,
  roles: string,
  activePrefix: string,
  row2: ActionRowBuilder<ButtonBuilder>,
  activeSuffix: string
) {
  if (role) {
    setPlayerRole(interaction.user.id, role);
    roles = ', current role: ' + getPlayerRolesFormatted(role);
  }
  interaction.update({
    content: activePrefix + 'Replace Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(interaction, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonEnabled(interaction, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(interaction, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
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
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG, false) ?? '';

  const player = getPlayerByDiscordId(discordId);
  const message = player
    ? `${hotsBattleTag || 'Player'} found in the lobby with role: \`${getPlayerRolesFormatted(player.role)}\``
    : `${hotsBattleTag || 'Player'} not found in the lobby, adding them with default role \`${getPlayerRolesFormatted(
        CommandIds.ROLE_FLEX
      )}\`.`;
  await safeReply(interaction, {
    content: `Discord ID: \`${discordId}\`\ndiscordName: \`${discordData.discordName}\`\ndiscordGlobalName: \`${discordData.discordGlobalName}\`\nDisplay Name: \`${discordData.discordDisplayName}\`\n${message}`,
    flags: MessageFlags.Ephemeral,
  });
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
      },
      hotsBattleTag
    );
    return;
  }
  // update the player's Discord data in the database
  setPlayerDiscordNames(discordId, discordData);
  if (hotsBattleTag && !player.usernames.accounts?.some(a => a.hotsBattleTag !== hotsBattleTag)) {
    setPlayerName(interaction, discordId, hotsBattleTag); // Update the player's Heroes of the Storm name in the database
  }
  // return;
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

  if (!channel) {
    await safeReply(interaction, {
      content: 'Channel not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const message = await channel.messages.fetch(messageId);
    await message.delete();
    await safeReply(interaction, {
      content: `Deleted message: ${message.content}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    await safeReply(interaction, {
      content: 'Failed to delete message. Please make sure the message ID is correct.',
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

export function handleAdminSetBattleTagCommand(
  interaction: ModalSubmitInteraction<CacheType>,
  pId: string,
  hotsName: string
): void;
export function handleAdminSetBattleTagCommand(interaction: ChatInputCommandInteraction<CacheType>): void;
export async function handleAdminSetBattleTagCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ModalSubmitInteraction<CacheType>,
  pId?: string,
  hotsName?: string
): Promise<void> {
  if (!userIsAdmin(interaction)) {
    return;
  }

  const member = getMemberFromInteraction(interaction, pId);
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to set their name.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const newBattleTag = interaction.isChatInputCommand()
    ? interaction.options.getString(CommandIds.BATTLE_TAG, true)
    : hotsName ?? '';
  const id = member.user.id;
  setPlayerName(interaction, id, newBattleTag);
  await safeReply(interaction, {
    content: `Set ${member.user.displayName}'s Heroes of the Storm battle tag to \`${newBattleTag}\``,
    flags: MessageFlags.Ephemeral,
  });
  // return;
}

export function handleAdminSetRoleCommand(interaction: ChatInputCommandInteraction<CacheType>): void;
export function handleAdminSetRoleCommand(
  interaction: ButtonInteraction<CacheType>,
  pId: string,
  pRole: keyof typeof roleMap
): void;
export async function handleAdminSetRoleCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pId?: string,
  pRole?: keyof typeof roleMap
) {
  if (!userIsAdmin(interaction)) {
    return;
  }
  const member = getMemberFromInteraction(interaction, pId);
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to set their name.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const role = interaction.isChatInputCommand()
    ? interaction.options.getString(CommandIds.ROLE, true)
    : pRole ?? CommandIds.ROLE_FLEX;
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
  if (!userIsAdmin(interaction)) {
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
    const adminBattleTagBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.BATTLE_TAG}_${id}`)
      .setLabel('Admin Battle Tag')
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
          adminBattleTagBtn,
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
