import dotenv from 'dotenv';

dotenv.config();

process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
});

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
import { botChannelName, CommandIds, norsServerId, roleMap } from './constants';
import {
  handleJoinCommand,
  handleLeaveCommand,
  handleRejoinCommand,
  handleTwitchCommand,
  handlePlayersCommand,
  handleClearCommand,
  handleGuideCommand,
  handleSetTeamsCommand,
  handleSetChannelTeamIdCommand,
  handleSetLobbyChannelCommand,
  handleSetBotChannelCommand,
  handleRenameBotChannelCommand,
  handleMoveToLobbyCommand,
  handleMoveToTeamsCommand,
  handleNewGameCommand,
  handleLookupCommand,
  handleAdminSetRoleCommand,
  handleAdminSetActiveCommand,
  handleAdminShowRoleButtons,
  handleMoveCommand,
  handleEditRoleCommand,
  handleEditRoleButtonCommand,
  handleDeleteMessageCommand,
  handleAddHotsAccountCommand,
  handleAdminAddHotsAccountCommand,
  handleAdminAddHotsAccountButton,
  handleAdminPrimaryCommand,
  handleLookupByDiscordIdCommand,
  handleAdminAddHotsAccountByDiscordIdCommand,
  handleMakeTeamsCommand,
  handleDraftCommand,
  handleDraftAutocomplete,
  handleDraftCaptainCommand,
  handleDraftTeamAssignCommand,
  handleDraftModeCommand,
  handleDraftPickButton,
  handleDraftCoinCallButton,
  handleDraftChoiceButton,
  handleDraftToggleModeButton,
  handleDraftUndoCommand,
  handlePublishTeamsCommand,
  handleSwapTeamsCommand,
  handleImportReplaysCommand,
  handleDeletePlayerCommand,
  handleDeleteHotsAccountCommand,
  handleRefreshLobbyMessage,
  handlePlayersAllCommand,
  updateAdminActiveButtons,
  handleChannelCommand,
  handleAdminDeleteHotsAccountCommand,
  handlePlayerAdjustCommand,
} from './commands';
import { safeReply } from './utils/interaction';
import { getBotChannel } from './utils/channel';
import { setSetting } from './store/settings';
import {
  handleMapVoteCommand,
  handleVoteMapButtonClick,
  handleVoteRemoveButtonClick,
  handleEndMapVoteCommand,
  handleCancelMapVoteCommand,
} from './commands/mapVote';
import { slashCommands } from './commands/definitions';
import { readFileSync } from 'fs';
import { join } from 'path';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// reply to direct messages
client.on('messageCreate', msg => {
  if (msg.channel.type == ChannelType.DM) {
    msg.author.send('You are DMing me now!');
    // return;
  }
});

client.on('guildCreate', async guild => {
  guild.commands.set(slashCommands).catch(err => console.error(`Error setting commands for guild ${guild.name}:`, err));
  let channel = await getBotChannel(guild);
  if (!channel) {
    try {
      channel = await guild.channels.create({
        name: botChannelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: ['ViewChannel', 'SendMessages'],
          },
        ],
      });
      setSetting('bot_channel_id', channel.id, guild.id);
      console.log(`Joined new guild: ${guild.name} (ID: ${guild.id}) - Created bot channel.`);
    } catch (err) {
      console.error(`Could not create channel in guild ${guild.name}:`, err);
    }
  }

  if (channel && 'send' in channel) {
    await channel
      .send(
        `Hello! 👋 This channel (<#${channel.id}>) is configured as the bot channel for **Nor's Customs Bot**. You can rename it anytime with \`/rename_bot_channel\` or select a different channel with \`/set_bot_channel\`.`,
      )
      .catch(err => console.error(`Error sending welcome message in guild ${guild.name}:`, err));
  } else {
    try {
      const owner = await guild.fetchOwner();
      await owner.send(
        `Thanks for adding **Nor's Customs Bot** to **${guild.name}**! 👋\n\nPlease run \`/set_bot_channel #channel\` in your server or create a text channel named \`${botChannelName}\` to complete setup.`,
      );
    } catch (err) {
      console.error(`Could not DM owner of guild ${guild.name}:`, err);
    }
  }
});

client.once('clientReady', async () => {
  // Set bot status/activity
  client.user?.setPresence({
    status: 'online', // 'online' | 'idle' | 'dnd' | 'invisible'
    activities: [
      {
        name: "Nor's Customs",
        type: ActivityType.Watching,
        url: 'https://www.twitch.tv/norator',
        state: 'Heroes of the Storm',
      },
    ],
  });
  // Log all guilds the bot is in and resolve bot channel
  client.guilds.cache.forEach(async guild => {
    guild.commands.set(slashCommands);
    const botChannel = await getBotChannel(guild);
    const channelName = botChannel && 'name' in botChannel ? botChannel.name : 'None/Not Found';
    console.log(`Guild: ${guild.name} (ID: ${guild.id}) - Bot Channel: ${channelName}`);
  });

  // list all commands in Nor's server for debugging
  client.guilds.cache
    .get(norsServerId)
    ?.commands.fetch()
    .then(commands => {
      console.log('--- Commands in Guild ---');
      commands.forEach(command => {
        console.log(`Command: ${command.name}, ID: ${command.id}`);
      });
      // announce the bot's current version
      const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
      console.log(`Bot version: ${packageJson.version}`);
    })
    .catch(error => {
      console.error('Error fetching guild commands:', error);
    });

  console.log(`Bot is ready! Logged in as ${client.user?.tag}`);
  if (client.application?.id) {
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.application.id}&permissions=8&scope=bot%20applications.commands`;
    console.log(`Bot Invite Link (Guild Install):\n${inviteUrl}`);
  }
});

function getCommandName(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
): string | null {
  if (interaction.isButton()) {
    return interaction.customId;
  } else if (interaction.isChatInputCommand()) {
    return interaction.commandName;
  }
  return null;
}

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      if (
        interaction.commandName === CommandIds.DRAFT ||
        interaction.commandName === CommandIds.DRAFT_CAPTAIN ||
        interaction.commandName === CommandIds.DRAFT_TEAM_ASSIGN
      ) {
        await handleDraftAutocomplete(interaction);
        return;
      }
    }

    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    if (interaction.isButton() && interaction.customId.startsWith('mapvote:')) {
      const parts = interaction.customId.split(':');
      const action = parts[1];
      const sessionId = parts[2];
      const mapId = parts[3];

      if (action === 'vote') {
        await handleVoteMapButtonClick(interaction, sessionId, mapId);
        return;
      } else if (action === 'remove') {
        await handleVoteRemoveButtonClick(interaction, sessionId);
        return;
      } else if (action === 'end') {
        await handleEndMapVoteCommand(interaction, sessionId);
        return;
      } else if (action === 'cancel') {
        await handleCancelMapVoteCommand(interaction, sessionId);
        return;
      }
    }

    const commandName = getCommandName(interaction);

    switch (commandName) {
      case CommandIds.NEW_GAME:
        // Handle load players command
        await handleNewGameCommand(interaction);
        break;
      case CommandIds.SET_TEAMS:
        // Handle load teams command
        await handleSetTeamsCommand(interaction);
        break;
      case CommandIds.MAKE_TEAMS:
        // Handle make teams command (MMR auto-balanced teams)
        await handleMakeTeamsCommand(interaction);
        break;
      case CommandIds.DRAFT:
        // Handle draft command (interactive captain draft)
        await handleDraftCommand(interaction);
        break;
      case CommandIds.DRAFT_CAPTAIN:
        // Handle set draft captain command
        await handleDraftCaptainCommand(interaction);
        break;
      case CommandIds.DRAFT_TEAM_ASSIGN:
        // Handle draft team assign command
        await handleDraftTeamAssignCommand(interaction);
        break;
      case CommandIds.DRAFT_MODE:
        // Handle set draft mode command
        await handleDraftModeCommand(interaction);
        break;
      case CommandIds.DRAFT_UNDO:
        // Handle undo draft command
        await handleDraftUndoCommand(interaction);
        break;
      case CommandIds.SWAP_PLAYERS:
        // Handle swap command
        await handleSwapTeamsCommand(interaction);
        break;
      case CommandIds.PUBLISH_TEAMS:
        // Handle publish teams command
        await handlePublishTeamsCommand(interaction);
        break;
      case CommandIds.SET_CHANNEL_TEAM_ID:
        // Handle set channel team ID command
        await handleSetChannelTeamIdCommand(interaction);
        break;
      case CommandIds.SET_LOBBY_CHANNEL:
        // Handle set lobby channel command
        await handleSetLobbyChannelCommand(interaction);
        break;
      case CommandIds.SET_BOT_CHANNEL:
        // Handle set bot channel command
        await handleSetBotChannelCommand(interaction);
        break;
      case CommandIds.RENAME_BOT_CHANNEL:
        // Handle rename bot channel command
        await handleRenameBotChannelCommand(interaction);
        break;
      case CommandIds.MOVE_TO_LOBBY:
        // Handle gather to lobby command
        await handleMoveToLobbyCommand(interaction);
        break;
      case CommandIds.MOVE_TO_TEAMS:
        // Handle move to teams command
        await handleMoveToTeamsCommand(interaction);
        break;
      case CommandIds.HELP:
      case CommandIds.GUIDE:
        // Handle guide command
        await handleGuideCommand(interaction);
        break;
      case CommandIds.JOIN:
        // Handle join command
        await handleJoinCommand(interaction);
        break;
      case CommandIds.REJOIN:
        // Handle rejoin command
        await handleRejoinCommand(interaction);
        break;
      case CommandIds.LEAVE:
        // Handle leave command
        await handleLeaveCommand(interaction);
        break;
      case CommandIds.CLEAR:
        // Handle clear command
        await handleClearCommand(interaction);
        break;
      case CommandIds.PLAYERS:
        // Handle players command
        await handlePlayersCommand(interaction);
        break;
      case CommandIds.PLAYERS_RAW:
        // Handle players raw command
        await handlePlayersCommand(interaction, true); // Pass true to get raw player data
        break;
      case CommandIds.PLAYERS_ALL:
        // Handle players all command
        await handlePlayersAllCommand(interaction); // Pass true to get all player data
        break;
      case CommandIds.ADD_ACCOUNT:
        // Handle add HotS account command
        await handleAddHotsAccountCommand(interaction);
        break;
      case CommandIds.ROLE:
        // Handle role command
        await handleEditRoleCommand(interaction); // Pass true to edit roles
        break;
      case CommandIds.TWITCH:
        // Handle twitch command
        await handleTwitchCommand(interaction);
        break;
      case `${CommandIds.LOOKUP}_${CommandIds.DISCORD_ID}`:
        await handleLookupByDiscordIdCommand(interaction);
        break;
      case CommandIds.LOOKUP:
        // Handle lookup command
        await handleLookupCommand(interaction); // Pass true to perform a lookup
        break;
      case CommandIds.DELETE_PLAYER:
        // Handle delete player command
        await handleDeletePlayerCommand(interaction);
        break;
      case CommandIds.DELETE_HOTS_ACCOUNT:
        // Handle delete HotS account command
        await handleDeleteHotsAccountCommand(interaction);
        break;
      case 'refresh_lobby':
        await handleRefreshLobbyMessage(interaction);
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
        await handleMoveCommand(interaction);
        break;
      case CommandIds.DELETE_MESSAGE:
        // Handle delete message command
        await handleDeleteMessageCommand(interaction);
        break;
      case CommandIds.IMPORT_REPLAYS:
        // Handle import replays command
        await handleImportReplaysCommand(interaction);
        break;
      case CommandIds.CHANNEL_COMMAND:
        if (!interaction.isChatInputCommand()) {
          await safeReply(interaction, {
            content: 'This command can only be used as a slash command.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await handleChannelCommand(interaction);
        break;
      case CommandIds.ADMIN:
        if (!interaction.isChatInputCommand()) {
          await safeReply(interaction, {
            content: 'This command can only be used as a slash command.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await handleAdminSubCommand(interaction);
        break;
      case `${CommandIds.ADMIN}_${CommandIds.ACTIVE}_${CommandIds.REFRESH}`:
        await updateAdminActiveButtons(interaction, false, true);
        break;
      case CommandIds.MAP_VOTE:
        if (!interaction.isChatInputCommand()) {
          await safeReply(interaction, {
            content: 'This command can only be used as a slash command.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await handleMapVoteCommand(interaction);
        break;
      case CommandIds.END_MAP_VOTE:
        await handleEndMapVoteCommand(interaction);
        break;
      case CommandIds.CANCEL_MAP_VOTE:
        await handleCancelMapVoteCommand(interaction);
        break;
      case CommandIds.PLAYER_ADJUST:
        if (!interaction.isChatInputCommand()) {
          await safeReply(interaction, {
            content: 'This command can only be used as a slash command.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await handlePlayerAdjustCommand(interaction);
        break;
      default:
        await handleDefaultCommand(interaction, commandName);
        break;
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
  }
});

async function handleAdminSubCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const subCommand = interaction.options.getSubcommand(true);
  switch (subCommand) {
    case CommandIds.ROLE:
      await handleAdminSetRoleCommand(interaction);
      break;
    case CommandIds.ACTIVE:
      await handleAdminSetActiveCommand(interaction);
      break;
    case `${CommandIds.ADD_ACCOUNT}_${CommandIds.DISCORD_ID}`:
      await handleAdminAddHotsAccountByDiscordIdCommand(interaction);
      break;
    case CommandIds.ADD_ACCOUNT:
      await handleAdminAddHotsAccountCommand(interaction);
      break;
    case CommandIds.DELETE_ACCOUNT:
      await handleAdminDeleteHotsAccountCommand(interaction);
      break;
    case CommandIds.PRIMARY:
      await handleAdminPrimaryCommand(interaction);
      break;
  }
}

async function handleDefaultCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  commandName: string | null = null,
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

  if (parts[0] === CommandIds.VOTE_MAP_BTN && interaction.isButton()) {
    await handleVoteMapButtonClick(interaction, parts[1], parts[2]);
    return;
  }
  if (parts[0] === CommandIds.REMOVE_MAP_VOTE && interaction.isButton()) {
    await handleVoteRemoveButtonClick(interaction, parts[1]);
    return;
  }
  if (parts[0] === CommandIds.END_MAP_VOTE && interaction.isButton()) {
    await handleEndMapVoteCommand(interaction, parts[1]);
    return;
  }

  if (parts.length === 2) {
    switch (parts[0]) {
      case CommandIds.JOIN:
        await handleAdminSetActiveCommand(interaction, parts[1], true);
        return;
      case CommandIds.LEAVE:
        await handleAdminSetActiveCommand(interaction, parts[1], false);
        return;
      case CommandIds.ROLE:
        await handleAdminShowRoleButtons(interaction, parts[1]);
        return;
      case CommandIds.ADD_ACCOUNT:
        await handleAdminAddHotsAccountButton(interaction, parts[1]);
        return;
      case CommandIds.JOIN_WITH_BATTLE_TAG:
        await handleJoinCommand(interaction, parts[1]);
        return;
    }
  }
  if (parts.length === 3 && parts[0] === CommandIds.ROLE_ADMIN) {
    await handleAdminSetRoleCommand(interaction, parts[1], parts[2]);
    return;
  }
  if (parts.length === 2 && isRoleCommandId(parts[0])) {
    await handleEditRoleButtonCommand(interaction, parts[1], parts[0]);
    return;
  }
  if (parts.length === 3 && isRoleCommandId(parts[0])) {
    if (parts[1] === CommandIds.ACTIVE) {
      // Handle role edit button commands with active state
      await handleEditRoleButtonCommand(interaction, parts[2], parts[0], undefined, true);
    } else if (parts[2] in roleMap) {
      // Handle role edit button commands with user ID
      await handleEditRoleButtonCommand(interaction, parts[1], parts[0], parts[2]);
    }
    return;
  }
  if (parts.length === 4 && parts[0].startsWith(CommandIds.PLAYERS_ALL_PAGE)) {
    switch (parts[0]) {
      case CommandIds.PLAYERS_ALL_PAGE:
      case CommandIds.PLAYERS_ALL_PAGE_SORT:
        await handlePlayersAllCommand(
          interaction,
          true,
          parts[1] === 'mmr' ? 'mmr' : 'alphabetical',
          parts[2] === 'true',
          parts[3],
        );
        return;
    }
  }
  if (parts.length === 4 && isAdminSetActiveCommand(interaction, parts[0], parts[1], parts[2], parts[3])) {
    await handleAdminSetActiveCommand(interaction, parts[2], parts[3] === 'true', true);
    return;
  }
  if (parts.length === 5 && isRoleCommandId(parts[0])) {
    // Handle role edit button commands with user ID and active state
    await handleEditRoleButtonCommand(interaction, parts[3], parts[0], parts[4], parts[1] === CommandIds.ACTIVE, parts[2]);
    return;
  }
  if (parts.length === 6 && parts[0] === CommandIds.ADMIN && parts[1] === CommandIds.PRIMARY) {
    await handleAdminPrimaryCommand(interaction, parts[2], parts[3], parts[4], parts[5]);
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith('draft_pick:')) {
    const pickedPlayerId = interaction.customId.split(':')[1];
    await handleDraftPickButton(interaction, pickedPlayerId);
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith('draft_coin:')) {
    const callStr = interaction.customId.split(':')[1];
    const call: 'heads' | 'tails' = callStr === 'heads' ? 'heads' : 'tails';
    await handleDraftCoinCallButton(interaction, call);
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith('draft_choice:')) {
    const choiceStr = interaction.customId.split(':')[1];
    const isFirstPick = choiceStr === 'first';
    await handleDraftChoiceButton(interaction, isFirstPick);
    return;
  }
  if (interaction.isButton() && interaction.customId === 'draft_undo') {
    await handleDraftUndoCommand(interaction);
    return;
  }
  if (interaction.isButton() && interaction.customId === 'draft_toggle_mode') {
    await handleDraftToggleModeButton(interaction);
    return;
  }
  await handleUnknownCommand(interaction, commandName);
}

function isAdminSetActiveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  part0: string,
  part1: string,
  part2: string,
  part3: string,
): boolean {
  return (
    interaction.isButton() &&
    part0 === CommandIds.ADMIN &&
    part1 === CommandIds.ACTIVE &&
    /^\d{17,19}$/.test(part2) &&
    ['true', 'false'].includes(part3.toLowerCase())
  );
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
  commandName: string,
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
  console.log('Bot disconnected');
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for presence update

  client.destroy(); // Disconnects from Discord
  process.exit(0);
};

process.on('SIGINT', shutdown); // Ctrl+C
process.on('SIGTERM', shutdown); // kill command
