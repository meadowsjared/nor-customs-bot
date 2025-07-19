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
  nameBtn,
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
import { saveChannel, getChannels } from '../store/channels';
import { DiscordUserNames, Player } from '../types/player';

export async function handleNewGameCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const activePlayers = getActivePlayers();
  const observers = activePlayers
    .filter(p => p?.team === undefined)
    .map(p => `<@${p.discordId}>`)
    .join('');
  const team1 = activePlayers
    .filter(p => p.team === 1)
    .map(p => `<@${p.discordId}>`)
    .join('');
  const team2 = activePlayers
    .filter(p => p.team === 2)
    .map(p => `<@${p.discordId}>`)
    .join('');
  // combine the observers, team1, and team2, into one string, labeling each section, but skip a section if there are no players in that section
  const playerListWithLabels = [];
  if (observers) playerListWithLabels.push(`**Observers**:\n${observers}`);
  if (team1) playerListWithLabels.push(`**Team 1**:\n${team1}`);
  if (team2) playerListWithLabels.push(`**💩 Filthy Team 2**:\n${team2}`);
  const playerListWithLabelsString = playerListWithLabels.join('\n');

  markAllPlayersInactive();
  // announce in the channel that a new game has started and all players have been marked as inactive, so they need to hit the button if they are going to play
  await announce(
    interaction,
    `${playerListWithLabelsString}\nA new game has started! All players have been marked as inactive.\nPlease click below if you are going to play.`,
    undefined,
    [new ActionRowBuilder<ButtonBuilder>().addComponents(imPlayingBtn)]
  );
  interaction.reply({
    content: 'Game announced!', // empty content to avoid sending a message in the channel, since we already announced it'
    flags: MessageFlags.Ephemeral,
  });
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
    .map(name => activePlayers.find(player => player.usernames.hots.toLowerCase() === name.toLowerCase()))
    .filter(p => p !== undefined);
  const team2 = teamsData.team2
    .map(name => activePlayers.find(player => player.usernames.hots.toLowerCase() === name.toLowerCase()))
    .filter(p => p !== undefined);
  setTeams(
    team1.map(p => p.discordId),
    team2.map(p => p.discordId)
  ); // Save the teams to the database

  const team1Message = team1.map(p => `* ${p.usernames.discordDisplayName} (${p.usernames.hots})`).join('\n');
  const team2Message = team2.map(p => `* ${p.usernames.discordDisplayName} (${p.usernames.hots})`).join('\n');

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
  await interaction.reply({
    content: `<@${norDiscordId}>`,
    embeds: [team1embed, team2embed],
    // flags: MessageFlags.Ephemeral,
  });
}

export async function handleMoveToLobbyCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const result = getChannels(['lobby']);
  if (!result || result.length === 0) {
    await interaction.reply({
      content: 'No lobby channel set. Please set a lobby channel first using `/set_lobby_channel`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const lobby = getChannels(['lobby'])?.[0];
  if (!lobby) {
    await interaction.reply({
      content: 'No lobby channel set. Please set a lobby channel first using `/set_lobby_channel`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // move everybody to the lobby channel
  const lobbyChannel = interaction.guild?.channels.cache.get(lobby.channelId);
  if (!lobbyChannel || !(lobbyChannel instanceof VoiceChannel)) {
    await interaction.reply({
      content: 'Lobby channel is not a valid voice channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const players = getActivePlayers();
  let numberMoved = 0;
  const movePromises = players.map(async player => {
    const member = interaction.guild?.members.cache.get(player.discordId);
    if (member?.voice) {
      await member.voice
        .setChannel(lobbyChannel)
        .then(() => {
          numberMoved++;
        })
        .catch(err => {
          console.error(`Failed to move ${member.displayName} to lobby:`, err);
        });
    }
  });
  await Promise.all(movePromises);
  await interaction.reply({
    content: `Moved all ${numberMoved} players to the lobby channel: \`${lobby.channelName}\``,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleMoveToTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const result = getChannels(['team1', 'team2']);
  if (!result || result.length === 0) {
    await interaction.reply({
      content: 'No team channels set. Please set team channels first using `/set_channel_team_id`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (result.length < 2) {
    // tell them which channel they need to set
    await interaction.reply({
      content: `You need to set both team channels using \`/set_channel_team_id\`.\nCurrently, only one team channel is set: \`${result[0].channelName}\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const teams = getTeams();
  let numberMoved = 0;
  // array for storing the ids of all the players that it failed to move:
  const failedToMove: string[] = [];
  for (const [index, channel] of result.entries()) {
    // result.forEach((channel, index) => {
    const teamChannel = interaction.guild?.channels.cache.get(channel.channelId);
    if (!teamChannel || !(teamChannel instanceof VoiceChannel)) {
      interaction.reply({
        content: `Team channel \`${channel.channelName}\` is not a valid voice channel.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const team = index === 0 ? teams.team1 : teams.team2; // team1 for index 0, team2 for index 1
    numberMoved += await moveTeamMembersToChannel(interaction, team, teamChannel, failedToMove);
    // });
  }
  if (failedToMove.length !== 0) {
    await interaction.reply({
      content: `Moved ${numberMoved} players to their respective team channels\nWARNING: **${
        teams.team1.length + teams.team2.length - numberMoved
      } players could not be moved.**`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await interaction.reply({
      content: `Moved all ${numberMoved} players to their respective team channels: \`${result
        .map(c => c.channelName)
        .join('`, `')}\``,
      flags: MessageFlags.Ephemeral,
    });
  }
  if (failedToMove.length > 0) {
    await interaction.followUp({
      content: `Failed to move the following players to their team channels:\n${failedToMove
        .map(id => `<@${id}>`)
        .join('\n')}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function moveTeamMembersToChannel(
  interaction: Interaction,
  team: Player[],
  channel: VoiceChannel,
  failedToMove: string[]
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
        .catch(err => {
          failedToMove.push(player.discordId);
          console.error(`\nMember ${player.discordId}, ${player.usernames.discordDisplayName}, is not on discord:`);
        });
    } else {
      failedToMove.push(player.discordId);
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
    await interaction.reply({
      content: 'Please select a valid voice channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  saveChannel(teamId, channel);
  await interaction.reply({
    content: `${teamId} channel set to \`${channel.name}\`.`,
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
    await interaction.reply({
      content: 'Please select a valid voice channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  saveChannel('lobby', channel);
  // This command is not implemented yet
  await interaction.reply({
    content: `lobby channel set to \`${channel.name}\``,
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
        '```🟢 /join   — Join the lobby with your username and role',
        '🔴 /leave  — Leave the lobby',
        '🔄 /rejoin — Rejoin the lobby',
        '✏️ /name   — Change your username',
        '🎭 /role   — Change your role```',
      ].join('\n')
    )
    .addFields({ name: 'Roles', value: '🛡️ Tank, ⚔️ Assassin, 💪 Bruiser, 💉 Healer, 🔄 Flex' })
    // .addFields(
    //   { name: '`/join`', value: 'Join the lobby with your Heroes of the Storm username and role.' },
    //   { name: '`/leave`', value: 'Leave the lobby.' },
    //   { name: '`/rejoin`', value: 'Rejoin the lobby with your previous username and role.' },
    //   { name: '`/name`', value: 'Change your Heroes of the Storm username.' },
    //   { name: '`/role`', value: 'Change your role in the lobby.' }
    // )
    .setFooter({ text: 'Enjoy playing!' })
    .setImage(
      'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png'
    );
  await interaction.reply({ embeds: [exampleEmbed] });
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
          return `<@${discordId}>: (${usernames.hots}) \`${getPlayerRolesFormatted(role)}\``;
        }
        const user = interaction.guild?.members.cache.get(discordId)?.displayName;
        return `@${user}: (${usernames.hots}) \`${getPlayerRolesFormatted(role)}\``;
      })
      .join('\n') || 'No players in the lobby';
  const rawPlayerList = Array.from(players.entries())
    .filter(([_, player]) => player.active)
    .map(([_, { usernames, role }]) => `${usernames.hots} ${role}`);
  await interaction.reply({
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
    // announce in the channel who has left
    await announce(interaction, `<@${interaction.user.id}> (${player.usernames.hots}) has left the lobby`);
    await interaction.reply({
      content: `You left the lobby`,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(rejoinBtn)],
    });
  } else {
    await interaction.reply({ content: 'You are not in the lobby', flags: MessageFlags.Ephemeral });
  }
}

export async function handleClearCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  markAllPlayersInactive(); // Mark all players as inactive in the database
  await interaction.reply({
    content: 'All players have been removed from the lobby.',
    flags: MessageFlags.Ephemeral,
  });
}

/**
 *  Handles the rejoin command interaction, allows a user to rejoin the lobby with their previous username and role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 */
export async function handleRejoinCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  newUser = false
) {
  const result = markPlayerActive(interaction.user.id); // Mark player as active in the database
  if (result.player) {
    if (result.alreadyActive === false) {
      // announce in the channel who has rejoined
      await announce(
        interaction,
        `<@${interaction.user.id}> (${result.player.usernames.hots}) has ${
          newUser ? 'joined' : 'rejoined'
        } the lobby as \`${getPlayerRolesFormatted(result.player.role)}\``
      );
    }
    const joinVerb = newUser ? 'joined' : 'rejoined';
    const content =
      (result.alreadyActive === true ? `You are already in` : `You have ${joinVerb}`) +
      ` the lobby as: ${result.player.usernames.hots}, \`${getPlayerRolesFormatted(
        result.player.role
      )}\`\nUse /leave to leave the lobby, or use the buttons below.`;
    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, nameBtn, roleBtn)],
    });
    return;
  }
  if (result.player === undefined) {
    // show a dialog to collect the username and role
    await showJoinModal(interaction);
  }
}

/**
 * Shows a modal to the user to collect their username and role, then returns the data to the handleJoinCommand function
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns { username: string, role: string } The username and role of the player.
 */
async function showJoinModal(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
): Promise<void> {
  const { username, modalInteraction } = await handleUserNameModalSubmit(interaction);
  if (!modalInteraction || !username) {
    // If modal interaction is undefined, it means the user did not respond in time
    console.log('error: User did not respond to the modal in time');
    return;
  }
  const discordData = fetchDiscordNames(modalInteraction);
  savePlayer(modalInteraction.user.id, {
    discordId: modalInteraction.user.id,
    usernames: { hots: username, ...discordData },
    role: CommandIds.ROLE_FLEX, // Default role is Flex
    active: false,
    team: undefined,
  });
  await handleEditRoleCommand(modalInteraction, false, true); // Show the edit role buttons
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
  await interaction.reply({
    content: 'Please select their new role using the buttons below.',
    components,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handles the join command interaction, adds the user to the lobby with their username and role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 */
export async function handleJoinCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    await handleRejoinCommand(interaction, true);
    return; // If it's a button interaction, we handle rejoin directly
  }
  const username = interaction.options.getString('username', true);
  const role = interaction.options.getString(CommandIds.ROLE, true);
  const discordData = fetchDiscordNames(interaction);
  const newPlayer: Player = {
    discordId: interaction.user.id,
    usernames: { hots: username, ...discordData },
    role,
    active: true,
    team: undefined,
  };
  savePlayer(interaction.user.id, newPlayer); // Save player data to the database
  // announce in the channel who has joined
  await handleUserJoined(interaction, username, role);
}

/**
 * Handles the user joining the lobby, announces their presence and provides buttons for further actions
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param username The hots username of the user who joined.
 * @param role The role of the user who joined, based on the roleMap keys.
 * @param skipReply (optional) Whether to skip the reply and just follow up with the components.
 */
async function handleUserJoined(interaction: chatOrButtonOrModal, username: string, role: string, skipReply = false) {
  await announce(
    interaction,
    `<@${interaction.user.id}> (${username}) has joined the lobby as \`${getPlayerRolesFormatted(role)}\``
  );
  const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, nameBtn, roleBtn)];
  if (skipReply) {
    await interaction.followUp({
      components,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({
    components,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handles the name command interaction, changes the users username in the lobby
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 */
export async function handleNameCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    const playerExists = getPlayerByDiscordId(interaction.user.id); // Get player by Discord ID
    if (!playerExists) {
      // If player does not exist, show a modal to collect the username and role
      await showJoinModal(interaction);
      return;
    }
    const { username, modalInteraction } = await handleUserNameModalSubmit(interaction);
    if (!modalInteraction || !username) {
      // If modal interaction is undefined, it means the user did not respond in time
      return;
    }

    const player = getPlayerByDiscordId(modalInteraction.user.id);
    if (player) {
      setPlayerName(modalInteraction.user.id, username); // Update the player's username in the database
      await modalInteraction.reply({
        content: `Your username has been set to: ${username}`,
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }
  const username = interaction.options.getString('username', false);
  const player = getPlayerByDiscordId(interaction.user.id); // Get player by Discord ID
  if (player && username) {
    // If player exists and username is provided
    const newPlayer = {
      ...player,
      usernames: { ...player.usernames, hots: username }, // Update the hots username
    };
    savePlayer(interaction.user.id, newPlayer); // Save player data to the database
    await interaction.reply({
      content: `Your username has been set to: ${username}`,
      flags: MessageFlags.Ephemeral,
    });
  } else if (username) {
    const discordData = fetchDiscordNames(interaction);
    savePlayer(interaction.user.id, {
      discordId: interaction.user.id,
      usernames: { hots: username, ...discordData },
      role: CommandIds.ROLE_FLEX, // Default role is Flex
      active: false,
      team: undefined,
    });
    await interaction.reply({
      content: `Your username has been set to: ${username}`,
      flags: MessageFlags.Ephemeral,
    });
    // If player does not exist, we know their name, but not their role
    await handleEditRoleCommand(interaction, true); // Show the edit role buttons
    return;
  } else {
    // If player does not exist, show a modal to collect the username and role
    await showJoinModal(interaction);
    return;
  }
}

/**
 * Handles the user name modal submission.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns An object containing the username and the modal interaction.
 */
async function handleUserNameModalSubmit(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
): Promise<{ username: string | undefined; modalInteraction: ModalSubmitInteraction<CacheType> | undefined }> {
  const previousPlayer = getPlayerByDiscordId(interaction.user.id);

  // create a modal with a text field to collect the username
  const usernameInput = new TextInputBuilder()
    .setCustomId('usernameInput')
    .setLabel('Enter your Heroes of the Storm username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Your Heroes of the Storm username')
    .setValue(previousPlayer?.usernames.hots ?? interaction.user.displayName ?? ''); // Use previous username if available

  // Add the input to an action row
  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput);

  // Create the modal
  const modal = new ModalBuilder().setCustomId('nameModal').setTitle('Set Your Username').addComponents(actionRow);
  // get the username from the TextInputBuilder
  await interaction.showModal(modal);
  let modalInteraction: ModalSubmitInteraction<CacheType>;
  try {
    modalInteraction = await interaction.awaitModalSubmit({
      filter: i => i.customId === 'nameModal',
      time: 5 * 60 * 1000,
    }); // 5 minutes timeout
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'InteractionCollectorError') {
      return { username: undefined, modalInteraction: undefined }; // Return undefined if the modal interaction is not received
    }
    console.error('Error awaiting modal submit:', error);
    return { username: undefined, modalInteraction: undefined }; // Return undefined if the modal interaction is not received
  }
  const username = modalInteraction.fields.getTextInputValue('usernameInput');
  return { username, modalInteraction };
}

/**
 * Handles the admin show name modal interaction, shows a modal to set the player's Heroes of the Storm username
 * @param interaction The interaction object from Discord, either a ButtonInteraction.
 * @param pId The Discord ID of the player whose name is being set.
 */
export async function handleAdminShowNameModal(
  interaction: ButtonInteraction<CacheType>,
  pId: string
): Promise<{ username?: string; modalInteraction?: ModalSubmitInteraction<CacheType> }> {
  const previousPlayer = getPlayerByDiscordId(pId);
  // create a modal with a text field to collect the username
  const adminUsernameInput = new TextInputBuilder()
    .setCustomId('adminUsernameInput')
    .setLabel('Enter their Heroes of the Storm username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Their Heroes of the Storm username')
    .setValue(previousPlayer?.usernames.hots ?? '');

  // Add the input to an action row
  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(adminUsernameInput);

  // Create the modal
  const modal = new ModalBuilder().setCustomId('nameModal').setTitle('Set Their Username').addComponents(actionRow);
  // get the username from the TextInputBuilder
  await interaction.showModal(modal);

  let modalInteraction: ModalSubmitInteraction<CacheType>;
  try {
    modalInteraction = await interaction.awaitModalSubmit({
      filter: i => i.customId === 'nameModal',
      time: 5 * 60 * 1000,
    }); // 5 minutes timeout
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'InteractionCollectorError') {
      return { username: undefined, modalInteraction: undefined }; // Return undefined if the modal interaction is not received
    }
    console.error('Error awaiting modal submit:', error);
    return { username: undefined, modalInteraction: undefined }; // Return undefined if the modal interaction is not received
  }
  const username = modalInteraction.fields.getTextInputValue('adminUsernameInput');
  if (!username) {
    await modalInteraction.reply({
      content: 'You must provide a username.',
      flags: MessageFlags.Ephemeral,
    });
    return { username: undefined, modalInteraction: undefined };
  }
  handleAdminSetNameCommand(modalInteraction, pId, username);
  return { username, modalInteraction };
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
export async function handleEditRoleCommand(interaction: chatOrButtonOrModal, followUp = false, setActive = false) {
  const player = getPlayerByDiscordId(interaction.user.id); // Get player by Discord ID
  if (!player) {
    if (followUp) {
      await interaction.followUp({
        content: 'You are not in the lobby. Click the button below to join.',
        flags: MessageFlags.Ephemeral,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
      });
      return;
    }
    await interaction.reply({
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
  if (followUp) {
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
  await interaction.reply({
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
    interaction.reply({
      content: 'This command can only be used with buttons.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    await interaction.reply({
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    });
    return;
  }
  let roles = ', current role: ' + getPlayerRolesFormatted(player.role); // Get the formatted roles of the player

  const row2 = getEditRoleRow(interaction, action, setActive);
  // Handle the role editing logic based on the action
  let setActiveNext = setActive;
  if (setActive === true && player.active === false && role !== undefined) {
    // If the action is set to active, we need to handle it differently
    setPlayerActive(interaction.user.id, true); // Set the player as active
    setActiveNext = false; // Reset the active state for the next interaction
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
      `<@${interaction.user.id}> (${player.usernames.hots}) has joined the lobby as \`${getPlayerRolesFormatted(
        player.role
      )}\``
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

  interaction.reply({ embeds: [exampleEmbed] });
}

export async function handleLookupCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const member = interaction.options.getMember('discord_member');
  if (!member || 'user' in member === false) {
    await interaction.reply({
      content: 'Please provide a valid Discord member to look up.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const id = member.user.id;
  const discordData = fetchDiscordNames(interaction, id);
  const hotsName = interaction.options.getString('hots_name', false) ?? '';

  const player = getPlayerByDiscordId(id);
  const message = player
    ? `${hotsName || 'Player'} found in the lobby with role: \`${getPlayerRolesFormatted(player.role)}\``
    : `${hotsName || 'Player'} not found in the lobby, adding them with default role \`${getPlayerRolesFormatted(
        CommandIds.ROLE_FLEX
      )}\`.`;
  await interaction.reply({
    content: `Discord ID: \`${id}\`\ndiscordName: \`${discordData.discordName}\`\ndiscordGlobalName: \`${discordData.discordGlobalName}\`\nDisplay Name: \`${discordData.discordDisplayName}\`\n${message}`,
    flags: MessageFlags.Ephemeral,
  });
  // save the player to the database if they are not already there
  if (!player) {
    savePlayer(id, {
      discordId: id,
      usernames: {
        ...discordData,
        hots: hotsName,
      },
      role: CommandIds.ROLE_FLEX, // Default role is Flex
      active: false,
      team: undefined,
    });
    return;
  }
  // update the player's Discord data in the database
  setPlayerDiscordNames(id, discordData);
  if (hotsName && hotsName !== player.usernames.hots) {
    setPlayerName(id, hotsName); // Update the player's Heroes of the Storm name in the database
  }
  // return;
}

/**
 * Handles the move command interaction, moves a Discord member to a specified voice channel
 * @param interaction The interaction object from Discord, will be a ChatInputCommandInteraction
 * @returns <void>
 */
export async function handleMoveCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const member = interaction.options.getMember('discord_member');
  if (!member || 'user' in member === false) {
    interaction.reply({
      content: 'Please provide a valid Discord member to move.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const channel = interaction.options.getChannel('channel', true);
  if (!(channel instanceof VoiceChannel)) {
    interaction.reply({
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
      interaction.reply({
        content: `Failed to move ${member.user.username} to ${channel.name}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }
  interaction.reply({
    content: `Moved ${member.user.username} to ${channel.name}.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleDeleteMessageCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand()) {
    interaction.reply({
      content: 'This command can only be used as a slash command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (userIsAdmin(interaction) === false) {
    interaction.reply({
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const messageId = interaction.options.getString('message_id', true);
  const channel = interaction.channel;

  if (!channel) {
    interaction.reply({
      content: 'Channel not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const message = await channel.messages.fetch(messageId);
    await message.delete();
    interaction.reply({
      content: `Deleted message: ${message.content}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    interaction.reply({
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
    return interaction.options.getMember('discord_member');
  }
  if (pId) {
    return interaction.guild?.members.cache.get(pId) ?? null;
  }
  return null;
}

export function handleAdminSetNameCommand(
  interaction: ModalSubmitInteraction<CacheType>,
  pId: string,
  hotsName: string
): void;
export function handleAdminSetNameCommand(interaction: ChatInputCommandInteraction<CacheType>): void;
export function handleAdminSetNameCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ModalSubmitInteraction<CacheType>,
  pId?: string,
  hotsName?: string
): void {
  if (!userIsAdmin(interaction)) {
    return;
  }

  const member = getMemberFromInteraction(interaction, pId);
  if (!member || 'user' in member === false) {
    interaction.reply({
      content: 'Please provide a valid Discord member to set their name.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const newName = interaction.isChatInputCommand()
    ? interaction.options.getString(CommandIds.NAME, true)
    : hotsName ?? '';
  const id = member.user.id;
  setPlayerName(id, newName);
  interaction.reply({
    content: `Set ${member.user.displayName}'s Heroes of the Storm name to \`${newName}\``,
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
export function handleAdminSetRoleCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pId?: string,
  pRole?: keyof typeof roleMap
) {
  if (!userIsAdmin(interaction)) {
    return;
  }
  const member = getMemberFromInteraction(interaction, pId);
  if (!member || 'user' in member === false) {
    interaction.reply({
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
    interaction.reply({
      content: 'Player not found in the lobby. Please make sure they have joined first.',
      flags: MessageFlags.Ephemeral,
    });
  }
  interaction.reply({
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
    interaction.reply({
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const member = getMemberFromInteraction(interaction, pId);
  if (!member || 'user' in member === false) {
    interaction.reply({
      content: 'Please provide a valid Discord member to set their active status.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const isActive = getActiveFromInteraction(interaction, pActive); // Get the active status from the interaction or use the provided value
  const id = pId ?? member.user.id;
  const { player, updated } = setPlayerActive(id, isActive); // Set player as active in the database
  if (!player) {
    interaction.reply({
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
    const adminNameBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.NAME}_${id}`)
      .setLabel('Admin Name')
      .setStyle(ButtonStyle.Secondary);
    const adminRoleBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.ROLE}_${id}`)
      .setLabel('Admin Role')
      .setStyle(ButtonStyle.Secondary);
    interaction.reply({
      content: `Set ${member.user.displayName}'s active status to \`${
        isActive ? CommandIds.ACTIVE : CommandIds.INACTIVE
      }\``,
      flags: MessageFlags.Ephemeral,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          isActive ? adminLeaveBtn : adminJoinBtn,
          adminNameBtn,
          adminRoleBtn
        ),
      ],
    });
    if (isActive) {
      await announce(
        interaction,
        `<@${id}> (${player.usernames.hots}) has joined the lobby as \`${getPlayerRolesFormatted(player.role)}\``
      );
    } else {
      await announce(interaction, `<@${id}> (${player.usernames.hots}) has left the lobby`);
    }
  } else {
    interaction.reply({
      content: `${player.usernames.hots} is already ${isActive ? CommandIds.ACTIVE : CommandIds.INACTIVE}.`,
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
function userIsAdmin(interaction: chatOrButtonOrModal): boolean {
  const isAdmin = adminUserIds.includes(interaction.user.id);
  if (isAdmin) {
    return true;
  }
  interaction.reply({
    content: 'You do not have permission to use this command.',
    flags: MessageFlags.Ephemeral,
  });
  return false;
}
