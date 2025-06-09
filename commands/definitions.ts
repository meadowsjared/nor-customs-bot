import { ApplicationCommandDataResolvable, ChannelType, PermissionsBitField } from 'discord.js';
import { CommandIds } from '../constants';

export const slashCommands: ApplicationCommandDataResolvable[] = [
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
        description: 'The team data from the spreasheet',
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
        name: 'role',
        type: 3, // STRING type
        description: 'Your role in the game',
        required: true,
        choices: [
          { name: 'Tank', value: 'T' },
          { name: 'Assassin', value: 'A' },
          { name: 'Bruiser', value: 'B' },
          { name: 'Healer', value: 'H' },
          { name: 'Flex', value: 'F' },
        ],
      },
    ],
  },
  {
    name: 'rejoin',
    description: 'Rejoin the lobby with your previous username and role',
  },
  {
    name: 'name',
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
        name: 'role',
        type: 3, // STRING type
        description: 'Your role in the game',
        required: true,
        choices: [
          { name: 'Tank', value: 'T' },
          { name: 'Assassin', value: 'A' },
          { name: 'Bruiser', value: 'B' },
          { name: 'Healer', value: 'H' },
          { name: 'Flex', value: 'F' },
        ],
      },
    ],
  },
  {
    name: CommandIds.LEAVE,
    description: 'Leave the lobby',
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
];
