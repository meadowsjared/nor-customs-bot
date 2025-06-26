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
  CommandIds,
  imPlayingBtn,
  joinBtn,
  leaveBtn,
  nameBtn,
  norDiscordId,
  rejoinBtn,
  roleBtn,
  roleMap,
  rolesActiveRow,
  rolesRow,
} from '../constants';
import { announce } from '../utils/announce';
import {
  getActivePlayers,
  getPlayerByDiscordId,
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
  markAllPlayersInactive();
  // announce in the channel that a new game has started and all players have been marked as inactive, so they need to hit the button if they are going to play
  await announce(
    interaction,
    'A new game has started! All players have been marked as inactive.\nPlease click below if you are going to play.',
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

  const message =
    '**Team 1**:\n' +
    team1.map(p => `${p.usernames.discordDisplayName} (${p.usernames.hots})`).join('\n') +
    '\n\n**Team2**:\n' +
    team2.map(p => `${p.usernames.discordDisplayName} (${p.usernames.hots})`).join('\n');

  await interaction.reply({
    content: `<@${norDiscordId}>\nHere are the teams: \n${message}`,
    // flags: MessageFlags.Ephemeral,
  });
}

// TODO: implement this command
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

  // This command is not implemented yet
  await interaction.reply({
    content: `This command is not implemented yet.\nlobby channel is set to: \`${result[0].channelName}\``,
    flags: MessageFlags.Ephemeral,
  });
}

// TODO: implement this command
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
  // This command is not implemented yet
  await interaction.reply({
    content: `This command is not implemented yet.\nTeam channels are set to:\n1:\`${result[0].channelName}\`\n2:\`${result[1].channelName}\``,
    flags: MessageFlags.Ephemeral,
  });
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
    .setTitle("Nor's Heroes of the Storm Custom Lobby Guide")
    // .setDescription(
    //   'This is a custom lobby for Heroes of the Storm. Use the commands below to join, leave, or manage your role in the lobby.'
    // )
    // this shows up in the upper right corner of the embed
    // .setThumbnail(
    //   'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png'
    // )
    .setDescription(
      [
        '🟢  **/join** — Join the lobby with your username and role',
        '🔴  **/leave** — Leave the lobby',
        '🔄  **/rejoin** — Rejoin the lobby',
        '✏️  **/name** — Change your username',
        '🎭  **/role** — Change your role',
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
          return `<@${discordId}>: (${usernames.hots}) \`${roleMap[role]}\``;
        }
        const user = interaction.guild?.members.cache.get(discordId)?.displayName;
        return `@${user}: (${usernames.hots}) \`${roleMap[role]}\``;
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
        } the lobby as \`${roleMap[result.player.role]}\``
      );
    }
    const joinVerb = newUser ? 'joined' : 'rejoined';
    const content =
      (result.alreadyActive === true ? `You are already in` : `You have ${joinVerb}`) +
      ` the lobby as: ${result.player.usernames.hots}, \`${
        roleMap[result.player.role]
      }\`\nUse /leave to leave the lobby, or use the buttons below.`;
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
    role: 'F', // Default role is Flex
    active: false,
    team: undefined,
  });
  await showRoleButtons(modalInteraction, false, true); // Show role buttons to select a role
}

type chatOrButtonOrModal =
  | ChatInputCommandInteraction<CacheType>
  | ButtonInteraction<CacheType>
  | ModalSubmitInteraction<CacheType>;

/**
 * asks the user for their role, and saves it to the database
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns {Promise<void>}
 */
async function showRoleButtons(interaction: chatOrButtonOrModal, followUp = false, setActive = false): Promise<void> {
  const components = [setActive ? rolesActiveRow : rolesRow];
  if (followUp) {
    await interaction.followUp({
      content: 'Please select your new role using the buttons below.',
      components,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({
    content: 'Please select your new role using the buttons below.',
    components,
    flags: MessageFlags.Ephemeral,
  });
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
  await announce(interaction, `<@${interaction.user.id}> (${username}) has joined the lobby as \`${roleMap[role]}\``);
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
      role: 'F', // Default role is Flex
      active: false,
      team: undefined,
    });
    await interaction.reply({
      content: `Your username has been set to: ${username}`,
      flags: MessageFlags.Ephemeral,
    });
    // If player does not exist, we know their name, but not their role
    await showRoleButtons(interaction, true); // Show the role buttons to select a role
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
    .setValue(previousPlayer?.usernames.hots ?? '');

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

/**
 * Handles the role command interaction, changes the users role in the lobby
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 */
export async function handleRoleCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    const player = getPlayerByDiscordId(interaction.user.id); // Get player by Discord ID
    if (!player) {
      await showJoinModal(interaction); // Show the join modal to collect username and role
      // If player is not found, prompt to join
      // await interaction.reply({
      //   content: 'You are not in the lobby. Click the button below to join.',
      //   flags: MessageFlags.Ephemeral,
      //   components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
      // });
      return;
    }
    // Discord does not support adding a text box (input field) directly to a message reply.
    // The only way to collect text input interactively is via a Modal.
    // As an alternative, you can prompt the user to use the /role command or reply in DM.
    await showRoleButtons(interaction); // Show the role buttons to select a role
    return;
  }
  // Handle role command
  const role = interaction.options.getString(CommandIds.ROLE, true);

  const player = setPlayerRole(interaction.user.id, role); // Set player role in the database
  if (player === false) {
    // If player is not found, prompt to join
    await interaction.reply({
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    });
    return;
  }
  await interaction.reply({
    content: `Your role has been set to: ${roleMap[role]}`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Assigns a role to the user based on the button interaction.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param role The role to assign, based on the roleMap keys.
 */
export async function handleAssignRoleCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  role: keyof typeof roleMap,
  setActive = false
) {
  const player = setPlayerRole(interaction.user.id, role); // Set player role in the database

  if (!player) {
    if (setActive) {
      // player does not exist, but we need to set them as active
      const discordData = fetchDiscordNames(interaction);
      savePlayer(interaction.user.id, {
        discordId: interaction.user.id,
        usernames: {
          hots: '',
          ...discordData,
        },
        role,
        active: true,
        team: undefined,
      });
      await handleUserJoined(interaction, interaction.user.username, role, true);
      return;
    }
    await interaction.reply({
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    });
    return;
  }
  await interaction.reply({
    content: `Your role has been set to: ${roleMap[role]}`,
    flags: MessageFlags.Ephemeral,
  });
  if (setActive) {
    if (player.active === false) {
      await handleUserJoined(interaction, player.usernames.hots, role, true); // Announce the user has joined
    }
    setPlayerActive(interaction.user.id, true); // Mark player as active in the database
    return;
  }

  if (player.active === false) {
    // If player is not active, prompt to rejoin
    await interaction.followUp({
      content: 'Click the button below to join the lobby.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    });
    // return;
  }
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
    ? `${hotsName || 'Player'} found in the lobby with role: \`${roleMap[player.role]}\``
    : `${hotsName || 'Player'} not found in the lobby, adding them with default role \`${
        roleMap[CommandIds.ROLE_FLEX]
      }\`.`;
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
      role: 'F', // Default role is Flex
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
  const role = interaction.isChatInputCommand() ? interaction.options.getString(CommandIds.ROLE, true) : pRole ?? 'F';
  const id = member.user.id;
  const player = setPlayerRole(id, role);
  if (!player) {
    interaction.reply({
      content: 'Player not found in the lobby. Please make sure they have joined first.',
      flags: MessageFlags.Ephemeral,
    });
  }
  interaction.reply({
    content: `Set ${member.user.displayName}'s role to \`${roleMap[role]}\``,
    flags: MessageFlags.Ephemeral,
  });
  // return;
}

function getActiveFromInteraction(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pActive?: boolean
): boolean {
  if (interaction.isChatInputCommand()) {
    return interaction.options.getBoolean('active', true);
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
      content: `Set ${member.user.displayName}'s active status to \`${isActive ? 'active' : 'inactive'}\``,
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
        `<@${id}> (${player.usernames.hots}) has joined the lobby as \`${roleMap[player.role]}\``
      );
    } else {
      await announce(interaction, `<@${id}> (${player.usernames.hots}) has left the lobby`);
    }
  } else {
    interaction.reply({
      content: `${player.usernames.hots} is already ${isActive ? 'active' : 'inactive'}.`,
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
function userIsAdmin(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | ModalSubmitInteraction<CacheType>
): boolean {
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
