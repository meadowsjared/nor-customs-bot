import dotenv from 'dotenv';
dotenv.config();

import {
  Client,
  GatewayIntentBits,
  ActivityType,
  ChannelType,
  PresenceUpdateStatus,
  ChatInputCommandInteraction,
  CacheType,
  ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import { botChannelName, CommandIds, roleMap } from './constants';
import {
  handleJoinCommand,
  handleLeaveCommand,
  handleBattleTagCommand,
  handleRejoinCommand,
  handleTwitchCommand,
  handlePlayersCommand,
  handleClearCommand,
  handleGuideCommand,
  handleLoadTeamsCommand,
  handleSetChannelTeamIdCommand,
  handleSetLobbyChannelCommand,
  handleMoveToLobbyCommand,
  handleMoveToTeamsCommand,
  handleNewGameCommand,
  handleLookupCommand,
  handleAdminSetBattleTagCommand,
  handleAdminSetRoleCommand,
  handleAdminSetActiveCommand,
  handleAdminShowRoleButtons,
  handleAdminShowBattleTagModal,
  handleMoveCommand,
  handleEditRoleCommand,
  handleEditRoleButtonCommand,
  handleDeleteMessageCommand,
  handleAddHotsAccountCommand,
  handleAdminAddHotsAccountCommand,
  safeReply,
} from './commands';
import { slashCommands } from './commands/definitions';
import { handleNameButtonCommand } from './store/player';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
});

// reply to direct messages
client.on('messageCreate', msg => {
  if (msg.channel.type == ChannelType.DM) {
    msg.author.send('You are DMing me now!');
    // return;
  }
});

client.on('guildCreate', async guild => {
  const existing = guild.channels.cache.find(ch => ch.name === botChannelName);
  if (existing) {
    console.log(`Channel ${botChannelName} already exists!`);
    return;
  }
  // Create a new text channel
  await guild.channels.create({
    name: botChannelName,
    type: 0, // GUILD_TEXT
    permissionOverwrites: [
      {
        id: guild.id,
        allow: ['ViewChannel', 'SendMessages'],
      },
    ],
  });
  console.log(`Joined new guild: ${guild.name} (ID: ${guild.id})`);
});

client.once('clientReady', async () => {
  // Register command globally (or use guilds.cache.first().commands for per-guild)
  await client.application?.commands.set(slashCommands);
  console.log('Slash command /join registered!');

  if (client.application) {
    console.log('--- Fetching Command IDs ---');
    try {
      const commands = await client.application.commands.fetch();
      commands.forEach(command => {
        console.log(`Command: ${command.name}, ID: ${command.id}`);
      });
    } catch (error) {
      console.error('Error fetching application commands:', error);
    }
    console.log('--------------------------');
  }

  // Log all guilds the bot is in
  client.guilds.cache.forEach(guild => {
    console.log(`Guild: ${guild.name} (ID: ${guild.id})`);
  });

  // Set bot status/activity
  client.user?.setPresence({
    status: 'online', // 'online' | 'idle' | 'dnd' | 'invisible'
    activities: [
      {
        name: 'Nor Customs',
        type: ActivityType.Watching,
        url: 'https://www.twitch.tv/norator',
        state: 'Heroes of the Storm',
      },
    ],
  });
  console.log(`Bot is ready! Logged in as ${client.user?.tag}`);
});

function getCommandName(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
): string | null {
  if (interaction.isButton()) {
    return interaction.customId;
  } else if (interaction.isChatInputCommand()) {
    return interaction.commandName;
  }
  return null;
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;
  const commandName = getCommandName(interaction);

  switch (commandName) {
    case CommandIds.NEW_GAME:
      // Handle load players command
      handleNewGameCommand(interaction);
      break;
    case CommandIds.SET_TEAMS:
      // Handle load teams command
      handleLoadTeamsCommand(interaction);
      break;
    case CommandIds.SET_CHANNEL_TEAM_ID:
      // Handle set channel team ID command
      handleSetChannelTeamIdCommand(interaction);
      break;
    case CommandIds.SET_LOBBY_CHANNEL:
      // Handle set lobby channel command
      handleSetLobbyChannelCommand(interaction);
      break;
    case CommandIds.MOVE_TO_LOBBY:
      // Handle gather to lobby command
      handleMoveToLobbyCommand(interaction);
      break;
    case CommandIds.MOVE_TO_TEAMS:
      // Handle move to teams command
      handleMoveToTeamsCommand(interaction);
      break;
    case CommandIds.GUIDE:
      // Handle guide command
      handleGuideCommand(interaction);
      break;
    case CommandIds.JOIN:
      // Handle join command
      handleJoinCommand(interaction);
      break;
    case CommandIds.REJOIN:
      // Handle rejoin command
      handleRejoinCommand(interaction);
      break;
    case CommandIds.LEAVE:
      // Handle leave command
      handleLeaveCommand(interaction);
      break;
    case CommandIds.CLEAR:
      // Handle clear command
      handleClearCommand(interaction);
      break;
    case CommandIds.PLAYERS:
      // Handle players command
      handlePlayersCommand(interaction);
      break;
    case CommandIds.PLAYERS_RAW:
      // Handle players raw command
      handlePlayersCommand(interaction, true); // Pass true to get raw player data
      break;
    case CommandIds.BATTLE_TAG:
      // Handle battle tag command
      handleBattleTagCommand(interaction);
      break;
    case CommandIds.ADD_ACCOUNT:
      if (!interaction.isChatInputCommand()) {
        await safeReply(interaction, {
          content: 'This command can only be used as a slash command.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      // Handle add HotS account command
      handleAddHotsAccountCommand(interaction);
      break;
    case CommandIds.ROLE:
    case CommandIds.EDIT_ROLES:
      // Handle edit roles command
      handleEditRoleCommand(interaction); // Pass true to edit roles
      break;
    case CommandIds.TWITCH:
      // Handle twitch command
      handleTwitchCommand(interaction);
      break;
    case CommandIds.LOOKUP:
      // Handle lookup command
      handleLookupCommand(interaction); // Pass true to perform a lookup
      break;
    case CommandIds.MOVE:
      // Handle move command
      if (!interaction.isChatInputCommand()) {
        await safeReply(interaction, {
          content: 'This command can only be used as a slash command.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      handleMoveCommand(interaction);
      break;
    case CommandIds.DELETE_MESSAGE:
      // Handle delete message command
      handleDeleteMessageCommand(interaction);
      break;
    case CommandIds.ADMIN:
      if (!interaction.isChatInputCommand()) {
        await safeReply(interaction, {
          content: 'This command can only be used as a slash command.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      handleAdminSubCommand(interaction);
      break;
    default:
      await handleDefaultCommand(interaction, commandName);
      break;
  }
});

function handleAdminSubCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const subCommand = interaction.options.getSubcommand(true);
  switch (subCommand) {
    case CommandIds.BATTLE_TAG:
      handleAdminSetBattleTagCommand(interaction);
      break;
    case CommandIds.ROLE:
      handleAdminSetRoleCommand(interaction);
      break;
    case CommandIds.ACTIVE:
      handleAdminSetActiveCommand(interaction);
      break;
    case CommandIds.ADD_ACCOUNT:
      handleAdminAddHotsAccountCommand(interaction);
      break;
  }
}

async function handleDefaultCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  commandName: string | null = null
) {
  // if the interaction is not a button, reply with an error
  if (!commandName?.includes('_') || interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'Unknown command. Please use a valid command. ' + (commandName ?? ''),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const parts = commandName.split('_');
  if (parts.length === 2) {
    switch (parts[0]) {
      case CommandIds.JOIN:
        handleAdminSetActiveCommand(interaction, parts[1], true);
        return;
      case CommandIds.LEAVE:
        handleAdminSetActiveCommand(interaction, parts[1], false);
        return;
      case CommandIds.ROLE:
        handleAdminShowRoleButtons(interaction, parts[1]);
        return;
      case CommandIds.BATTLE_TAG:
        handleAdminShowBattleTagModal(interaction, parts[1]);
        return;
    }
  }
  if (parts.length === 3 && parts[0] === CommandIds.ROLE_ADMIN) {
    handleAdminSetRoleCommand(interaction, parts[1], parts[2]);
    return;
  }
  if (parts.length === 2 && isRoleCommandId(parts[0])) {
    handleEditRoleButtonCommand(interaction, parts[1], parts[0]);
    return;
  }
  if (parts.length === 3 && isRoleCommandId(parts[0])) {
    if (parts[1] === CommandIds.ACTIVE) {
      // Handle role edit button commands with active state
      handleEditRoleButtonCommand(interaction, parts[2], parts[0], undefined, true);
    } else if (parts[2] in roleMap) {
      // Handle role edit button commands with user ID
      console.log('Handling role edit button command with parts 3:', parts);
      handleEditRoleButtonCommand(interaction, parts[1], parts[0], parts[2]);
    }
    return;
  }
  if (parts.length === 4 && isRoleCommandId(parts[0])) {
    // Handle role edit button commands with user ID and active state
    console.log('Handling role edit button command with parts 4:', parts);
    handleEditRoleButtonCommand(interaction, parts[2], parts[0], parts[3], parts[1] === CommandIds.ACTIVE);
    return;
  }
  if (parts.length === 4 && parts[0] === CommandIds.RENAME_HOTS_ACCOUNT) {
    handleNameButtonCommand(interaction, parts[1], parts[2]);
    return;
  }
  await handleUnknownCommand(interaction, commandName);
}

function isRoleCommandId(commandName: string): commandName is CommandIds {
  const commandAr = Object.values<string>([
    CommandIds.ROLE_EDIT_ADD,
    CommandIds.ROLE_EDIT_REPLACE,
    CommandIds.ROLE_EDIT_REMOVE,
  ]);
  return commandAr.includes(commandName);
}

async function handleUnknownCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  commandName: string
) {
  await safeReply(interaction, {
    content: `Unknown command: ${commandName}. Please use a valid command.`,
    flags: MessageFlags.Ephemeral,
  });
  // if debugging is enabled, log the invalid command
  if (process.env.DEBUG === 'true') {
    console.log('invalid command:', commandName);
  }
}

client.login(process.env.DISCORD_TOKEN);

// Graceful shutdown handler
const shutdown = async () => {
  console.log('Shutting down bot...');
  client.user?.setPresence({
    status: PresenceUpdateStatus.Invisible,
    activities: [
      { name: 'Shutting down...', type: 0 }, // type 0 = Playing
    ], // type 0 = Playing
  });
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for presence update
  console.log('Bot disconnected');

  client.destroy(); // Disconnects from Discord
  process.exit(0);
};

process.on('SIGINT', shutdown); // Ctrl+C
process.on('SIGTERM', shutdown); // kill command
