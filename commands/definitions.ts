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
        required: true,
      },
    ],
  },
  {
    name: CommandIds.ROLE,
    description: 'Set your role',
    options: [
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
    name: CommandIds.EDIT_ROLES,
    description: 'Add/replace/remove your roles',
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
        name: 'hots_battle_tag',
        type: ApplicationCommandOptionType.String,
        description: 'The Heroes of the Storm battle tag of the player (including the # and number)',
        required: false,
      },
    ],
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
            required: true,
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
            required: true,
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
            name: 'hots_battle_tag',
            description: 'The Heroes of the Storm battle tag to add (including the # and number)',
            type: ApplicationCommandOptionType.String,
            required: true,
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
];
