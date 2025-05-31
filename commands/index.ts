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
} from 'discord.js';
import { botChannelName, leaveBtn, nameBtn, rejoinBtn, roleBtn, roleMap, rolesRow } from '../constants';
import { announce } from '../utils/announce';
import { players, savePlayerData } from '../store/player';

// TODO: implement this command
export async function handleLoadTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  // This command is not implemented yet
  await interaction.reply({
    content: 'This command is not implemented yet.',
    flags: MessageFlags.Ephemeral,
  });
}

// TODO: implement this command
export async function handleSetChannelTeamIdCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  // This command is not implemented yet
  await interaction.reply({
    content: 'This command is not implemented yet.',
    flags: MessageFlags.Ephemeral,
  });
}

// TODO: implement this command
export async function handleGatherToLobbyCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  // This command is not implemented yet
  await interaction.reply({
    content: 'This command is not implemented yet.',
    flags: MessageFlags.Ephemeral,
  });
}

// TODO: implement this command
export async function handleMoveToTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  // This command is not implemented yet
  await interaction.reply({
    content: 'This command is not implemented yet.',
    flags: MessageFlags.Ephemeral,
  });
}

// TODO: implement this command
export async function handleSetLobbyChannelCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  // This command is not implemented yet
  await interaction.reply({
    content: 'This command is not implemented yet.',
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
async function handlePlayersCommand(interaction: Interaction<CacheType>, onlyRaw: boolean = false) {
  // check if interaction can be replied to
  if (!interaction.isChatInputCommand() && !interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }

  const playerList =
    Array.from(players.entries())
      .filter(([_, player]) => player.active)
      .map(([id, { usernames, role }]) => `<@${id}>: (${usernames.hots}) \`${roleMap[role]}\``)
      .join('\n') || 'No players in the lobby';
  const rawPlayerList = Array.from(players.entries())
    .filter(([_, player]) => player.active)
    .map(([_, { usernames, role }]) => `${usernames.hots} ${role}`);
  await interaction.reply({
    content: `Players in the lobby:\n${playerList}`,
    flags: onlyRaw ? MessageFlags.Ephemeral : undefined,
  });
  if (rawPlayerList.length > 0) {
    // show a public message in the channel, if there are players in the lobby
    const channel = interaction.guild?.channels.cache.find(ch => ch.name === botChannelName);
    if (channel && channel.isTextBased()) {
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
  const player = players.get(interaction.user.id);
  if (player) {
    player.active = false; // Mark player as inactive
    await savePlayerData(players); // Save player data to file
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
  // go through the list of players and mark them all as inactive
  players.forEach(player => {
    player.active = false; // Mark them as inactive
  });
  await savePlayerData(players); // Save player data to file
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
  const previousPlayer = players.get(interaction.user.id);
  if (previousPlayer) {
    if (previousPlayer.active) {
      await interaction.reply({
        content: `You are already in the lobby as: ${previousPlayer.usernames.hots}, \`${
          roleMap[previousPlayer.role]
        }\`\nUse /leave to leave the lobby`,
        flags: MessageFlags.Ephemeral,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, nameBtn, roleBtn)],
      });
      return;
    }
    // announce in the channel who has rejoined
    await announce(
      interaction,
      `<@${interaction.user.id}> (${previousPlayer.usernames.hots}) has rejoined the lobby as \`${
        roleMap[previousPlayer.role]
      }\``
    );
    previousPlayer.active = true; // Mark player as active
    await savePlayerData(players); // Save player data to file
    await interaction.reply({
      content: `You have rejoined the lobby as: ${previousPlayer.usernames.hots}, \`${
        roleMap[previousPlayer.role]
      }\`\nUse /leave to leave the lobby`,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, nameBtn, roleBtn)],
    });
  } else {
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
  players.set(interaction.user.id, {
    usernames: { hots: username, discord: interaction.user.username },
    role,
    active: true,
  });
  await savePlayerData(players); // Save player data to file
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
    const previousPlayer = players.get(interaction.user.id);

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
          const player = players.get(modalInteraction.user.id);
          if (player) {
            player.usernames.hots = username;
            await modalInteraction.reply({
              content: `Your username has been updated to: ${username}`,
              flags: MessageFlags.Ephemeral,
            });
          } else {
            players.set(modalInteraction.user.id, {
              usernames: { hots: username, discord: modalInteraction.user.username },
              role: 'F',
              active: false,
            });
            await modalInteraction.reply({
              content: 'You are not in the lobby. Use /join to join the lobby.',
              flags: MessageFlags.Ephemeral,
            });
          }
          await savePlayerData(players); // Save player data to file
        })
        .catch(reason => {
          console.log('reason:', reason);
          interaction.followUp({
            content: 'You did not enter a username in time.',
            flags: MessageFlags.Ephemeral,
          });
        });
    });
    return;
  }
  const username = interaction.options.getString('username', false);
  const player = players.get(interaction.user.id);
  if (player && username) {
    player.usernames.hots = username;
    await savePlayerData(players); // Save player data to file
    await interaction.reply({
      content: `Your username has been updated to: ${username}`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    if (!username) {
      await interaction.reply({
        content: 'Please provide a username.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    players.set(interaction.user.id, {
      usernames: { hots: username, discord: interaction.user.username },
      role: 'F',
      active: false,
    });
    await savePlayerData(players); // Save player data to file
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
  const role = interaction.options.getString('role', false);
  const player = players.get(interaction.user.id);
  if (player && role) {
    player.role = role;
    await savePlayerData(players); // Save player data to file
    await interaction.reply({
      content: `Your role has been updated to: ${roleMap[role]}`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await interaction.reply({
      content: 'You are not in the lobby. Use /join to join first.',
      flags: MessageFlags.Ephemeral,
    });
  }
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
  const player = players.get(interaction.user.id);
  if (!player) {
    await interaction.reply({
      content: 'You are not in the lobby. Use /join to join first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  player.role = role;
  await savePlayerData(players); // Save player data to file
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
