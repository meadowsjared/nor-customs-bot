import dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits, ActivityType, ChannelType, PresenceUpdateStatus } from 'discord.js';
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
  handleGatherToLobbyCommand,
  handleMoveToTeamsCommand,
} from './commands';
import { slashCommands } from './commands/definitions';
import { players, loadPlayerData } from './store/player';
import { loadChannels } from './store/channels';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
});

// reply to direct messages
client.on('messageCreate', msg => {
  if (msg.channel.type == ChannelType.DM) {
    msg.author.send('You are DMing me now!');
    return;
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
  const previousPlayers = await loadPlayerData();
  // transfer previous loaded players to the in-memory store
  previousPlayers.forEach((player, username) => {
    players.set(username, player);
  });
  await loadChannels();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;
  const commandName = interaction.isButton()
    ? interaction.customId
    : interaction.isChatInputCommand()
    ? interaction.commandName
    : null;

  switch (commandName) {
    case CommandIds.LOAD_TEAMS:
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
    case CommandIds.GATHER_TO_LOBBY:
      // Handle gather to lobby command
      handleGatherToLobbyCommand(interaction);
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
      if (!interaction.isChatInputCommand()) {
        console.error('Interaction is not a chat input command');
        return;
      }
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
    default:
      if (commandName && Object.keys(roleMap).includes(commandName)) {
        handleAssignRoleCommand(interaction, commandName);
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
