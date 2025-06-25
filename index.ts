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
} from 'discord.js';
import { botChannelName, CommandIds, roleMap } from './constants';
import {
  handleAssignRoleCommand,
  handleJoinCommand,
  handleLeaveCommand,
  handleNameCommand,
  handleRejoinCommand,
  handleRoleCommand,
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
  handleAdminSetNameCommand,
  handleAdminSetRoleCommand,
  handleAdminSetActiveCommand,
} from './commands';
import { slashCommands } from './commands/definitions';

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

client.once('ready', async () => {
  // Register command globally (or use guilds.cache.first().commands for per-guild)
  await client.application?.commands.set(slashCommands);
  console.log('Slash command /join registered!');

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
    case CommandIds.NAME:
      // Handle name command
      handleNameCommand(interaction);
      break;
    case CommandIds.ROLE:
      // Handle role command
      handleRoleCommand(interaction);
      break;
    case CommandIds.TWITCH:
      // Handle twitch command
      handleTwitchCommand(interaction);
      break;
    case CommandIds.LOOKUP:
      // Handle lookup command
      handleLookupCommand(interaction); // Pass true to perform a lookup
      break;
    case CommandIds.ADMIN:
      {
        if (!interaction.isChatInputCommand()) {
          interaction.reply({
            content: 'This command can only be used as a slash command.',
            ephemeral: true,
          });
          return;
        }
        const subCommand = interaction.options.getSubcommand(true);
        switch (subCommand) {
          case CommandIds.NAME:
            handleAdminSetNameCommand(interaction);
            break;
          case CommandIds.ROLE:
            handleAdminSetRoleCommand(interaction);
            break;
          case CommandIds.ACTIVE:
            handleAdminSetActiveCommand(interaction);
            break;
        }
      }
      break;
    default:
      if (commandName && Object.keys(roleMap).includes(commandName.slice(0, 1))) {
        handleAssignRoleCommand(interaction, commandName.slice(0, 1), commandName.endsWith('_active'));
      }
      return; // Ignore unknown commands
  }
});

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
