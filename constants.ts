import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const botChannelName = '🫠-nor-customs';

// create an enum for the commands
export const CommandIds = {
  LOAD_TEAMS: 'set_teams',
  SET_CHANNEL_TEAM_ID: 'set_team_channel',
  SET_LOBBY_CHANNEL: 'set_lobby_channel',
  GATHER_TO_LOBBY: 'gather',
  MOVE_TO_TEAMS: 'move_teams',
  GUIDE: 'guide',
  JOIN: 'join',
  REJOIN: 'rejoin',
  NAME: 'name',
  ROLE: 'role',
  LEAVE: 'leave',
  CLEAR: 'clear',
  PLAYERS: 'players',
  PLAYERS_RAW: 'players_raw',
  TWITCH: 'twitch',
  ROLE_TANK: 'T',
  ROLE_ASSASSIN: 'A',
  ROLE_BRUISER: 'B',
  ROLE_HEALER: 'H',
  ROLE_FLEX: 'F',
};

export const roleMap: Record<string, string> = {
  T: '🛡️ Tank',
  A: '⚔️ Assassin',
  B: '💪 Bruiser',
  H: '💉 Healer',
  F: '🔄 Flex',
};

const playersBtn = new ButtonBuilder()
  .setCustomId(CommandIds.PLAYERS)
  .setLabel('Show Players')
  .setStyle(ButtonStyle.Primary);
const leaveBtn = new ButtonBuilder().setCustomId(CommandIds.LEAVE).setLabel('Leave').setStyle(ButtonStyle.Primary);
const rejoinBtn = new ButtonBuilder().setCustomId(CommandIds.REJOIN).setLabel('Rejoin').setStyle(ButtonStyle.Primary);
const nameBtn = new ButtonBuilder().setCustomId(CommandIds.NAME).setLabel('Change Name').setStyle(ButtonStyle.Primary);
const roleBtn = new ButtonBuilder().setCustomId(CommandIds.ROLE).setLabel('Change Role').setStyle(ButtonStyle.Primary);
const rolesRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
  ...Object.entries(roleMap).map(([key, label]) => {
    return new ButtonBuilder().setCustomId(key).setLabel(label).setStyle(ButtonStyle.Primary);
  })
);
export { playersBtn, leaveBtn, rejoinBtn, nameBtn, roleBtn, rolesRow };
