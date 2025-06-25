import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const botChannelName = '🫠-nor-customs';

export const adminUserIds = [
  '243668219712372736', // Bandayd
  '192116769870184448', // Nor
];

// create an enum for the commands
export const CommandIds = {
  NEW_GAME: 'new_game',
  SET_TEAMS: 'set_teams',
  SET_CHANNEL_TEAM_ID: 'set_team_channel',
  SET_LOBBY_CHANNEL: 'set_lobby_channel',
  MOVE_TO_LOBBY: 'move_all_to_lobby',
  MOVE_TO_TEAMS: 'move_teams',
  GUIDE: 'guide',
  JOIN: 'join',
  REJOIN: 'rejoin',
  NAME: 'name',
  ROLE: 'role',
  ACTIVE: 'active',
  LEAVE: 'leave',
  CLEAR: 'clear',
  PLAYERS: 'players',
  PLAYERS_RAW: 'players_raw',
  TWITCH: 'twitch',
  LOOKUP: 'lookup',
  ADMIN: 'admin',
  ROLE_TANK: 'T',
  ROLE_ASSASSIN: 'A',
  ROLE_BRUISER: 'B',
  ROLE_HEALER: 'H',
  ROLE_FLEX: 'F',
  ROLE_TANK_ACTIVE: 'T_active',
  ROLE_ASSASSIN_ACTIVE: 'A_active',
  ROLE_BRUISER_ACTIVE: 'B_active',
  ROLE_HEALER_ACTIVE: 'H_active',
  ROLE_FLEX_ACTIVE: 'F_active',
};

export const roleMap: Record<string, string> = {
  T: '🛡️ Tank',
  A: '⚔️ Assassin',
  B: '💪 Bruiser',
  H: '💉 Healer',
  F: '🔄 Flex',
};

export const playersBtn = new ButtonBuilder()
  .setCustomId(CommandIds.PLAYERS)
  .setLabel('Show Players')
  .setStyle(ButtonStyle.Primary);
export const leaveBtn = new ButtonBuilder()
  .setCustomId(CommandIds.LEAVE)
  .setLabel('Leave')
  .setStyle(ButtonStyle.Primary);
export const rejoinBtn = new ButtonBuilder()
  .setCustomId(CommandIds.REJOIN)
  .setLabel('Rejoin')
  .setStyle(ButtonStyle.Primary);
export const joinBtn = new ButtonBuilder().setCustomId(CommandIds.JOIN).setLabel('Join').setStyle(ButtonStyle.Primary);
export const nameBtn = new ButtonBuilder()
  .setCustomId(CommandIds.NAME)
  .setLabel('Change Name')
  .setStyle(ButtonStyle.Primary);
export const roleBtn = new ButtonBuilder()
  .setCustomId(CommandIds.ROLE)
  .setLabel('Change Role')
  .setStyle(ButtonStyle.Primary);
export const rolesRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
  ...Object.entries(roleMap).map(([key, label]) => {
    return new ButtonBuilder().setCustomId(key).setLabel(label).setStyle(ButtonStyle.Primary);
  })
);
export const rolesActiveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
  ...Object.entries(roleMap).map(([key, label]) => {
    return new ButtonBuilder().setCustomId(`${key}_active`).setLabel(label).setStyle(ButtonStyle.Primary);
  })
);
export const imPlayingBtn = new ButtonBuilder()
  .setCustomId(CommandIds.REJOIN)
  .setLabel("I'm Playing")
  .setStyle(ButtonStyle.Primary);
