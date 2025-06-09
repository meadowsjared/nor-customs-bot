import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  CacheType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Interaction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  VoiceChannel,
} from 'discord.js';
import { botChannelName, imPlayingBtn, leaveBtn, nameBtn, rejoinBtn, roleBtn, roleMap, rolesRow } from '../constants';
import { announce } from '../utils/announce';
import {
  getActivePlayers,
  getPlayerByDiscordId,
  markAllPlayersInactive,
  markPlayerActive,
  markPlayerInactive,
  savePlayer,
  setPlayerRole,
} from '../store/player';
import { saveChannel, getChannels } from '../store/channels';
import { Player } from '../types/player';

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

//TODO I still need this to store the teams in a way
//TODO so that when handleMoveToTeamsCommand is ran, it uses this data to move players to the correct voice channels
/**
 * Handles the /load_teams command interaction, which loads teams from a JSON string provided in the command options.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 * note: If the interaction is not a command or button interaction, it logs an error and returns.
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
  console.log(teamsData, 'teamsData');
  const activePlayers = Array.from(getActivePlayers());
  const message = activePlayers
    .map(([id, player]) => {
      const hotsName = player.usernames.hots;
      // Compare lowercased names for case-insensitive matching
      if (teamsData.team1.some(name => name.toLowerCase() === hotsName.toLowerCase())) {
        return `${hotsName} (Team 1) ${player.usernames.discord}`;
      } else if (teamsData.team2.some(name => name.toLowerCase() === hotsName.toLowerCase())) {
        return `${hotsName} (Team 2) ${player.usernames.discord}`;
      }
      return `${hotsName} (Unassigned) ${player.usernames.discord}`;
    })
    .join('\n');

  // This command is not implemented yet
  await interaction.reply({
    content: `Here are the teams: \n${message}`,
    flags: MessageFlags.Ephemeral,
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
async function handlePlayersCommand(
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
    Array.from(players.entries())
      .filter(([_, player]) => player.active)
      .map(([id, { usernames, role }]) => {
        if (pingLobby) {
          // if pingLobby is true, mention the user
          return `<@${id}>: (${usernames.hots}) \`${roleMap[role]}\``;
        }
        const user = interaction.guild?.members.cache.get(id)?.displayName;
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
async function handleLeaveCommand(interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>) {
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
async function handleRejoinCommand(interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>) {
  const result = markPlayerActive(interaction.user.id); // Mark player as active in the database
  if (result.alreadyActive === true && result.player) {
    await interaction.reply({
      content: `You are already in the lobby as: ${result.player.usernames.hots}, \`${
        roleMap[result.player.role]
      }\`\nUse /leave to leave the lobby`,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, nameBtn, roleBtn)],
    });
    return;
  }
  if (result.alreadyActive === false && result.player) {
    // announce in the channel who has rejoined
    await announce(
      interaction,
      `<@${interaction.user.id}> (${result.player.usernames.hots}) has rejoined the lobby as \`${
        roleMap[result.player.role]
      }\``
    );
    await interaction.reply({
      content: `You have rejoined the lobby as: ${result.player.usernames.hots}, \`${
        roleMap[result.player.role]
      }\`\nUse /leave to leave the lobby`,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, nameBtn, roleBtn)],
    });
    return;
  }
  if (result.player === undefined) {
    await interaction.reply({
      content: 'You are not in the lobby. Use /join to join first.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, nameBtn, roleBtn)],
    });
  }
}

/**
 * Handles the join command interaction, adds the user to the lobby with their username and role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 */
async function handleJoinCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const username = interaction.options.getString('username', true);
  const role = interaction.options.getString('role', true);
  const newPlayer: Player = {
    usernames: { hots: username, discord: interaction.user.username },
    role,
    active: true,
  };
  savePlayer(interaction.user.id, newPlayer); // Save player data to the database
  // announce in the channel who has joined
  await announce(interaction, `<@${interaction.user.id}> (${username}) has joined the lobby as \`${roleMap[role]}\``);
  await interaction.reply({
    // content: `Use \`/leave\` to leave the lobby`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, nameBtn, roleBtn)],
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handles the name command interaction, changes the users username in the lobby
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 */
async function handleNameCommand(interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>) {
  if (interaction.isButton()) {
    const previousPlayer = getPlayerByDiscordId(interaction.user.id);

    // create a modal with a text field to collect the username
    const usernameInput = new TextInputBuilder()
      .setCustomId('usernameInput')
      .setLabel('Enter your Heroes of the Storm username')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('Your Heroes of the Storm username')
      .setValue(previousPlayer ? previousPlayer.usernames.hots : '');

    // Add the input to an action row
    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput);

    // Create the modal
    const modal = new ModalBuilder().setCustomId('nameModal').setTitle('Set Your Username').addComponents(actionRow);
    // get the username from the TextInputBuilder
    await interaction.showModal(modal).then(() => {
      interaction
        .awaitModalSubmit({ filter: i => i.customId === 'nameModal', time: 5 * 60 * 1000 }) // 5 minutes timeout
        .then(async modalInteraction => {
          const username = modalInteraction.fields.getTextInputValue('usernameInput');
          const player = getPlayerByDiscordId(modalInteraction.user.id);
          if (player) {
            player.usernames.hots = username;
            await modalInteraction.reply({
              content: `Your username has been updated to: ${username}`,
              flags: MessageFlags.Ephemeral,
            });
          } else {
            savePlayer(modalInteraction.user.id, {
              usernames: { hots: username, discord: modalInteraction.user.username },
              role: 'F',
              active: false,
            });
            await modalInteraction.reply({
              content: 'You are not in the lobby. Use /join to join the lobby.',
              flags: MessageFlags.Ephemeral,
            });
          }
        })
        .catch(reason => {
          if (reason.code === 'InteractionCollectorError') {
            // User did not respond in time
            // so do nothing
          } else {
            console.error('message: ', reason.message);
            console.log('reason:', reason);
            interaction.followUp({
              content: 'An error occurred while processing your request. Please try again later.',
              flags: MessageFlags.Ephemeral,
            });
          }
        });
    });
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
      content: `Your username has been updated to: ${username}`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    // If player does not exist or username is not provided
    if (!username) {
      // If username is not provided, prompt the user to provide it
      await interaction.reply({
        content: 'Please provide a username.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // therefore the player does not exist, but we have a username
    const newPlayer = {
      usernames: { hots: username, discord: interaction.user.username },
      discordId: interaction.user.id,
      role: 'F', // Default role is Flex
      active: false, // Player is not active until they join
    };
    savePlayer(interaction.user.id, newPlayer); // Save player data to the database
    await interaction.reply({
      content: 'You are not in the lobby. Use `/join` to join the lobby.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Handles the role command interaction, changes the users role in the lobby
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 */
async function handleRoleCommand(interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>) {
  if (interaction.isButton()) {
    // Discord does not support adding a text box (input field) directly to a message reply.
    // The only way to collect text input interactively is via a Modal.
    // As an alternative, you can prompt the user to use the /role command or reply in DM.
    await interaction.reply({
      content: 'Please select your new role using the buttons below.',
      components: [rolesRow],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // Handle role command
  const role = interaction.options.getString('role', true);

  const player = setPlayerRole(interaction.user.id, role); // Set player role in the database
  if (player === false) {
    // If player is not found, prompt to join
    await interaction.reply({
      content: 'You are not in the lobby. Use /join to join first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({
    content: `Your role has been updated to: ${roleMap[role]}`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Assigns a role to the user based on the button interaction.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param role The role to assign, based on the roleMap keys.
 */
async function handleAssignRoleCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  role: keyof typeof roleMap
) {
  const player = setPlayerRole(interaction.user.id, role); // Set player role in the database
  if (!player) {
    await interaction.reply({
      content: 'You are not in the lobby. Use /join to join first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({
    content: `Your role has been updated to: ${roleMap[role]}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTwitchCommand(interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>) {
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

export {
  handlePlayersCommand,
  handleLeaveCommand,
  handleRejoinCommand,
  handleJoinCommand,
  handleNameCommand,
  handleRoleCommand,
  handleAssignRoleCommand,
  handleTwitchCommand,
};
