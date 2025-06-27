import {
  ApplicationCommandDataResolvable,
  ApplicationCommandOptionType,
  ChannelType,
  PermissionsBitField,
} from 'discord.js';
import { CommandIds, roleMap } from '../constants';

export const slashCommands: ApplicationCommandDataResolvable[] = [
  {
    name: CommandIds.JOIN,
    description: 'Join with your hots username',
    options: [
      {
        name: 'username',
        type: 3, // STRING type
        description: 'Your hots username',
        required: true,
      },
      {
        name: CommandIds.ROLE,
        type: 3, // STRING type
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
    name: CommandIds.NAME,
    description: 'Set your username',
    options: [
      {
        name: 'username',
        type: 3, // STRING type
        description: 'Your hots username',
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
        type: 3, // STRING type
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
    name: CommandIds.NEW_GAME,
    description: 'Start a new game',
    defaultMemberPermissions: PermissionsBitField.Flags.MentionEveryone,
  },
  {
    name: CommandIds.SET_TEAMS,
    description: 'Load teams data',
    defaultMemberPermissions: PermissionsBitField.Flags.MentionEveryone,
    options: [
      {
        name: 'teams_data',
        type: 3, // STRING type
        description: 'The team data from the spreadsheet',
        required: true,
      },
    ],
  },
  {
    name: CommandIds.SET_CHANNEL_TEAM_ID,
    description: 'Set the channel team ID',
    defaultMemberPermissions: PermissionsBitField.Flags.MentionEveryone,
    options: [
      {
        name: 'team_number',
        type: 3, // STRING type
        description: 'The team number to set the channel for',
        required: true,
        choices: [
          { name: 'Team 1', value: 'team1' },
          { name: 'Filthy Team 2', value: 'team2' },
        ],
      },
      {
        name: 'channel_id',
        type: 7, // CHANNEL type
        description: 'The channel ID to set as the lobby channel',
        required: true,
        channelTypes: [ChannelType.GuildVoice],
      },
    ],
  },
  {
    name: CommandIds.SET_LOBBY_CHANNEL,
    description: 'Set the lobby channel',
    defaultMemberPermissions: PermissionsBitField.Flags.MentionEveryone,
    options: [
      {
        name: 'channel_id',
        type: 7, // CHANNEL type
        description: 'The channel ID to set as the lobby channel',
        required: true,
        channelTypes: [ChannelType.GuildVoice],
      },
    ],
  },
  {
    name: CommandIds.MOVE_TO_TEAMS,
    description: 'Move players to teams',
    defaultMemberPermissions: PermissionsBitField.Flags.MentionEveryone,
  },
  {
    name: CommandIds.MOVE_TO_LOBBY,
    description: 'Gather players to the lobby',
    defaultMemberPermissions: PermissionsBitField.Flags.MentionEveryone,
  },
  {
    name: CommandIds.GUIDE,
    description: 'Show the guide for how to play',
  },
  {
    name: 'rejoin',
    description: 'Rejoin the lobby with your previous username and role',
  },
  {
    name: CommandIds.CLEAR,
    description: 'Clear the lobby and remove all players',
    defaultMemberPermissions: PermissionsBitField.Flags.MentionEveryone,
  },
  {
    name: CommandIds.PLAYERS,
    description: 'List all players in the lobby',
  },
  {
    name: CommandIds.PLAYERS_RAW,
    description: 'List all players in the lobby with raw data',
    defaultMemberPermissions: PermissionsBitField.Flags.MentionEveryone,
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
        name: 'discord_member',
        type: ApplicationCommandOptionType.User, // USER type
        description: 'The Discord ID of the player to lookup',
        required: true,
      },
      {
        name: 'hots_name',
        type: ApplicationCommandOptionType.String, // STRING type
        description: 'The Heroes of the Storm username of the player',
        required: false,
      },
    ],
  },
  {
    name: CommandIds.ADMIN,
    description: 'Admin commands to manage players.',
    defaultMemberPermissions: PermissionsBitField.Flags.MentionEveryone,
    options: [
      {
        name: CommandIds.NAME,
        description: "Change a player's hots name.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'discord_member',
            description: 'The user to modify.',
            type: ApplicationCommandOptionType.User,
            required: true,
          },
          {
            name: CommandIds.NAME,
            description: "The player's new hots name.",
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
            name: 'discord_member',
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
            name: 'discord_member',
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
    ],
  },
  {
    name: CommandIds.MOVE,
    description: 'Move player',
    defaultMemberPermissions: PermissionsBitField.Flags.MentionEveryone,
    options: [
      {
        name: 'discord_member',
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
