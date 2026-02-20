import {
  ApplicationCommandDataResolvable,
  ApplicationCommandOptionType,
  ChannelType,
  PermissionsBitField,
} from 'discord.js';
import { CommandIds, roleMap } from '../constants';

const minimumAdminPermissions: bigint = PermissionsBitField.Flags.MoveMembers;
/**
 * define the commands for the bot
 * these will be registered as slash commands
 */
export const slashCommands: ApplicationCommandDataResolvable[] = [
  {
    name: CommandIds.JOIN,
    description: 'Join with your hots battle tag and role',
    options: [
      {
        name: CommandIds.BATTLE_TAG,
        type: ApplicationCommandOptionType.String,
        description: 'Your hots battle tag (e.g. Name#1234)',
        required: true,
      },
      {
        name: CommandIds.ROLE,
        type: ApplicationCommandOptionType.String,
        description: 'Your role in the game',
        required: true,
        choices: Object.entries(roleMap).map(([key, label]) => ({
          name: label,
          value: key,
        })),
      },
    ],
  },
  {
    name: CommandIds.LEAVE,
    description: 'Leave the lobby',
  },
  {
    name: CommandIds.BATTLE_TAG,
    description: 'Set your hots battle tag',
    options: [
      {
        name: CommandIds.BATTLE_TAG,
        type: ApplicationCommandOptionType.String,
        description: 'Your hots battle tag (e.g. Name#1234)',
        required: true,
      },
    ],
  },
  {
    name: CommandIds.ADD_ACCOUNT,
    description: 'Add a Heroes of the Storm account to your profile',
    options: [
      {
        name: CommandIds.BATTLE_TAG,
        type: ApplicationCommandOptionType.String,
        description: 'The Heroes of the Storm battle tag to add',
      },
    ],
  },
  {
    name: CommandIds.ROLE,
    description: 'Set your role',
  },
  {
    name: CommandIds.DELETE_MESSAGE,
    description: 'Delete a message by ID',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'message_id',
        type: ApplicationCommandOptionType.String,
        description: 'The ID of the message to delete',
        required: true,
      },
    ],
  },
  {
    name: CommandIds.NEW_GAME,
    description: 'Start a new game',
    defaultMemberPermissions: minimumAdminPermissions,
  },
  {
    name: CommandIds.SET_TEAMS,
    description: 'Load teams data',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'teams_data',
        type: ApplicationCommandOptionType.String,
        description: 'The team data from the spreadsheet',
        required: true,
      },
    ],
  },
  {
    name: CommandIds.DRAFT,
    description: 'Draft players into teams',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'publish',
        type: ApplicationCommandOptionType.Boolean,
        description: 'Whether to instantly publish the draft',
        required: false,
      },
    ],
  },
  {
    name: CommandIds.SWAP_PLAYERS,
    description: 'Swap two players between teams',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'player-a',
        type: ApplicationCommandOptionType.Integer,
        description: 'The first player to swap',
        required: true,
      },
      {
        name: 'player-b',
        type: ApplicationCommandOptionType.Integer,
        description: 'The second player to swap',
        required: true,
      },
    ],
  },
  {
    name: CommandIds.PUBLISH_TEAMS,
    description: 'Post the teams to the channel',
    defaultMemberPermissions: minimumAdminPermissions,
  },
  {
    name: CommandIds.SET_CHANNEL_TEAM_ID,
    description: 'Set the channel team ID',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'team_number',
        type: ApplicationCommandOptionType.String,
        description: 'The team number to set the channel for',
        required: true,
        choices: [
          { name: 'Team 1', value: 'team1' },
          { name: 'Filthy Team 2', value: 'team2' },
        ],
      },
      {
        name: 'channel_id',
        type: ApplicationCommandOptionType.Channel,
        description: 'The channel ID to set as the lobby channel',
        required: true,
        channelTypes: [ChannelType.GuildVoice],
      },
    ],
  },
  {
    name: CommandIds.SET_LOBBY_CHANNEL,
    description: 'Set the lobby channel',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'channel_id',
        type: ApplicationCommandOptionType.Channel,
        description: 'The channel ID to set as the lobby channel',
        required: true,
        channelTypes: [ChannelType.GuildVoice],
      },
    ],
  },
  {
    name: CommandIds.MOVE_TO_TEAMS,
    description: 'Move players to teams',
    defaultMemberPermissions: minimumAdminPermissions,
  },
  {
    name: CommandIds.MOVE_TO_LOBBY,
    description: 'Gather players to the lobby',
    defaultMemberPermissions: minimumAdminPermissions,
  },
  {
    name: CommandIds.GUIDE,
    description: 'Show the guide for how to play',
  },
  {
    name: CommandIds.HELP,
    description: 'Show the help for how to play',
  },
  {
    name: CommandIds.REJOIN,
    description: 'Rejoin the lobby with your previous battle tag and role',
  },
  {
    name: CommandIds.CLEAR,
    description: 'Clear the lobby and remove all players',
    defaultMemberPermissions: minimumAdminPermissions,
  },
  {
    name: CommandIds.PLAYERS,
    description: 'List all players in the lobby',
  },
  {
    name: CommandIds.PLAYERS_RAW,
    description: 'List all players in the lobby with raw data',
    defaultMemberPermissions: minimumAdminPermissions,
  },
  {
    name: CommandIds.PLAYERS_ALL,
    description: 'List all players in the database with their battle tags and roles',
    defaultMemberPermissions: minimumAdminPermissions,
  },
  {
    name: CommandIds.TWITCH,
    description: "Show Norator's Twitch channel",
  },
  {
    name: CommandIds.LOOKUP,
    description: "Import a player's Discord information",
    options: [
      {
        name: CommandIds.DISCORD_ID,
        type: ApplicationCommandOptionType.User,
        description: 'The Discord ID of the player to lookup',
        required: true,
      },
      {
        name: CommandIds.BATTLE_TAG,
        type: ApplicationCommandOptionType.String,
        description: 'The Heroes of the Storm battle tag of the player (including the # and number)',
        required: false,
      },
    ],
  },
  {
    name: `${CommandIds.LOOKUP}_${CommandIds.DISCORD_ID}`,
    description: "Import a player's Discord information",
    options: [
      {
        name: CommandIds.DISCORD_ID,
        type: ApplicationCommandOptionType.String,
        description: 'The Discord ID of the player to lookup',
        required: true,
      },
      {
        name: CommandIds.BATTLE_TAG,
        type: ApplicationCommandOptionType.String,
        description: 'The Heroes of the Storm battle tag of the player (including the # and number)',
        required: true,
      },
      {
        name: CommandIds.DISCORD_DISPLAY_NAME,
        type: ApplicationCommandOptionType.String,
        description: 'The Discord display name of the player (e.g. Name#1234)',
        required: true,
      },
      {
        name: CommandIds.DISCORD_NAME,
        type: ApplicationCommandOptionType.String,
        description: 'The Discord username of the player (e.g. Name)',
        required: true,
      },
    ],
  },
  {
    name: CommandIds.DELETE_PLAYER,
    description: "Delete a player's information",
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: CommandIds.DISCORD_ID,
        type: ApplicationCommandOptionType.User,
        description: 'The user to delete.',
        required: true,
      },
    ],
  },
  {
    name: CommandIds.DELETE_HOTS_ACCOUNT,
    description: "Delete a player's Heroes of the Storm account",
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: CommandIds.BATTLE_TAG,
        type: ApplicationCommandOptionType.String,
        description: 'The battle tag of the account to delete (including the # and number).',
        required: true,
      },
    ],
  },
  {
    name: 'refresh_lobby',
    description: 'Refresh the lobby announcement message',
    defaultMemberPermissions: minimumAdminPermissions,
  },
  {
    name: CommandIds.ADMIN,
    description: 'Admin commands to manage players.',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: CommandIds.BATTLE_TAG,
        description: "Change a player's hots battle tag.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.DISCORD_ID,
            description: 'The user to modify.',
            type: ApplicationCommandOptionType.User,
            required: true,
          },
          {
            name: CommandIds.BATTLE_TAG,
            description: "The player's new hots battle tag.",
            type: ApplicationCommandOptionType.String,
            required: true,
          },
        ],
      },
      {
        name: CommandIds.ROLE,
        description: "Change a player's role.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.DISCORD_ID,
            description: 'The user to modify.',
            type: ApplicationCommandOptionType.User,
            required: true,
          },
          {
            name: CommandIds.ROLE,
            description: "The player's new role.",
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: Object.entries(roleMap).map(([key, label]) => ({
              name: label,
              value: key,
            })),
          },
        ],
      },
      {
        name: CommandIds.ACTIVE,
        description: 'Change if a player is active.',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.DISCORD_ID,
            description: 'The user to modify.',
            type: ApplicationCommandOptionType.User,
            required: true,
          },
          {
            name: CommandIds.ACTIVE,
            description: 'Set the player as active (true) or inactive (false).',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
          },
        ],
      },
      {
        name: `${CommandIds.ADD_ACCOUNT}_${CommandIds.DISCORD_ID}`,
        description: "Add a Heroes of the Storm account to a player's profile.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.DISCORD_ID,
            description: 'The user to modify.',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: CommandIds.BATTLE_TAG,
            description: 'The Heroes of the Storm battle tag to add (including the # and number)',
            type: ApplicationCommandOptionType.String,
          },
        ],
      },
      {
        name: CommandIds.ADD_ACCOUNT,
        description: "Add a Heroes of the Storm account to a player's profile.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.DISCORD_ID,
            description: 'The user to modify.',
            type: ApplicationCommandOptionType.User,
            required: true,
          },
          {
            name: CommandIds.BATTLE_TAG,
            description: 'The Heroes of the Storm battle tag to add (including the # and number)',
            type: ApplicationCommandOptionType.String,
          },
        ],
      },
      {
        name: CommandIds.PRIMARY,
        description: "Set a player's primary Heroes of the Storm account.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.DISCORD_ID,
            description: 'The user to modify.',
            type: ApplicationCommandOptionType.User,
            required: true,
          },
          {
            name: CommandIds.BATTLE_TAG,
            description: "The player's Heroes of the Storm battle tag to set as primary (including the # and number).",
            type: ApplicationCommandOptionType.String,
            required: false,
          },
        ],
      },
    ],
  },
  {
    name: CommandIds.MOVE,
    description: 'Move player',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: CommandIds.DISCORD_ID,
        description: 'The user to move.',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'channel',
        description: 'The channel to move the user to.',
        type: ApplicationCommandOptionType.Channel,
        required: true,
        channelTypes: [ChannelType.GuildVoice],
      },
    ],
  },
  {
    name: CommandIds.SET_REPLAY_FOLDER,
    description: 'Set your HotS replay folder path',
    options: [
      {
        name: CommandIds.REPLAY_FOLDER_PATH,
        description: 'Path to your Heroes of the Storm replay folder',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: CommandIds.GET_REPLAY_FOLDER,
    description: 'Get your HotS replay folder path',
  },
  {
    name: CommandIds.LIST_REPLAYS,
    description: 'List recent HotS replays',
  },
];
