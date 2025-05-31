import { ApplicationCommandDataResolvable, PermissionsBitField } from 'discord.js';
import { CommandIds } from '../constants';

export const slashCommands: ApplicationCommandDataResolvable[] = [
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
          { name: 'Assasin', value: 'A' },
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
          { name: 'Assasin', value: 'A' },
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
    name: CommandIds.TWITCH,
    description: "Show Norator's Twitch channel",
  },
];
