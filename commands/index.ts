import dotenv from 'dotenv';
import fs from 'fs';
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonComponent,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildChannel,
  Interaction,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageFlags,
  MessagePayload,
  ModalBuilder,
  ModalSubmitInteraction,
  TextBasedChannel,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  VoiceChannel,
} from 'discord.js';
import {
  adminUserIds,
  botChannelName,
  chatOrButtonOrModal,
  CommandIds,
  imPlayingBtn,
  joinBtn,
  leaveBtn,
  addAccountBtn,
  norDiscordId,
  rejoinBtn,
  roleBtn,
  roleMap,
} from '../constants';
import { announce, safePing } from '../utils/announce';
import {
  getActivePlayers,
  getPlayerByDiscordId,
  handleAddHotsAccount,
  markAllPlayersInactive,
  savePlayer,
  setPlayerActive,
  setPlayerDiscordNames,
  setPlayerName,
  setPlayerRole,
  setPrimaryAccount,
  setTeamsFromPlayers,
  storeInteraction,
  changeTeams,
  getStoredInteraction,
  deletePlayer,
  deleteHotsAccount,
  getAllPlayers,
  handleDeleteHotsAccount,
  assignPlayerToTeam,
  resetActivePlayerTeams,
  getNextDraftOrder,
  getDraftPickedCount,
  getSortedActivePlayers,
  getTeams,
} from '../store/player';
import {
  saveChannel,
  getChannels,
  saveLobbyMessage,
  getLobbyMessages,
  deleteLobbyMessages,
  deleteLobbyMessagesById,
} from '../store/channels';
import { DiscordUserNames, Player } from '../types/player';
import { client } from '../index';
import { parseReplay, saveReplayToDb, getPlayerMatchStats, optimizeDb } from '../store/hotsReplays';
import { getSetting, setSetting } from '../store/settings';
import path from 'path';
import { validateBattleTag } from '../utils/heroesOfTheStorm';
dotenv.config();
/**
 * Generates the current lobby status message with active players
 * @returns The formatted lobby status message
 */
function generateLobbyStatusMessage(pPreviousPlayersList?: string): string {
  const prevPlayersFromDb: string[] = JSON.parse(
    getLobbyMessages([CommandIds.NEW_GAME])?.[0]?.previousPlayersList ?? '[]',
  );
  const previousPlayersMessage = generatePreviousPlayersMessage(prevPlayersFromDb);
  const previousPlayersList = pPreviousPlayersList ?? previousPlayersMessage ?? '';
  const activePlayers = getActivePlayers();
  activePlayers.sort((a, b) => a.lastActive.getTime() - b.lastActive.getTime()); // sort by last_active ascending
  const lobbyPlayers = activePlayers.map(
    (p, index) =>
      `${index + 1}: @${p.usernames.discordDisplayName}: (${(
        p.usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag ?? 'hots account missing! :scream:'
      ).replace(/#.*$/, '')}) \`${getPlayerRolesFormatted(p.role)}\`${
        p.usernames.accounts?.length === 1 &&
        p.usernames.accounts[0].hpSlGames === null &&
        p.usernames.accounts[0].hpQmGames === null &&
        p.usernames.accounts[0].hpArGames === null
          ? ' loading MMR...'
          : ''
      }${
        p.usernames.accounts?.length === 1 &&
        p.usernames.accounts[0].hpSlGames === -1 &&
        p.usernames.accounts[0].hpQmGames === -1 &&
        p.usernames.accounts[0].hpArGames === -1
          ? ' MMR error!... :scream:'
          : ''
      }`,
  );

  // combine the lobbyPlayers and previousPlayersList, into one string, labeling each section, but skip a section if there are no players in that section
  const playerListWithLabels = [];
  if (previousPlayersList) playerListWithLabels.push(`__**Previous Players**__:\n${previousPlayersList}`);
  playerListWithLabels.push(
    `__**Players in the lobby**__: (${lobbyPlayers.length})\n${lobbyPlayers.join('\n') || 'The lobby is empty.'}`,
  );
  if (playerListWithLabels.length === 0) {
    playerListWithLabels.push(`**No Active Players**`);
  }
  const playerListWithLabelsString = playerListWithLabels.join('\n');

  return `A new game has started! All players have been marked as inactive.\n\n${playerListWithLabelsString}\n\nPlease click below if you are going to play.`;
}

/** generates the list of previous players */
function generatePreviousPlayersList(): string[] {
  return getActivePlayers().map(p => p.discordId);
}

function generatePreviousPlayersMessage(previousPlayersList: string[]): string {
  if (previousPlayersList.length === 0) {
    return '**No Previous Players**';
  }
  return previousPlayersList.map(discordId => `<@${discordId}>`).join(' ');
}

/**
 * Updates the lobby announcement message with current player status
 * @param interaction The interaction object for guild access
 */
export async function updateLobbyMessage(interaction: chatOrButtonOrModal, previousPlayersList?: string[]) {
  await updateAdminActiveButtons(interaction, previousPlayersList);

  const lobbyMessages = getLobbyMessages([CommandIds.NEW_GAME]);
  if (!lobbyMessages || lobbyMessages.length === 0) {
    return; // No lobby message to update
  }

  try {
    const channel = interaction.guild?.channels.cache.get(lobbyMessages[0].channelId);
    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(lobbyMessages[0].messageId);
      // purposely don't pass in the previousPlayersList, so it uses the stored value in the database
      const updatedContent = generateLobbyStatusMessage();
      await message.edit({
        content: updatedContent,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(imPlayingBtn)],
      });
    }
  } catch (error) {
    console.error('Failed to update lobby message:', error);
    // If the message doesn't exist anymore, clear the stored reference
  }
}

export async function handleNewGameCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  // combine the observers, team1, and team2, into one string, labeling each section, but skip a section if there are no players in that section

  /**
   * Array of discord IDs of the players that were active before starting the new game
   */
  const previousPlayersList = generatePreviousPlayersList();
  markAllPlayersInactive();

  // Generate the initial lobby status message
  const previousPlayersMessage = generatePreviousPlayersMessage(previousPlayersList);
  const lobbyStatusMessage = generateLobbyStatusMessage(previousPlayersMessage);

  // announce in the channel that a new game has started and all players have been marked as inactive, so they need to hit the button if they are going to play
  const sentMessage = await announce(interaction, {
    content: lobbyStatusMessage,
    flags: safePing(undefined),
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(imPlayingBtn)],
  });

  // Store the message ID so we can update it later
  if (sentMessage) {
    saveLobbyMessage(CommandIds.NEW_GAME, sentMessage.id, sentMessage.channelId, JSON.stringify(previousPlayersList));
  }

  const sentReply = await safeReply(interaction, {
    content: 'Game announced!', // empty content to avoid sending a message in the channel, since we already announced it'
    flags: MessageFlags.Ephemeral,
  });
  // delete sentReply
  await sentReply?.delete();
  // TODO I want to show the admin active buttons here, but if I do it crashes
  // handleAdminSetActiveCommand(interaction, previousPlayersList);
}

/**
 * Safely replies to an interaction, using followUp if already replied
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param replyOptions The options for the reply message
 * @returns Promise<Message<boolean> | InteractionResponse<boolean> | undefined>
 */
export async function safeReply(
  interaction: chatOrButtonOrModal | undefined,
  options: string | MessagePayload | InteractionReplyOptions,
) {
  if (!interaction) {
    // post a new message
    if (!process.env.NOR_DISCORD_ID) {
      console.error('No NOR_DISCORD_ID environment variable set.');
      return;
    }
    // use process.env.NOR_DISCORD_ID to get the channel
    const guild = client.guilds.cache.get(process.env.NOR_DISCORD_ID);
    if (!guild) {
      console.error(`Guild with ID ${process.env.NOR_DISCORD_ID} not found.`);
      return;
    }
    const channel = guild.channels.cache.find(ch => ch.name === botChannelName);
    if (!channel?.isTextBased()) {
      console.error(`Channel with name ${botChannelName} not found or is not text-based.`);
      return;
    }
    const message = getMessageContent(options);
    return channel.send({
      content: message,
    });
  }
  if (interaction.replied || interaction.deferred) {
    return await interaction.followUp(options);
  } else {
    try {
      if (interaction.isRepliable()) {
        return await interaction.reply(options);
      } else {
        console.error('Interaction is not repliable');
      }
    } catch (error) {
      try {
        return await interaction.followUp(options);
      } catch (followUpError) {
        console.error('Failed to follow up on interaction:', followUpError);
      }
    }
  }
}

function getMessageContent(options: string | MessagePayload | InteractionReplyOptions): string {
  if (typeof options === 'string') {
    return options;
  } else if ('content' in options && typeof options.content === 'string') {
    return options.content;
  } else {
    return 'No content';
  }
}

/**
 * Handles the /load_teams command interaction, which loads teams from a JSON string provided in the command options.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 * note: If the interaction is not a command or button interaction, it logs an error and returns.
 * This function also sets the teams in the database, for use with the handleMoveToTeamsCommand and handleMoveToLobbyCommand functions.
 **/
export async function handleSetTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const originalTeamsData = interaction.options.getString('teams_data', true);
  const splitResult = originalTeamsData.split(',');
  const team1Input: number[] | null = splitResult[0]
    ?.split(/\W/)
    .map(n => parseInt(n, 10))
    .filter(n => !isNaN(n));
  const team2Input: number[] | null = splitResult[1]
    ?.split(/\W/)
    .map(n => parseInt(n, 10))
    .filter(n => !isNaN(n));
  // now that we have the new team assignments
  const sortedPlayers = getSortedActivePlayers();
  sortedPlayers.forEach((p, index) => (p.draftRank = index));
  if (team1Input.length > sortedPlayers.length) {
    // the maximum length is the total number of players
    await safeReply(interaction, {
      content: `Too many players provided. There are currently ${sortedPlayers.length} players in total.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // check if the teamsData contains any duplicates
  const uniqueTeamsData = Array.from(new Set(team1Input));
  if (uniqueTeamsData.length !== team1Input.length) {
    // Find the duplicates
    const duplicates = team1Input.filter((num, index) => team1Input.indexOf(num) !== index);
    const uniqueDuplicates = Array.from(new Set(duplicates));

    await safeReply(interaction, {
      content: `Duplicate player numbers provided: \`${uniqueDuplicates.join(
        ', ',
      )}\`. Please provide each player number only once.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // go through and subtract one from each number, so we're using 0-based indexes
  for (let i = 0; i < (team1Input.length ?? 0); i++) {
    team1Input[i] = team1Input[i] - 1;
  }
  for (let i = 0; i < (team2Input?.length ?? 0); i++) {
    team2Input[i] = team2Input[i] - 1;
  }

  // populate team 2
  const team2InputEffective =
    team2Input ??
    sortedPlayers.reduce((acc: number[], _, index: number) => {
      if (!team1Input.includes(index) && acc.length < 5) {
        acc.push(index);
      }
      return acc;
    }, []);
  // now we have the two teams, we need to set them in the database
  // go through sortedPlayers, and assign draftRank
  const newTeam1: Player[] = sortedPlayers.filter(p => team1Input.includes(p.draftRank));
  const newTeam2: Player[] = sortedPlayers.filter(p => team2InputEffective.includes(p.draftRank));
  const newSpectators: Player[] = sortedPlayers.filter(
    p => !team1Input.includes(p.draftRank) && !team2InputEffective.includes(p.draftRank),
  );

  // set the teams in the database
  setTeamsFromPlayers(newTeam1, newTeam2, newSpectators);
  await generateTeamsMessage(interaction, newTeam1, newTeam2);
}

/**
 * Handles the /make_teams command interaction, which creates proposed teams from the active players by MMR.
 * The teams are created by sorting the players by their MMR and alternating them between the two teams.
 * The teams are then saved to the database and a message is generated to show who is on what team.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns Promise<void>
 */
export async function handleMakeTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  const MAX_PLAYERS_PER_TEAM = 5;
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }

  const publish = interaction.options.getBoolean('publish', false) ?? false;
  const sortedPlayers = getSortedActivePlayers();
  if (sortedPlayers.length < 1) {
    await safeReply(interaction, {
      content: 'Not enough players to make teams.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const team1: Player[] = [];
  const team2: Player[] = [];
  const spectators: Player[] = [];
  // go through the sorted players, and alternate adding them to each team using snake draft (1, 2, 2, 1, 1, 2, 2, 1)
  sortedPlayers.forEach((p, index) => {
    if ((index % 4 == 0 || index % 4 == 3) && team1.length < MAX_PLAYERS_PER_TEAM) {
      p.team = 1;
      team1.push(p);
    } else if ((index % 4 == 1 || index % 4 == 2) && team2.length < MAX_PLAYERS_PER_TEAM) {
      p.team = 2;
      team2.push(p);
    } else {
      p.team = 0;
      spectators.push(p);
    }
  });
  // set the teams in the database
  setTeamsFromPlayers(team1, team2, spectators);
  await generateTeamsMessage(interaction, team1, team2, publish, true);
}

/**
 * Handles autocomplete for captain selection in /draft and /draft_captain
 */
export async function handleDraftAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const sortedPlayers = getSortedActivePlayers();
  const focusedValue = interaction.options.getFocused().toLowerCase();

  const filtered = sortedPlayers.filter(
    p =>
      p.usernames?.discordDisplayName?.toLowerCase().includes(focusedValue) ||
      p.usernames?.discordGlobalName?.toLowerCase().includes(focusedValue) ||
      p.usernames?.accounts?.some(acc => acc.hotsBattleTag?.toLowerCase().includes(focusedValue)),
  );

  const choices = filtered.slice(0, 25).map(p => ({
    name: `${p.usernames?.discordDisplayName ?? 'Player'} (${p.mmr})`,
    value: p.discordId,
  }));

  await interaction.respond(choices);
}

/**
 * Updates the active interactive draft message in channel
 */
export async function updateDraftUIMessage(
  guildId: string | null,
  interactionForGuild: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  const draftMessages = getLobbyMessages([CommandIds.DRAFT]);
  if (!draftMessages || draftMessages.length === 0) {
    return;
  }

  const uiData = generateDraftUI(guildId);
  try {
    const channelId = draftMessages[0].channelId;
    const messageId = draftMessages[0].messageId;
    if (interactionForGuild && interactionForGuild.guild) {
      const channel = interactionForGuild.guild.channels.cache.get(channelId);
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(messageId);
        await message.edit(uiData);
      }
    } else {
      const guild = client.guilds.cache.get(guildId ?? '');
      const channel = guild?.channels.cache.get(channelId);
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(messageId);
        await message.edit(uiData);
      }
    }
  } catch (error) {
    console.error('Failed to update draft UI message:', error);
  }
}

/**
 * Handles the /draft command interaction, which starts an interactive captain draft.
 */
export async function handleDraftCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  const activeSortedPlayers = getSortedActivePlayers();
  if (activeSortedPlayers.length < 2) {
    await safeReply(interaction, {
      content: 'Not enough active players in the lobby to start a draft. Need at least 2 active players.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Reset team assignments for active players
  resetActivePlayerTeams();

  let t1CaptainId = interaction.isChatInputCommand()
    ? (interaction.options.getString('team1_captain') ?? undefined)
    : undefined;
  let t2CaptainId = interaction.isChatInputCommand()
    ? (interaction.options.getString('team2_captain') ?? undefined)
    : undefined;

  if (!t1CaptainId) {
    t1CaptainId = activeSortedPlayers[0].discordId;
  }
  if (!t2CaptainId) {
    t2CaptainId =
      t1CaptainId === activeSortedPlayers[0].discordId
        ? activeSortedPlayers[1]?.discordId
        : activeSortedPlayers[0].discordId;
  }

  const modeOpt = interaction.isChatInputCommand() ? (interaction.options.getString('mode') ?? 'captains') : 'captains';

  setSetting('draft_mode', modeOpt, interaction.guildId);

  // Automatically assign Captain 1 to Team 1 (rank #1) and Captain 2 to Team 2 (rank #2)
  assignPlayerToTeam(t1CaptainId, 1, 1);
  assignPlayerToTeam(t2CaptainId, 2, 2);

  const uiData = generateDraftUI(interaction.guildId);

  const sentMessage = await announce(interaction, uiData);

  if (sentMessage) {
    saveLobbyMessage(CommandIds.DRAFT, sentMessage.id, sentMessage.channelId, '');
  }

  const sentReply = await safeReply(interaction, {
    content: 'Interactive draft started!',
    flags: MessageFlags.Ephemeral,
  });

  await sentReply?.delete();
}

/**
 * Builds the interactive draft message content and component buttons.
 */
export function generateDraftUI(guildId: string | null): {
  content: string;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  allowedMentions: { parse: [] };
} {
  const activePlayers = getSortedActivePlayers(true);
  const { team1, team2, t1Captain, t2Captain } = getTeams();

  const unpickedPlayers = activePlayers.filter(p => p.team === null || p.team === undefined);
  const mode = getSetting('draft_mode', guildId) ?? 'captains';
  const turnInfo = getCurrentDraftTurn({ 1: team1.length, 2: team2.length }, activePlayers.length);

  const statusHeader = buildDraftStatusHeader(mode, turnInfo, unpickedPlayers.length, t1Captain, t2Captain);
  const centeredRotationBlock = buildDraftRotationBlock(turnInfo.activePickIndex, mode, turnInfo.isComplete);

  const sortedTeam1 = sortTeamByDraftOrder(team1, t1Captain?.discordId);
  const sortedTeam2 = sortTeamByDraftOrder(team2, t2Captain?.discordId);

  const team1List =
    (sortedTeam1.map(p => formatDraftPlayerEntry(p, p.discordId === t1Captain?.discordId, true)).join('\n') ||
      '*No players picked yet*') + '\n\u200b';

  const team2List =
    (sortedTeam2.map(p => formatDraftPlayerEntry(p, p.discordId === t1Captain?.discordId, true)).join('\n') ||
      '*No players picked yet*') + '\n\u200b';

  const unpickedList =
    unpickedPlayers.map(p => formatDraftPlayerEntry(p, false, false)).join('\n') || '*None (Pool empty)*';

  const embed = buildDraftEmbed({
    mode,
    turnInfo,
    statusHeader,
    centeredRotationBlock,
    t1Captain,
    t2Captain,
    team1List,
    team2List,
    unpickedList,
    unpickedCount: unpickedPlayers.length,
  });

  const components = buildDraftActionRows(unpickedPlayers, turnInfo, mode, t1Captain, t2Captain);

  return { content: '', embeds: [embed], components, allowedMentions: { parse: [] } };
}

/**
 * Calculates current turn in HotS 1-2-2-1-1-2-2-1 draft order based on team counts.
 */
export function getCurrentDraftTurn(
  teamPlayerCounts: { [key: number]: number },
  totalActive: number = 10,
): {
  currentTeam: number;
  picksRemaining: number;
  pickNumber: number;
  isComplete: boolean;
  totalPicksThisTurn: number;
  activePickIndex: number;
} {
  const Max_Picks = 10;
  const activePickIndex = Math.min(8, Math.max(0, teamPlayerCounts[1] + teamPlayerCounts[2] - 2));
  const totalPicksThisTurn =
    activePickIndex === 0
      ? 1
      : activePickIndex === totalActive && totalActive % 1 === 0
        ? 1
        : Math.min(2, totalActive - teamPlayerCounts[1] - teamPlayerCounts[2]);
  const pickNumber = activePickIndex === 0 ? 1 : activePickIndex % 2 === 0 ? 2 : 1;
  if (teamPlayerCounts[1] + teamPlayerCounts[2] >= Max_Picks) {
    return { currentTeam: 1, picksRemaining: 0, isComplete: true, totalPicksThisTurn, activePickIndex, pickNumber };
  }

  for (let i = 2; i < totalActive; i++) {
    const currentTeam = i % 2 === 0 ? 1 : 2;
    if (teamPlayerCounts[currentTeam] < i) {
      return {
        currentTeam,
        activePickIndex,
        picksRemaining: Math.min(
          i - teamPlayerCounts[currentTeam],
          totalActive - teamPlayerCounts[1] - teamPlayerCounts[2],
        ),
        totalPicksThisTurn,
        isComplete: false,
        pickNumber,
      };
    }
  }

  // Fallback for arbitrary states resulting from free pick mode:
  // Whichever team has fewer players gets the next turn!
  if (teamPlayerCounts[1] <= teamPlayerCounts[2]) {
    return { currentTeam: 1, picksRemaining: 1, isComplete: false, totalPicksThisTurn, activePickIndex, pickNumber };
  } else {
    return { currentTeam: 2, picksRemaining: 1, isComplete: false, totalPicksThisTurn, activePickIndex, pickNumber };
  }
}

/**
 * Builds the status header text based on draft mode and active turn.
 */
function buildDraftStatusHeader(
  mode: string,
  turnInfo: ReturnType<typeof getCurrentDraftTurn>,
  unpickedCount: number,
  t1Captain?: Player,
  t2Captain?: Player,
): string {
  if (mode === 'captains') {
    if (turnInfo.isComplete || unpickedCount === 0) {
      return '# 🎉 Draft Complete!\nBoth teams have been picked.';
    } else {
      const activeCaptain = turnInfo.currentTeam === 1 ? t1Captain : t2Captain;
      const activeCaptainName = activeCaptain ? `@${activeCaptain.usernames?.discordDisplayName}` : 'Unassigned';
      const teamLabel = turnInfo.currentTeam === 1 ? '🔵 Team 1' : '🔴 Team 2';
      return `## ${teamLabel} Captain ${activeCaptainName}'s Turn\n*(Pick ${turnInfo.pickNumber} of ${turnInfo.totalPicksThisTurn})*`;
    }
  } else if (mode === 'free_team1') {
    return '## ⚡ Free Pick Mode ➡️ 🔵 Team 1\n*Click any available player button to assign them to Team 1*';
  } else if (mode === 'free_team2') {
    return '## ⚡ Free Pick Mode ➡️ 🔴 Team 2\n*Click any available player button to assign them to Team 2*';
  } else {
    return '## ⚡ Free Pick Mode\n• Team 1 Captain picks ➡️ Team 1 (🔵)\n• Team 2 Captain picks ➡️ Team 2 (🔴)';
  }
}

/**
 * Generates the 1-2-2 HotS pick rotation sequence tracker string block.
 */
function buildDraftRotationBlock(activePickIndex: number, mode: string, isComplete: boolean): string {
  const sequence = [1, 2, 2, 1, 1, 2, 2, 1];
  const arrowRow = sequence
    .map((_, idx) => (idx === activePickIndex && mode === 'captains' && !isComplete ? '⬇️' : '⬛'))
    .join(' ');

  const trackerRow = sequence
    .map((team, idx) => {
      if (idx < activePickIndex && mode === 'captains') {
        return team === 1 ? '🔵' : '🔴';
      } else {
        return team === 1 ? '🧿' : '⭕';
      }
    })
    .join(' ');

  const centerPad = '⠀ ⠀ ⠀ ⠀ ⠀ ⠀ ⠀ ⠀ ⠀ ⠀ ';
  return `${centerPad}**Draft Rotation Order:**${isComplete ? '' : '\n' + centerPad + arrowRow}\n${centerPad}${trackerRow}\n\u200b`;
}

/**
 * Sorts players on a team roster putting captain first followed by draft pick order.
 */
function sortTeamByDraftOrder(players: Player[], captainId?: string): Player[] {
  return [...players].sort((a, b) => {
    const aIsCap = a.discordId === captainId;
    const bIsCap = b.discordId === captainId;
    if (aIsCap) return -1;
    if (bIsCap) return 1;
    return (a.draftOrder ?? 0) - (b.draftOrder ?? 0);
  });
}

/**
 * Formats a player entry string for display in team rosters or available pool.
 */
function formatDraftPlayerEntry(p: Player, isCaptain: boolean, isOnTeamRoster: boolean): string {
  const primaryHotsTag = (
    p.usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag ??
    p.usernames.accounts?.[0]?.hotsBattleTag ??
    ''
  ).replace(/#.*$/, '');
  const hotsSection = primaryHotsTag ? `: (${primaryHotsTag})` : `: (${p.usernames.discordDisplayName})`;
  const roleSection = `\`${getPlayerRolesFormatted(p.role)}\``;
  const mmrSection = `\`(${p.mmr})\``;

  let prefix = '• ';
  if (isCaptain) {
    prefix = '• 👑 ';
  } else if (isOnTeamRoster) {
    const pickNum = p.draftOrder ?? 1;
    prefix = `• #${pickNum - 1} `;
  }

  if (isOnTeamRoster) {
    return `${prefix}@${p.usernames.discordDisplayName}${hotsSection}\n  ${roleSection} ${mmrSection}`;
  }
  return `${prefix}@${p.usernames.discordDisplayName}${hotsSection} ${roleSection} ${mmrSection}`;
}

/**
 * Constructs the primary EmbedBuilder for the interactive draft message.
 */
function buildDraftEmbed(params: {
  mode: string;
  turnInfo: ReturnType<typeof getCurrentDraftTurn>;
  statusHeader: string;
  centeredRotationBlock: string;
  t1Captain?: Player;
  t2Captain?: Player;
  team1List: string;
  team2List: string;
  unpickedList: string;
  unpickedCount: number;
}): EmbedBuilder {
  const {
    mode,
    turnInfo,
    statusHeader,
    centeredRotationBlock,
    t1Captain,
    t2Captain,
    team1List,
    team2List,
    unpickedList,
    unpickedCount,
  } = params;

  const t1CaptainName = t1Captain ? `@${t1Captain.usernames?.discordDisplayName}` : 'Unassigned';
  const t2CaptainName = t2Captain ? `@${t2Captain.usernames?.discordDisplayName}` : 'Unassigned';

  let footerText = 'Draft Style: Captains Mode (1-2-2 Rotation) • Nexus Customs';
  if (mode === 'free_team1') footerText = 'Draft Style: Free Pick ➡️ Team 1 (🔵) • Nexus Customs';
  if (mode === 'free_team2') footerText = 'Draft Style: Free Pick ➡️ Team 2 (🔴) • Nexus Customs';

  return new EmbedBuilder()
    .setTitle('⚔️ HEROES OF THE STORM CAPTAIN DRAFT')
    .setColor(turnInfo.currentTeam === 1 ? 0x3498db : 0xed4245)
    .setDescription(`${statusHeader}\n\n${centeredRotationBlock}`)
    .addFields(
      {
        name: `🔵 TEAM 1 (Captain: ${t1CaptainName})`,
        value: team1List,
        inline: true,
      },
      {
        name: `🔴 TEAM 2 (Captain: ${t2CaptainName})`,
        value: team2List,
        inline: true,
      },
      {
        name: turnInfo.isComplete ? `🟡 SPECTATORS (${unpickedCount})` : `📋 AVAILABLE LOBBY POOL (${unpickedCount})`,
        value: unpickedList,
        inline: false,
      },
    )
    .setFooter({
      text: footerText,
    });
}

/**
 * Builds interactive button component action rows for picks, removals, and controls.
 */
function buildDraftActionRows(
  unpickedPlayers: Player[],
  turnInfo: ReturnType<typeof getCurrentDraftTurn>,
  mode: string,
  t1Captain?: Player,
  t2Captain?: Player,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();

  if (!turnInfo.isComplete && unpickedPlayers.length > 0) {
    unpickedPlayers.forEach(p => {
      if (currentRow.components.length >= 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
      }
      const label = `${p.usernames?.discordDisplayName ?? 'Player'} (${p.mmr})`;
      const buttonStyle = mode === 'free_team2' ? ButtonStyle.Danger : ButtonStyle.Primary;
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`draft_pick:${p.discordId}`)
          .setLabel(label.length > 80 ? label.slice(0, 77) + '...' : label)
          .setStyle(buttonStyle),
      );
    });
    if (currentRow.components.length > 0) {
      rows.push(currentRow);
    }
  }

  // In Free Pick mode, also add removal buttons for currently picked non-captain players
  const isFreePick = mode === 'free_team1' || mode === 'free_team2' || mode === 'free';
  if (isFreePick && rows.length < 4) {
    const pickedNonCaptains = [t1Captain, t2Captain].filter((p): p is Player => p !== undefined);
    let removeRow = new ActionRowBuilder<ButtonBuilder>();
    pickedNonCaptains.forEach(p => {
      if (removeRow.components.length >= 5) {
        rows.push(removeRow);
        removeRow = new ActionRowBuilder<ButtonBuilder>();
      }
      const label = `Remove ${p.usernames?.discordDisplayName ?? 'Player'}`;
      removeRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`draft_remove:${p.discordId}`)
          .setLabel(label.length > 80 ? label.slice(0, 77) + '...' : label)
          .setStyle(ButtonStyle.Secondary),
      );
    });
    if (removeRow.components.length > 0 && rows.length < 4) {
      rows.push(removeRow);
    }
  }

  // Control Row
  const canUndo = getDraftPickedCount(t1Captain?.discordId, t2Captain?.discordId) > 0;

  let modeBtnLabel = 'Mode: Captains (1-2-2)';
  if (mode === 'free_team1') modeBtnLabel = 'Mode: Free Pick ➡️ Team 1 (🔵)';
  if (mode === 'free_team2') modeBtnLabel = 'Mode: Free Pick ➡️ Team 2 (🔴)';

  const controlsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('draft_undo')
      .setLabel('Undo Last Pick')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canUndo),
    new ButtonBuilder().setCustomId('draft_toggle_mode').setLabel(modeBtnLabel).setStyle(ButtonStyle.Secondary),
  );

  rows.push(controlsRow);
  return rows;
}

/**
 * Handles the /draft_captain command interaction
 */
export async function handleDraftCaptainCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (!interaction.isChatInputCommand()) {
    return;
  }
  const t1CaptainId = interaction.options.getString('team1_captain');
  const t2CaptainId = interaction.options.getString('team2_captain');

  if (!t1CaptainId && !t2CaptainId) {
    await safeReply(interaction, {
      content: 'Please specify at least one captain (Team 1 Captain or Team 2 Captain) to set.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const updated: string[] = [];

  if (t1CaptainId) {
    assignPlayerToTeam(t1CaptainId, 1, 1);
    updated.push(`Team 1 captain to <@${t1CaptainId}>`);
  }
  if (t2CaptainId) {
    assignPlayerToTeam(t2CaptainId, 2, 2);
    updated.push(`Team 2 captain to <@${t2CaptainId}>`);
  }

  await updateDraftUIMessage(interaction.guildId, interaction);

  const sentReply = await safeReply(interaction, {
    content: `Updated ${updated.join(' and ')}!`,
    flags: MessageFlags.Ephemeral,
  });
  await sentReply?.delete();
}

/**
 * Handles picking a player via player button click
 */
export async function handleDraftPickButton(interaction: ButtonInteraction<CacheType>, pickedPlayerDiscordId: string) {
  // Instantly acknowledge button interaction to Discord (< 50ms) to prevent timeouts
  await interaction.deferUpdate();

  const guildId = interaction.guildId;
  const mode = getSetting('draft_mode', guildId) ?? 'captains';

  const sortedPlayers = getSortedActivePlayers(true);
  const { team1, team2, t1Captain, t2Captain } = getTeams(sortedPlayers);
  const turnInfo = getCurrentDraftTurn({ 1: team1.length, 2: team2.length }, sortedPlayers.length);

  const isT1Captain = interaction.user.id === t1Captain.discordId;
  const isT2Captain = interaction.user.id === t2Captain.discordId;

  if (mode === 'captains') {
    // 1. Must be a captain
    if (!isT1Captain && !isT2Captain) {
      await safeReply(interaction, {
        content: '⛔ Only designated team captains can pick players in Captains Mode!',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    // 2. Must be active captain's turn
    const activeCaptainId = turnInfo.currentTeam === 1 ? t1Captain.discordId : t2Captain.discordId;
    if (interaction.user.id !== activeCaptainId) {
      const activeCaptainObj = sortedPlayers.find(p => p.discordId === activeCaptainId);
      const activeName = activeCaptainObj ? `@${activeCaptainObj.usernames?.discordDisplayName}` : 'assigned captain';
      await safeReply(interaction, {
        content: `✋ Not your turn! It's Team ${turnInfo.currentTeam} Captain's (${activeName}) turn to pick.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }
  }

  // Determine assigned team
  const assignedTeam = mode === 'captains' ? turnInfo.currentTeam : mode === 'free_team1' ? 1 : 2;

  // Assign player in DB with next draft order (#3, #4, #5...)
  const nextOrder = getNextDraftOrder();
  assignPlayerToTeam(pickedPlayerDiscordId, assignedTeam, nextOrder);

  await updateDraftUIMessage(guildId, interaction);
}

/**
 * Handles the /draft_undo command interaction or Undo button click
 */
export async function handleDraftUndoCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  let count = 1;
  let all = false;

  if (interaction.isChatInputCommand()) {
    count = interaction.options.getInteger('count') ?? 1;
    all = interaction.options.getBoolean('all') ?? false;
  } else {
    // Instantly acknowledge button interaction to Discord to prevent timeouts
    await interaction.deferUpdate();
  }

  const guildId = interaction.guildId;
  const { team1, team2, t1Captain, t2Captain } = getTeams();
  const allTeams = [...team1, ...team2];

  const nonCaptainPicks = allTeams
    .filter(p => p.discordId !== t1Captain.discordId && p.discordId !== t2Captain.discordId)
    .sort((a, b) => (b.draftOrder ?? 0) - (a.draftOrder ?? 0));

  const picksToUndo = nonCaptainPicks.slice(0, all ? nonCaptainPicks.length : count);

  for (const player of picksToUndo) {
    assignPlayerToTeam(player.discordId, null, null);
  }
  const numUndone = picksToUndo.length;

  await updateDraftUIMessage(guildId, interaction);

  if (interaction.isChatInputCommand()) {
    const message = all
      ? 'Undid all draft picks! Teams have been reset back to captains.'
      : numUndone > 0
        ? `Undid the last ${numUndone} draft pick(s).`
        : 'No draft picks to undo.';
    await safeReply(interaction, {
      content: message,
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Handles the Mode Toggle button click
 */
export async function handleDraftToggleModeButton(interaction: ButtonInteraction<CacheType>) {
  await interaction.deferUpdate();

  const currentMode = getSetting('draft_mode', interaction.guildId) ?? 'captains';
  let newMode = 'captains';
  if (currentMode === 'captains') {
    newMode = 'free_team1';
  } else if (currentMode === 'free_team1') {
    newMode = 'free_team2';
  } else {
    newMode = 'captains';
  }
  setSetting('draft_mode', newMode, interaction.guildId);

  await updateDraftUIMessage(interaction.guildId, interaction);
}

/**
 * Handles the /draft_mode command interaction
 */
export async function handleDraftModeCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (!interaction.isChatInputCommand()) {
    return;
  }
  const mode = interaction.options.getString('mode', true);
  setSetting('draft_mode', mode, interaction.guildId);

  await updateDraftUIMessage(interaction.guildId, interaction);

  let modeLabel = 'Captains Mode (1-2-2 Rotation)';
  if (mode === 'free_team1') modeLabel = 'Free Pick ➡️ Team 1 (🔵)';
  if (mode === 'free_team2') modeLabel = 'Free Pick ➡️ Team 2 (🔴)';

  const sentReply = await safeReply(interaction, {
    content: `Switched draft mode to **${modeLabel}**!`,
    flags: MessageFlags.Ephemeral,
  });
  // await sentReply?.delete();
}

/**
 * Handles removing a player from a team back to the lobby pool
 */
export async function handleDraftRemoveButton(
  interaction: ButtonInteraction<CacheType>,
  removedPlayerDiscordId: string,
) {
  await interaction.deferUpdate();

  const guildId = interaction.guildId;
  assignPlayerToTeam(removedPlayerDiscordId, null, null);

  await updateDraftUIMessage(guildId, interaction);
}

/**
 * Generate the message to show who is on what team
 * if publish it true, the message will be posted publicly, no ephemeral message is made
 * and the previous ephemeral message is deleted
 * otherwise it will be ephemeral
 *
 * therefore only one teams or teams_ephemeral message should be in the database at any time
 *
 * if isDraft is true, then we're creating a new draft, so delete any previous ephemeral messages
 * and previous public messages are deleted from the database also we'll post it according to [@publish]
 *
 * if both are false, then it will just update whatever was done last
 *
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param team1 The list of players on team 1
 * @param team2 The list of players on team 2
 * @param publish Whether to publish the message publicly or as an ephemeral message
 * @returns Promise<void>
 */
async function generateTeamsMessage(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  team1: Player[],
  team2: Player[],
  /**
   * If this is true, we're publishing the teams to the channel, so delete the old ephemeral message
   * and post a new message publicly
   */
  publish = false,
  /**
   * if this is true, then we're creating a new team draft
   */
  isDraft = false,
): Promise<void> {
  if (interaction.isButton()) {
    await safeReply(interaction, {
      content: 'Interaction is not a command or button interaction',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const activePlayers = getSortedActivePlayers();
  activePlayers.forEach((p, index) => (p.draftRank = index));
  const team1List = team1
    .map(
      p =>
        `\`${p.draftRank + 1}: ${p.mmr}\` ${`<@${p.discordId}>`} ${p.usernames.accounts
          ?.find(account => account.isPrimary)
          ?.hotsBattleTag.replace(/#.*$/, '')} \`${getPlayerRolesFormatted(p.role)}\``,
    )
    .join('\n');
  const team2List = team2
    .map(
      p =>
        `\`${p.draftRank + 1}: ${p.mmr}\` ${`<@${p.discordId}>`} ${p.usernames.accounts
          ?.find(account => account.isPrimary)
          ?.hotsBattleTag.replace(/#.*$/, '')} \`${getPlayerRolesFormatted(p.role)}\``,
    )
    .join('\n');
  const spectators = activePlayers.filter(
    p => team1.every(t => t.discordId !== p.discordId) && team2.every(t => t.discordId !== p.discordId),
  );
  const spectatorList = spectators
    .map(
      p =>
        `\`${p.draftRank + 1}: ${p.mmr}\` ${`<@${p.discordId}>`} ${p.usernames.accounts
          ?.find(account => account.isPrimary)
          ?.hotsBattleTag.replace(/#.*$/, '')}`,
    )
    .join('\n');

  const team1lengthMessage = team1.length === 5 ? '' : ` (${team1.length} players)`;
  const team2lengthMessage = team2.length === 5 ? '' : ` (${team2.length} players)`;
  const team1embed = new EmbedBuilder()
    .setTitle(`Team 1${team1lengthMessage}`)
    .setDescription(team1List || '* No players in this team')
    .setColor('#0099ff');
  const team2embed = new EmbedBuilder()
    .setTitle(`💩 Filthy Team 2${team2lengthMessage}`)
    .setDescription(team2List || '* No players in this team')
    .setColor('#8B4513');
  const spectatorEmbedAr =
    spectators.length > 0
      ? [new EmbedBuilder().setTitle('Spectators').setDescription(spectatorList).setColor(`#909000`)]
      : [];
  const embeds = [team1embed, team2embed, ...spectatorEmbedAr];
  let messages = getLobbyMessages([CommandIds.TEAMS_EPHEMERAL, CommandIds.TEAMS]);
  if (publish || isDraft) {
    // clear the previous message from the database, so it doesn't get updated until it's published again
    if (messages) {
      messages
        .filter(msg => msg.messageType === CommandIds.TEAMS_EPHEMERAL)
        .forEach(async msg => {
          // we know it's an ephemeral message so:
          const message = getStoredInteraction(msg.messageId, msg.channelId);
          message?.deleteReply().catch(() => {
            console.log('Failed to delete ephemeral message');
            console.trace();
          });
        });
      messages = messages.filter(msg => msg.messageType !== CommandIds.TEAMS_EPHEMERAL);
    }

    // if publish or isDraft is true, we're deleting the old messages from the database
    deleteLobbyMessages([CommandIds.TEAMS_EPHEMERAL, CommandIds.TEAMS]);
  }

  if (publish) {
    // if we're publishing it, then we know the ephemeral messages got deleted above, so just post a new message
    const message = await safeReply(interaction, {
      content: `<@${norDiscordId}>`,
      embeds,
      flags: safePing(undefined),
    });
    if (message) {
      const fetchedMessage = await message.fetch();
      saveLobbyMessage(CommandIds.TEAMS, fetchedMessage.id, interaction.channelId, ''); // store the interaction ID as the message ID, so we know it was a draft
    }
    return; // no need to update anything
  }
  if (isDraft) {
    // else then it's a ephemeral
    const message = await safeReply(interaction, {
      content: `<@${norDiscordId}>`,
      embeds,
      flags: safePing(MessageFlags.Ephemeral),
    });
    if (message) {
      storeInteraction(message.id, interaction.channelId, interaction);
      saveLobbyMessage(CommandIds.TEAMS_EPHEMERAL, message.id, interaction.channelId, '');
    }
    return;
  }

  // if we got here, we know isDraft === false
  // therefore we're editing the previous message
  // also of note, there should only be a single
  // ephemeral message, OR a published message
  // never both
  const reply = await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  messages?.forEach(async msg => {
    const channel = interaction.guild?.channels.cache.get(msg.channelId);
    if (!channel?.isTextBased()) return;
    if (messages) {
      try {
        if (msg.messageType === CommandIds.TEAMS_EPHEMERAL) {
          const prevInteraction = getStoredInteraction(msg.messageId, msg.channelId);
          if (!prevInteraction) return;
          await prevInteraction.editReply({
            content: `<@${norDiscordId}>`,
            embeds,
          });
          return;
        }
        // so it's not an ephemeral message, so:
        const previousMessage = await channel.messages.fetch(msg.messageId);
        if (!previousMessage) return;
        const message = await previousMessage.edit({
          content: `<@${norDiscordId}>`,
          embeds,
        });
        // only save the message if we successfully edited it
        const fetchedMessage = await message.fetch();
        saveLobbyMessage(CommandIds.TEAMS, fetchedMessage.id, interaction.channelId, ''); // store the interaction ID as the message ID, so we know it was a draft
        return;
      } catch (error) {
        // if we couldn't edit the message, then delete it from the database
        deleteLobbyMessages([msg.messageType]);
        console.error('Failed to update draft message:', [msg.messageType], error);
      }
    }
  });
  await reply.delete().catch(console.error);
}

export async function handleSwapTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (interaction.isButton()) {
    await safeReply(interaction, {
      content: 'Interaction is not a command or button interaction',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  /** this is a 1-based index */
  const playerANumber = interaction.options.getInteger('player-a', true) - 1;
  /** this is a 1-based index */
  const playerBNumber = interaction.options.getInteger('player-b', true) - 1;
  const activePlayers = getSortedActivePlayers();
  // we don't need to recalculate the draftRank here
  // because it should be calculated when the draft command is run,
  // and the swap command should only be used after a draft command,
  // so the draftRank should already be set correctly.
  // If we recalculate it here,
  // it could cause issues if the MMR of the players has
  // changed since the draft command was run.
  // activePlayers.forEach((p, index) => (p.draftRank = index));
  // get the discord_id of the two players
  const playerA = activePlayers.find(p => (p.draftRank ?? NaN) === playerANumber);
  const playerB = activePlayers.find(p => (p.draftRank ?? NaN) === playerBNumber);
  // now we have the teams, and we know who to swap
  if (
    playerANumber < 0 ||
    playerANumber > activePlayers.length ||
    playerBNumber < 0 ||
    playerBNumber > activePlayers.length ||
    !playerA ||
    !playerB
  ) {
    await safeReply(interaction, {
      content: `Invalid player numbers (playerANumber: ${playerANumber + 1}, playerBNumber: ${
        playerBNumber + 1
      }, playerA: ${playerA?.discordId}, playerB: ${playerB?.discordId}) There are only ${
        activePlayers.length
      } players.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (playerA.team === playerB.team) {
    await safeReply(interaction, {
      content: `Both players are on the same team. Cannot swap.
Player A: \`team: ${playerA.team}\` \`${playerANumber + 1}: ${playerA.mmr}\` <@${playerA.discordId}>
Player B: \`team: ${playerB.team}\` \`${playerBNumber + 1}: ${playerB.mmr}\` <@${playerB.discordId}>`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // swap the teams
  // note we set playerA to playerB's team, and playerB to playerA's team
  changeTeams([
    { playerId: playerA.discordId, newTeam: playerB.team ?? null },
    { playerId: playerB.discordId, newTeam: playerA.team ?? null },
  ]);
  const { team1, team2 } = getTeams();
  await generateTeamsMessage(interaction, team1, team2);
}

/**
 * Publish the teams that are already store in the database
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns Promise<void>
 */
export async function handlePublishTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  // get the teams from the database
  const { team1, team2 } = getTeams();
  await generateTeamsMessage(interaction, team1, team2, true);
  // show the move to teams button
  const moveToTeamsBtn = new ButtonBuilder()
    .setCustomId(CommandIds.MOVE_TO_TEAMS)
    .setLabel('Move Players to Teams')
    .setStyle(ButtonStyle.Primary);
  const moveToLobbyBtn = new ButtonBuilder()
    .setCustomId(CommandIds.MOVE_TO_LOBBY)
    .setLabel('Move Players to Lobby')
    .setStyle(ButtonStyle.Danger);
  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(moveToTeamsBtn, moveToLobbyBtn)],
  });
}

export async function handleMoveToLobbyCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  // 1. Immediately defer the reply
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = getChannels(['lobby']);
  if (!result || result.length === 0) {
    await interaction.editReply({
      content: 'No lobby channel set. Please set a lobby channel first using `/set_lobby_channel`.',
    });
    return;
  }
  const lobby = getChannels(['lobby'])?.[0];
  if (!lobby) {
    await interaction.editReply({
      content: 'No lobby channel set. Please set a lobby channel first using `/set_lobby_channel`.',
    });
    return;
  }
  // move everybody to the lobby channel
  const lobbyChannel = interaction.guild?.channels.cache.get(lobby.channelId);
  if (!lobbyChannel || !(lobbyChannel instanceof VoiceChannel)) {
    await interaction.editReply({
      content: 'Lobby channel is not a valid voice channel.',
    });
    return;
  }
  const players = getActivePlayers();
  if (players.length === 0) {
    await interaction.editReply({
      content: 'No active players to move.',
    });
    return;
  }

  let numberMoved = 0;
  const totalPlayers = players.length;

  // Initial update after deferring, showing progress
  await interaction.editReply({
    content: `Moving ${totalPlayers} players to the lobby channel: ${`<@${lobby.channelId}>`}... (0/${totalPlayers} moved)`,
  });

  /** Array to store players that failed to move */
  const failedToMove: Player[] = [];
  const movePromises = players.map(async player => {
    const member = interaction.guild?.members.cache.get(player.discordId);
    if (member?.voice) {
      try {
        await member.voice.setChannel(lobbyChannel);
        numberMoved++;
      } catch (err) {
        failedToMove.push(player);
        if (err instanceof Error) {
          console.error(`Failed to move ${member?.displayName || player.discordId} to lobby:`, err.message);
        } else {
          console.error(`Failed to move ${member?.displayName || player.discordId} to lobby:`, err);
        }
      } finally {
        await interaction.editReply({
          content: `Moving ${totalPlayers} players to the lobby channel: <#${lobby.channelId}>... (${numberMoved}/${totalPlayers} moved)`,
        });
      }
    } else {
      failedToMove.push(player);
    }
  });

  await Promise.all(movePromises); // Wait for all moves (and their associated edits) to complete
  // Final update
  await interaction.editReply({
    content: `Successfully moved ${numberMoved} of ${totalPlayers} players to the lobby channel: <#${lobby.channelId}>`,
  });

  // If some failed, you might want to send a followUp or log
  if (numberMoved < totalPlayers) {
    await interaction.followUp({
      content: `Note: Failed to move ${totalPlayers - numberMoved} players:\n${failedToMove
        .map(
          player =>
            `${`<@${player.discordId}>`}: ${player.usernames.accounts
              ?.find(a => a.isPrimary)
              ?.hotsBattleTag.replace(/#.*$/, '')}`,
        )
        .join('\n')}`,
      flags: safePing(MessageFlags.Ephemeral),
    });
  }
}

export async function handleMoveToTeamsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = getChannels(['team1', 'team2']);
  if (!result || result.length === 0) {
    await interaction.editReply({
      content: 'No team channels set. Please set team channels first using `/set_channel_team_id`.',
    });
    return;
  }
  if (result.length < 2) {
    // tell them which channel they need to set
    await interaction.editReply({
      content: `You need to set both team channels using \`/set_channel_team_id\`.\nCurrently, only one team channel is set: \`${result[0].channelName}\`.`,
    });
    return;
  }
  const teams = getTeams();
  let numberMoved = 0;
  /** array for storing the ids of all the players that it failed to move: */
  const failedToMove: Player[] = [];
  for (const [index, channel] of result.entries()) {
    // result.forEach((channel, index) => {
    const teamChannel = interaction.guild?.channels.cache.get(channel.channelId);
    if (!teamChannel || !(teamChannel instanceof VoiceChannel)) {
      await interaction.editReply({
        content: `Team channel \`${channel.channelName}\` is not a valid voice channel.`,
      });
      return;
    }
    const team = index === 0 ? teams.team1 : teams.team2; // team1 for index 0, team2 for index 1
    numberMoved += await moveTeamMembersToChannel(interaction, team, teamChannel, failedToMove);
    // });
  }
  if (failedToMove.length !== 0) {
    await interaction.editReply({
      content: `Moved ${numberMoved} players to their respective team channels: ${result
        .map(c => `<#${c.channelId}>`)
        .join(', ')}\nWARNING: **${
        teams.team1.length + teams.team2.length - numberMoved
      } players could not be moved.**`,
    });
  } else {
    await interaction.editReply({
      content: `Successfully moved all ${numberMoved} players to their respective team channels: \`${result
        .map(c => c.channelName)
        .join('`, `')}\``,
    });
  }
  if (failedToMove.length > 0) {
    await interaction.followUp({
      content: `Failed to move the following players to their team channels:\n${failedToMove
        .map(
          player =>
            `${`<@${player.discordId}>`}: ${player.usernames.accounts
              ?.find(a => a.isPrimary)
              ?.hotsBattleTag.replace(/#.*$/, '')}`,
        )
        .join('\n')}`,
      flags: safePing(MessageFlags.Ephemeral),
    });
  }
}

async function moveTeamMembersToChannel(
  interaction: Interaction,
  team: Player[],
  channel: VoiceChannel,
  failedToMove: Player[],
) {
  let numberMoved = 0;
  const movePromises = team.map(async player => {
    const member = interaction.guild?.members.cache.get(player.discordId);
    if (member?.voice) {
      await member.voice
        .setChannel(channel)
        .then(() => {
          numberMoved++;
        })
        .catch(() => {
          failedToMove.push(player);
          console.error(`\nMember ${player.discordId}, ${player.usernames.discordDisplayName}, is not on discord:`);
        });
    } else {
      failedToMove.push(player);
      console.warn(
        `Member ${player.discordId}, ${player.usernames.discordDisplayName} is not in a voice channel or does not exist.`,
      );
    }
  });
  await Promise.all(movePromises);
  return numberMoved;
}

export async function handleSetChannelTeamIdCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const channel = interaction.options.getChannel('channel_id', false);
  const teamId = interaction.options.getString('team_number', false);
  if (!channel || !teamId) {
    await handleGetChannelsCommand(interaction);
    return;
  }
  if (!(channel instanceof VoiceChannel)) {
    await safeReply(interaction, {
      content: 'Please select a valid voice channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  saveChannel(teamId, channel);
  await safeReply(interaction, {
    content: `\`${teamId}\` channel set to <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleSetLobbyChannelCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (!interaction.isChatInputCommand() || interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const channel = interaction.options.getChannel('channel_id', false);
  // if channel is null
  if (channel === null) {
    // so instead list the lobby and team channels
    await handleGetChannelsCommand(interaction);
    return;
  }

  // if channel isn't guild voice, return
  if (!(channel instanceof VoiceChannel)) {
    await safeReply(interaction, {
      content: 'Please select a valid voice channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  saveChannel('lobby', channel);
  // This command is not implemented yet
  await safeReply(interaction, {
    content: `\`lobby\` channel set to <#${channel.id}>`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleGetChannelsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  const channels = getChannels(['lobby', 'team1', 'team2']);
  if (!channels || channels.length === 0) {
    await safeReply(interaction, {
      content: 'No channels set. Please set a lobby channel and team channels first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const lobbyChannel = channels.find(c => c.channelType === 'lobby');
  const team1Channel = channels.find(c => c.channelType === 'team1');
  const team2Channel = channels.find(c => c.channelType === 'team2');
  await safeReply(interaction, {
    content: `Current channels:\nLobby: ${lobbyChannel ? `<#${lobbyChannel.channelId}>` : 'Not set'}\nTeam 1: ${
      team1Channel ? `<#${team1Channel.channelId}>` : 'Not set'
    }\nTeam 2: ${team2Channel ? `<#${team2Channel.channelId}>` : 'Not set'}`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleGuideCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  // inside a command, event listener, etc.
  const exampleEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Nor's Hots Customs — Lobby Guide")
    /*
    .setDescription(
      'This is a custom lobby for Heroes of the Storm. Use the commands below to join, leave, or manage your role in the lobby.'
    )
    // this shows up in the upper right corner of the embed
    .setThumbnail(
      'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png'
    )
    */
    .setDescription(
      [
        'Commands:',
        '```🟢 /join        — Join the lobby with your battle tag',
        '                  and role',
        '🔴 /leave       — Leave the lobby',
        '🔄 /rejoin      — Rejoin the lobby',
        '✏️ /add-account — Add a HotS account',
        '🎭 /role        — Change your role```',
      ].join('\n'),
    )
    .addFields({
      name: 'Roles',
      value: `🛡️ Tank, ⚔️ Assassin, 💪 Bruiser, 💉 Healer, 🔄 Flex`,
    })
    .addFields({
      name: 'Note:',
      value: `You can select multiple roles to indicate your preferences:
\`🛡️ Tank, 💉 Healer\` — prefer tanking or healing
\`💪 Bruiser, 🔄 Flex\` — prefer bruising but comfortable filling any role
\`⚔️ Assassin, 🔄 Flex\` — prefer assassin but comfortable filling any role`,
    })
    /* .addFields(
      { name: '`/join`', value: 'Join the lobby with your Heroes of the Storm battle tag and role.' },
      { name: '`/leave`', value: 'Leave the lobby.' },
      { name: '`/rejoin`', value: 'Rejoin the lobby with your previous battle tag and role.' },
      { name: '`/add-account`', value: 'Add a HotS account.' },
      { name: '`/role`', value: 'Change your role in the lobby.' }
    )*/
    .setFooter({ text: 'Enjoy playing!' })
    .setImage(
      'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png',
    );
  await safeReply(interaction, { embeds: [exampleEmbed], flags: safePing() });
}

/**
 *
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param isButton Whether the interaction is a button interaction or not.
 * @returns
 */
export async function handlePlayersCommand(
  interaction: Interaction<CacheType>,
  onlyRaw: boolean = false,
  pingLobby: boolean = false,
) {
  // check if interaction can be replied to
  if (!interaction.isChatInputCommand() && !interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }

  const players = getActivePlayers();

  const playerList =
    players
      .map(({ discordId, usernames, role }) => {
        if (pingLobby) {
          // if pingLobby is true, mention the user
          return `${`<@${discordId}>`}: (${usernames.accounts
            ?.find(a => a.isPrimary)
            ?.hotsBattleTag.replace(/#.*$/, '')}) \`${getPlayerRolesFormatted(role)}\``;
        }
        const user = interaction.guild?.members.cache.get(discordId);
        return onlyRaw
          ? `<@${discordId}>`
          : `@${user?.displayName}` +
              `: (${usernames.accounts
                ?.find(a => a.isPrimary)
                ?.hotsBattleTag.replace(/#.*$/, '')}) \`${getPlayerRolesFormatted(role)}\``;
      })
      .join('\n') || 'No players in the lobby';
  const rawPlayerList = Object.values(players)
    .filter(player => player.active)
    .map(
      ({ usernames, role }) =>
        `${usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag.replace(/#.*$/, '')} ${role}`,
    );
  await safeReply(interaction, {
    content: `__**Players in the lobby**__: **${rawPlayerList.length}**\n${playerList}`,
    flags: safePing(onlyRaw ? MessageFlags.Ephemeral : undefined),
  });
  if (rawPlayerList.length > 0) {
    // show a public message in the channel, if there are players in the lobby
    const channel = interaction.guild?.channels.cache.find(ch => ch.name === botChannelName);
    if (channel?.isTextBased()) {
      interaction.followUp({
        content: `\`${rawPlayerList.join(',') || 'No players in the lobby'}\``,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/**
 * Handles the /players_all command interaction, which lists all registered players with pagination and sorting options.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param isButtonInteraction true if the interaction if from a button
 * @param sort 'alphabetical' | 'mmr'
 * @param ascending boolean whether to sort ascending or descending
 * @param pageString string page number as a string
 */
export async function handlePlayersAllCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  isButtonInteraction?: true,
  sort: 'alphabetical' | 'mmr' = 'mmr',
  ascending: boolean = true,
  pageString: string = '0',
) {
  let newInteraction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | undefined;
  const playerId = interaction.user.id;
  if (isButtonInteraction === undefined) {
    newInteraction = interaction;
    await interaction.deferReply({ flags: safePing(MessageFlags.Ephemeral) });
    // store the reply for later
    if (newInteraction) {
      storeInteraction(`${playerId}_${CommandIds.PLAYERS_ALL}`, interaction.channelId, interaction);
    }
  } else {
    if (interaction.isButton()) {
      await interaction.deferUpdate();
    }
    newInteraction = getStoredInteraction(`${playerId}_${CommandIds.PLAYERS_ALL}`, interaction.channelId);
  }
  const pageNumber = parseInt(pageString, 10);
  const players = getAllPlayers(pageNumber, sort, ascending);
  const playerList = players
    .map(
      ({ discordId, usernames, role, mmr }) =>
        `\`${mmr}\` <@${discordId}>: (${usernames.accounts
          ?.find(a => a.isPrimary)
          ?.hotsBattleTag.replace(/#.*$/, '')}) \`${getPlayerRolesFormatted(role)}\``,
    )
    .join('\n');
  // since the max length of a message is 2000 characters, we need to split the message into multiple messages if it exceeds the limit
  const backButton = new ButtonBuilder()
    .setCustomId(`${CommandIds.PLAYERS_ALL_PAGE}_${sort}_${ascending}_${pageNumber - 1}`)
    .setEmoji('⬅️')
    .setStyle(ButtonStyle.Secondary);
  const refreshButton = new ButtonBuilder()
    .setCustomId(`${CommandIds.PLAYERS_ALL_PAGE}_${sort}_${ascending}_${pageNumber}`)
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Primary);
  const forwardButton = new ButtonBuilder()
    .setCustomId(`${CommandIds.PLAYERS_ALL_PAGE}_${sort}_${ascending}_${pageNumber + 1}`)
    .setEmoji('➡️')
    .setStyle(ButtonStyle.Secondary);
  const buttons = [refreshButton];
  if (pageNumber > 0) {
    buttons.unshift(backButton);
  }
  if (players.length === 20) {
    buttons.push(forwardButton);
  }
  // check if newInteraction is a button interaction, if so, edit the reply
  if (newInteraction) {
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
    const sortAlphbetically = new ButtonBuilder()
      .setCustomId(
        `${CommandIds.PLAYERS_ALL_PAGE_SORT}_alphabetical_${
          sort === 'alphabetical' ? !ascending : ascending
        }_${pageNumber}`,
      )
      .setEmoji('🔤')
      .setLabel(`ABC${ascending ? '🔼' : '🔽'}`)
      .setStyle(sort === 'alphabetical' ? ButtonStyle.Primary : ButtonStyle.Secondary);
    const sortByMMR = new ButtonBuilder()
      .setCustomId(`${CommandIds.PLAYERS_ALL_PAGE_SORT}_mmr_${sort === 'mmr' ? !ascending : ascending}_${pageNumber}`)
      .setEmoji('📊')
      .setLabel(`MMR${ascending ? '🔽' : '🔼'}`)
      .setStyle(sort === 'mmr' ? ButtonStyle.Primary : ButtonStyle.Secondary);
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(sortAlphbetically, sortByMMR);
    try {
      await newInteraction.editReply({
        content: `__**All Players**__:\n${playerList}`,
        components: [row1, row2],
      });
    } catch (error) {
      await newInteraction.reply({
        content: `__**All Players**__:\n${playerList}`,
        components: [row1, row2],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/***
 * Handles the leave command interaction, marks the player as inactive and allows them to rejoin later
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 */
export async function handleLeaveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  const { player } = setPlayerActive(interaction.user.id, false); // Mark player as inactive in the database
  await updateLobbyMessage(interaction);
  if (player) {
    // Update the lobby message instead of announcing
    await safeReply(interaction, {
      content: `You left the lobby`,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(rejoinBtn)],
    });
  } else {
    await safeReply(interaction, { content: 'You are not in the lobby', flags: MessageFlags.Ephemeral });
  }
}

export async function handleClearCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  markAllPlayersInactive(); // Mark all players as inactive in the database
  await updateLobbyMessage(interaction); // Update the lobby message to show no players
  await safeReply(interaction, {
    content: 'All players have been removed from the lobby.',
    flags: MessageFlags.Ephemeral,
  });
}

/**
 *  Handles the rejoin command interaction, allows a user to rejoin the lobby with their previous battle tag and role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns
 */
export async function handleRejoinCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  newUser = false,
  pBattleTag?: string,
) {
  // first check it the user has a hotsBattleTag in the database
  const existingPlayer = getPlayerByDiscordId(interaction.user.id);
  if (!existingPlayer?.usernames.accounts?.find(a => a.isPrimary)) {
    // if they don't have a hotsBattleTag, show the modal to collect it
    await showJoinModal(interaction, pBattleTag);
    return;
  }
  const { player, updated } = setPlayerActive(interaction.user.id, true); // Mark player as active in the database
  if (player) {
    // always update the lobby message instead of announcing
    await updateLobbyMessage(interaction);
    const joinVerb = newUser ? 'joined' : 'rejoined';
    const content =
      (updated === false ? `You are already in` : `You have ${joinVerb}`) +
      ` the lobby as: \`${player.usernames.accounts
        ?.find(a => a.isPrimary)
        ?.hotsBattleTag.replace(/#.*$/, '')}\`, \`${getPlayerRolesFormatted(
        player.role,
      )}\`\nUse /leave to leave the lobby, or use the buttons below.`;
    await safeReply(interaction, {
      content,
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, addAccountBtn, roleBtn)],
    });
    return;
  }
  if (player === undefined) {
    // show a dialog to collect the battle tag and role
    await showJoinModal(interaction);
  }
}

/**
 * Shows a modal to the user to collect their battle tag and role, then returns the data to the handleJoinCommand function
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns { Promise<void> }
 */
export async function showJoinModal(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pBattleTag?: string,
): Promise<void> {
  const { hotsBattleTag, modalInteraction } = await handleUserNameModalSubmit(interaction, undefined, pBattleTag);
  if (!modalInteraction || !hotsBattleTag) {
    // If modal interaction is undefined, it means the user did not respond in time
    return;
  }
  const validationResult = validateBattleTag(hotsBattleTag);
  if (!validationResult.isValid) {
    await safeReply(modalInteraction, {
      content: `You must provide a valid Heroes of the Storm battle tag in the format \`Name#1234\`.\nYou provided: \`${hotsBattleTag}\`
${validationResult.errors.join('\n')}
${validationResult.rules}
      `,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  let roleSelectMenuDisplayed = false;
  let hpCalled = false;
  const discordData = fetchDiscordNames(modalInteraction);
  const player = getPlayerByDiscordId(modalInteraction.user.id);
  if (!player) {
    savePlayer(
      interaction,
      modalInteraction.user.id,
      {
        discordId: modalInteraction.user.id,
        usernames: { ...discordData },
        active: false,
        team: undefined,
        draftRank: NaN,
        draftOrder: NaN,
        adjustment: null,
        mmr: 0,
        lastActive: new Date(),
      },
      hotsBattleTag,
    ); // Save player data to the database with default role Flex
    hpCalled = true;
  }
  if (!player?.role) {
    // only show the edit role buttons if the player doesn't have a role yet
    await handleEditRoleCommand(modalInteraction, true, hotsBattleTag); // Show the edit role buttons
    roleSelectMenuDisplayed = true;
  }
  if (!roleSelectMenuDisplayed) {
    setPlayerActive(modalInteraction.user.id, true, hotsBattleTag);
    await updateLobbyMessage(modalInteraction);
    const reply = await safeReply(modalInteraction, {
      content: `Looking up \`${hotsBattleTag}\` please wait...`,
      flags: MessageFlags.Ephemeral,
    });
    await new Promise(resolve => setTimeout(resolve, 8000));
    await reply?.delete();
  }
  if (!hpCalled && !player?.usernames.accounts?.find(a => a.hotsBattleTag === hotsBattleTag)) {
    await handleAddHotsAccount(modalInteraction, modalInteraction.user.id, hotsBattleTag);
  }
}

export async function handleLookupByDiscordIdCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const discordId = interaction.options.getString(CommandIds.DISCORD_ID, true).replace(/[<@>]/g, '');
  const displayName = interaction.options.getString(CommandIds.DISCORD_DISPLAY_NAME, true);
  const discordName = interaction.options.getString(CommandIds.DISCORD_NAME, true);
  const discordData: DiscordUserNames = {
    discordName: discordName,
    discordGlobalName: displayName,
    discordDisplayName: displayName,
  };
  return await handleLookupCommandSub(interaction, discordId, discordData);
}

export async function handleLookupCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const member = interaction.options.getMember(CommandIds.DISCORD_ID);
  if (!member || 'user' in member === false) {
    const discordId = interaction.options.get(CommandIds.DISCORD_ID)?.value;
    // check if it's a string of numbers
    if (typeof discordId === 'string') {
      const player = getPlayerByDiscordId(discordId); // look up the player in the database by discord id
      if (player) {
        const discordData = fetchDiscordNames(interaction, discordId);
        return await handleLookupCommandSub(interaction, discordId, discordData);
      }
    }
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to look up.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const discordId = member.user.id;
  const discordData = fetchDiscordNames(interaction, discordId);
  return await handleLookupCommandSub(interaction, discordId, discordData);
  // return;
}

async function handleLookupCommandSub(
  interaction: ChatInputCommandInteraction<CacheType>,
  discordId: string,
  discordData: DiscordUserNames,
) {
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG, false) ?? '';
  const player = getPlayerByDiscordId(discordId);
  if (player || (!player && hotsBattleTag === '')) {
    const message = player
      ? `${hotsBattleTag || 'Player'} found in the lobby with role: \`${getPlayerRolesFormatted(player.role)}\``
      : `${hotsBattleTag || 'Player'} not found in the lobby, adding them with default role \`${getPlayerRolesFormatted(
          CommandIds.ROLE_FLEX,
        )}\`.`;
    // show the player's hots_accounts.hotsBattleTag
    const hotsAccounts =
      player?.usernames.accounts?.sort((a, b) => {
        const aMMR = Math.max(a.hpSlMMR || 0, a.hpArMMR || 0, a.hpQmMMR || 0);
        const bMMR = Math.max(b.hpSlMMR || 0, b.hpArMMR || 0, b.hpQmMMR || 0);
        return bMMR - aMMR;
      }) || [];
    const accounts =
      hotsAccounts
        ?.map(
          (a, index) =>
            `${index + 1}. ${Math.max(a.hpSlMMR || 0, a.hpArMMR || 0, a.hpQmMMR || 0)} ${a.hotsBattleTag}` +
            (a.isPrimary ? ' (Primary)' : ''),
        )
        .join('\n') || 'No HotS accounts';

    // get the player's highest MMR from the max player?.usernames using hpSlMMR, hpArMMR, or hpQmMMR
    const MMR = hotsAccounts.reduce((max, account) => {
      const accountMMR = Math.max(account.hpSlMMR || 0, account.hpArMMR || 0, account.hpQmMMR || 0);
      return accountMMR > max ? accountMMR : max;
    }, 0);

    const limit = interaction.options.getInteger(CommandIds.RECENT_MATCHES_LIMIT, false) ?? 13;
    const minHeroGames = interaction.options.getInteger(CommandIds.MIN_HERO_GAMES, false) ?? 5;
    const numHeroes = interaction.options.getInteger(CommandIds.NUM_HEROES, false) ?? 3;
    const matchStats = getPlayerMatchStats(discordId, limit, minHeroGames, numHeroes);

    const embed = new EmbedBuilder()
      .setTitle(`Player Lookup: ${discordData.discordDisplayName || discordData.discordName}`)
      .setColor(0x3498db)
      .setDescription(`<@${discordId}>\n${message}`)
      .addFields(
        {
          name: '👤 Discord Info',
          value: `• **Discord ID:** \`${discordId}\`\n• **discordName:** \`${discordData.discordName}\`\n• **discordGlobalName:** \`${discordData.discordGlobalName}\`\n• **Display Name:** \`${discordData.discordDisplayName}\`${player?.adjustment ? `\n• **Adjustment:** ${player.adjustment}` : ''}`,
          inline: false,
        },
        {
          name: '🎮 HotS Accounts & MMR',
          value: `**Highest MMR:** ${MMR}\n${accounts}`,
          inline: false,
        },
      );

    if (matchStats.totalGames > 0) {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      const buildEmojis = (matches: typeof matchStats.recentMatches) => {
        return matches
          .map(m => {
            if (!m.date) return m.win ? '🟩' : '🟥';
            const matchDate = new Date(m.date);
            if (isNaN(matchDate.getTime())) return m.win ? '🟩' : '🟥';

            const year = matchDate.getFullYear();
            const month = matchDate.getMonth() + 1;
            const day = matchDate.getDate();

            const matchDayStart = new Date(year, month - 1, day).getTime();
            const diffDays = Math.round((todayStart - matchDayStart) / (1000 * 60 * 60 * 24));
            const relativeStr = diffDays <= 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays}_days_ago`;

            const dateStr = matchDate
              .toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: '2-digit',
              })
              .replace(/[\s,]+/g, '_');

            const prettyDate = `${dateStr}_${relativeStr}`;

            const gcalUrl = `<http://calendar.google.com/u/0/r/day/${year}/${month}/${day}?${prettyDate}>`;
            return `[${m.win ? '🟩' : '🟥'}](${gcalUrl})`;
          })
          .join(' ');
      };

      const recentFormW = matchStats.recentMatches.filter(m => m.win).length;
      const recentFormL = matchStats.recentMatches.length - recentFormW;
      const totalRecent = matchStats.recentMatches.length;
      const recentWinRate = totalRecent > 0 ? ((recentFormW / totalRecent) * 100).toFixed(1) : '0.0';

      const matchStatsValue = `• **Career Record:** ${matchStats.totalGames} Games | ${matchStats.wins}W - ${matchStats.losses}L (${matchStats.winRate}% WR)`;
      const recentStats = `(${recentFormW}W - ${recentFormL}L, ${recentWinRate}% WR)`;

      const topHeroesStr =
        matchStats.topHeroes.length > 0
          ? matchStats.topHeroes.map((h, i) => `${i + 1}. **${h.hero}**\n(${h.games}G, ${h.winRate}% WR)`).join('\n')
          : 'N/A';

      const bestHeroesStr =
        matchStats.bestHeroes.length > 0
          ? matchStats.bestHeroes.map((h, i) => `${i + 1}. **${h.hero}**\n(${h.games}G, ${h.winRate}% WR)`).join('\n')
          : 'N/A';

      const formatBmCategory = (label: string, count: number, td: number, deaths: number) => {
        if (count <= 0 && td <= 0 && deaths <= 0) return null;
        let details = `${count} ${label}`;
        const extras: string[] = [];
        if (td > 0) extras.push(`${td} ${label.slice(0, -1)} TD`);
        if (deaths > 0) extras.push(`${deaths} ${label.slice(0, -1)} Deaths`);
        if (extras.length > 0) {
          details += `, ${extras.join(', ')}`;
        }
        return details;
      };

      const bmStr = [
        formatBmCategory(
          'B-Steps',
          matchStats.bmStats.bsteps,
          matchStats.bmStats.bstepTd,
          matchStats.bmStats.bstepDeaths,
        ),
        formatBmCategory(
          'Sprays',
          matchStats.bmStats.sprays,
          matchStats.bmStats.sprayTd,
          matchStats.bmStats.sprayDeaths,
        ),
        formatBmCategory(
          'Dances',
          matchStats.bmStats.dances,
          matchStats.bmStats.danceTd,
          matchStats.bmStats.danceDeaths,
        ),
        formatBmCategory(
          'Taunts',
          matchStats.bmStats.taunts,
          matchStats.bmStats.tauntTd,
          matchStats.bmStats.tauntDeaths,
        ),
      ]
        .filter(Boolean)
        .join('\n');

      embed.addFields({
        name: '📊 Match Stats',
        value: matchStatsValue.slice(0, 1024),
        inline: false,
      });

      const recentFormEmojis = buildEmojis(matchStats.recentMatches);
      const fullRecentValue = `${recentFormEmojis}\n${recentStats}`;

      if (fullRecentValue.length <= 1024) {
        embed.addFields({
          name: `Recent Matches (${matchStats.recentMatches.length})`,
          value: fullRecentValue,
        });
      } else if (recentFormEmojis.length <= 1024) {
        embed.addFields(
          {
            name: `Recent Matches (${matchStats.recentMatches.length})`,
            value: recentFormEmojis,
          },
          {
            name: '',
            value: recentStats,
          },
        );
      } else {
        const total = matchStats.recentMatches.length;
        let numChunks = 1;

        while (numChunks <= total) {
          const baseSize = Math.floor(total / numChunks);
          const remainder = total % numChunks;
          let allFit = true;
          let offset = 0;

          for (let i = 0; i < numChunks; i++) {
            const chunkSize = baseSize + (i < remainder ? 1 : 0);
            const chunk = matchStats.recentMatches.slice(offset, offset + chunkSize);
            offset += chunkSize;

            if (buildEmojis(chunk).length >= 1024) {
              allFit = false;
              break;
            }
          }

          if (allFit) break;
          numChunks++;
        }

        const baseSize = Math.floor(total / numChunks);
        const remainder = total % numChunks;
        let offset = 0;
        let chunkIdx = 0;

        while (chunkIdx < numChunks) {
          const chunkSize = baseSize + (chunkIdx < remainder ? 1 : 0);
          const chunk = matchStats.recentMatches.slice(offset, offset + chunkSize);
          offset += chunkSize;

          embed.addFields({
            name: chunkIdx === 0 ? `Recent Matches (${matchStats.recentMatches.length})` : '',
            value: buildEmojis(chunk),
          });

          chunkIdx++;
        }

        embed.addFields({
          name: '',
          value: recentStats,
        });
      }

      embed.addFields({
        name: '⭐ Top Played Heroes',
        value: topHeroesStr.slice(0, 1024),
        inline: true,
      });
      embed.addFields({
        name: '🏆 Best Heroes',
        value: bestHeroesStr.slice(0, 1024),
        inline: true,
      });
      if (bmStr) {
        embed.addFields({
          name: '💃 BM Highlights',
          value: bmStr.slice(0, 1024),
          inline: true,
        });
      }
    }

    const publish = interaction.options.getString(CommandIds.PUBLISH) === 'true';

    if (publish) {
      // send the message publicly
      await announce(interaction, {
        embeds: [embed],
      });
    } else {
      await safeReply(interaction, {
        embeds: [embed],
        flags: safePing(MessageFlags.Ephemeral),
      });
    }
  }
  // save the player to the database if they are not already there
  if (!player) {
    await savePlayer(
      interaction,
      discordId,
      {
        discordId,
        usernames: {
          ...discordData,
        },
        active: false,
        team: undefined,
        draftRank: NaN,
        draftOrder: NaN,
        adjustment: null,
        mmr: 0,
        lastActive: new Date(),
      },
      hotsBattleTag,
    );
    return;
  }
  // update the player's Discord data in the database
  setPlayerDiscordNames(discordId, discordData);
  // If a hotsBattleTag is provided, and does this player already have this specific battle tag?
  if (
    hotsBattleTag &&
    player.usernames.accounts?.some(a => a.hotsBattleTag.toLowerCase() === hotsBattleTag.toLowerCase())
  ) {
    setPlayerName(interaction, discordId, hotsBattleTag); // Update the player's Heroes of the Storm name in the database
  } else if (hotsBattleTag) {
    await handleAddHotsAccountCommandSub(interaction, discordId, hotsBattleTag); // Add the new battle tag to the player's accounts in the database
  }
  // return;
}

export async function handleDeletePlayerCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const member = interaction.options.getMember(CommandIds.DISCORD_ID);
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to delete.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const discordId = member.user.id;
  const { playersDeleted, hotsAccountsDeleted } = await deletePlayer(discordId);
  await updateLobbyMessage(interaction);
  // reply with the number of players and accounts deleted
  await safeReply(interaction, {
    content: `Deleted ${playersDeleted} player${
      playersDeleted === 1 ? '' : 's'
    } and ${hotsAccountsDeleted} HotS account${hotsAccountsDeleted === 1 ? '' : 's'} for Discord ID: <@${discordId}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleDeleteHotsAccountCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG, true);
  deleteHotsAccount(hotsBattleTag);
  await safeReply(interaction, {
    content: `Deleted HotS account: \`${hotsBattleTag}\`.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleRefreshLobbyMessage(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  reply: boolean = true,
) {
  await updateLobbyMessage(interaction);
  if (reply) {
    const replyMessage = await safeReply(interaction, {
      content: 'Lobby messages refreshed.',
      flags: MessageFlags.Ephemeral,
    });
    await replyMessage?.delete();
  }
}

/**
 * Handles the edit role command interaction, shows buttons to edit the user's role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param discordId The Discord ID of the user to edit the role for.
 */
export async function handleAdminShowRoleButtons(
  interaction: ButtonInteraction<CacheType> | ChatInputCommandInteraction<CacheType>,
  discordId: string,
) {
  const player = getPlayerByDiscordId(discordId); // Get player by Discord ID
  if (!player) {
    if (interaction.replied) {
      await interaction.followUp({
        content: 'You are not in the lobby. Click the button below to join.',
        flags: MessageFlags.Ephemeral,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
      });
      return;
    }
    await safeReply(interaction, {
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    });
    return;
  }
  const roles = ', current role: ' + getPlayerRolesFormatted(player.role);
  // create a button that will set this interaction to add mode
  const row2 = getEditRoleRow(discordId, CommandIds.ROLE_EDIT_REPLACE);
  const content = (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + 'Replace Mode' + roles; // Default content for the reply
  await safeReply(interaction, {
    content,
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_ADD, '➕'),
        createEditRoleButtonEnabled(discordId, CommandIds.ROLE_EDIT_REPLACE, '🔄'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REMOVE, '➖'),
      ),
      row2,
    ],
  });
}

/**
 * Handles the admin add hots account button interaction, shows a modal to collect the battle tag and adds it to the player's account
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param discordId The Discord ID of the user to add the HotS account for.
 * @returns Promise<void>
 */
export async function handleAdminAddHotsAccountButton(interaction: ButtonInteraction<CacheType>, discordId: string) {
  const { hotsBattleTag, modalInteraction } = await handleUserNameModalSubmit(interaction, discordId);
  if (!modalInteraction || !hotsBattleTag) {
    // If modal interaction is undefined, it means the user did not respond in time
    return;
  }

  const player = getPlayerByDiscordId(discordId);
  if (player) {
    await handleAddHotsAccount(modalInteraction, discordId, hotsBattleTag); // Update the player's battle tag in the database
  }
}

/**
 * Handles the join command interaction, adds the user to the lobby with their battle tag and role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 */
export async function handleJoinCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pBattleTag?: string,
) {
  if (interaction.isButton()) {
    await handleRejoinCommand(interaction, true, pBattleTag);
    return; // If it's a button interaction, we handle rejoin directly
  }
  const role = interaction.options.getString(CommandIds.ROLE, true);
  const discordData = fetchDiscordNames(interaction);
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG, true);
  const newPlayer: Player = {
    discordId: interaction.user.id,
    usernames: { ...discordData },
    role,
    active: true,
    team: undefined,
    draftRank: NaN,
    draftOrder: NaN,
    adjustment: null,
    mmr: 0,
    lastActive: new Date(),
  };
  await savePlayer(interaction, interaction.user.id, newPlayer, hotsBattleTag); // Save player data to the database
  // announce in the channel who has joined
  await handleUserJoined(interaction);
}

/**
 * Handles the user joining the lobby, announces their presence and provides buttons for further actions
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param hotsBattleTag The hots battleTag of the user who joined.
 * @param role The role of the user who joined, based on the roleMap keys.
 * @param skipReply (optional) Whether to skip the reply and just follow up with the components.
 */
async function handleUserJoined(interaction: chatOrButtonOrModal) {
  // Update the lobby message instead of announcing
  await updateLobbyMessage(interaction);

  const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(leaveBtn, addAccountBtn, roleBtn)];
  await safeReply(interaction, {
    components,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleAddHotsAccountCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (interaction.isButton()) {
    const { hotsBattleTag, modalInteraction } = await handleUserNameModalSubmit(interaction);
    if (!modalInteraction || !hotsBattleTag) {
      // If modal interaction is undefined, it means the user did not respond in time
      return;
    }
    const player = getPlayerByDiscordId(modalInteraction.user.id);
    if (player) {
      await handleAddHotsAccount(modalInteraction, modalInteraction.user.id, hotsBattleTag); // Update the player's battle tag in the database
    }
    return;
  }
  const discordId = interaction.user.id;
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG);
  // check if the battleTag is valid, it should be in the format of Name#1234
  await handleAddHotsAccountCommandSub(interaction, discordId, hotsBattleTag);
}

export async function handleAdminAddHotsAccountByDiscordIdCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction');
    return;
  }
  const discordId = interaction.options.getString(CommandIds.DISCORD_ID, true).replace(/[<@>]/g, '');
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG);
  await handleAddHotsAccountCommandSub(interaction, discordId, hotsBattleTag);
}

export async function handleAdminAddHotsAccountCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const member = interaction.options.getMember(CommandIds.DISCORD_ID);
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to look up.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG);
  // check if the battleTag is valid, it should be in the format of Name#1234
  await handleAddHotsAccountCommandSub(interaction, member.user.id, hotsBattleTag);
}

export async function handleAdminDeleteHotsAccountCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const member = interaction.options.getMember(CommandIds.DISCORD_ID);
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to look up.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG, false);
  // check if the battleTag is valid, it should be in the format of Name#1234
  await handleDeleteHotsAccountCommandSub(interaction, member.user.id, hotsBattleTag);
  await handleRefreshLobbyMessage(interaction, false);
}

export async function handleAdminPrimaryCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordIdParam?: string,
  battleTagParam?: string,
  messageIdParam?: string,
  channelIdParam?: string,
) {
  const discordId = getDiscordId(interaction, discordIdParam);
  if (!discordId) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord ID or member to look up.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    await safeReply(interaction, {
      content: 'The specified user does not exist in the database.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  } else if (!player.usernames.accounts || player.usernames.accounts.length === 0) {
    await safeReply(interaction, {
      content: 'The specified user does not have any Heroes of the Storm accounts associated with their Discord ID.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const battleTag = getBattleTag(interaction, battleTagParam);
  if (!battleTag || !messageIdParam || !channelIdParam) {
    // if they didn't provide a battle tag, then show them a list of buttons for each account the user has
    const channelId = interaction.channelId;
    const message = await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (player.usernames.accounts.length === 1) {
      // set that account as primary directly
      await setPrimaryAccount(
        interaction,
        discordId,
        player.usernames.accounts[0].hotsBattleTag,
        message.id,
        channelId,
      );
      return;
    }
    if (!battleTagParam && battleTag) {
      if (!player.usernames.accounts.some(account => account.hotsBattleTag === battleTag)) {
        // set that account as primary
        await safeReply(interaction, {
          content: `The specified battle tag \`${battleTag}\` is not associated with the user <@${discordId}>.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await setPrimaryAccount(interaction, discordId, battleTag, message.id, channelId);
      return;
    }
    const accountButtons = player.usernames.accounts.map(account => {
      return new ButtonBuilder()
        .setCustomId(
          `${CommandIds.ADMIN}_${CommandIds.PRIMARY}_${discordId}_${account.hotsBattleTag}_${message.id}_${channelId}`,
        )
        .setLabel(account.hotsBattleTag)
        .setStyle(account.isPrimary ? ButtonStyle.Primary : ButtonStyle.Secondary);
    });
    await interaction.editReply({
      content: 'Please select the account to set as primary using the buttons below.',
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...accountButtons)],
    });
    if (!message) {
      await safeReply(interaction, {
        content: 'An error occurred while trying to send the message. Please try again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    storeInteraction(message.id, interaction.channelId, interaction);
    return;
  }
  await setPrimaryAccount(interaction, discordId, battleTag, messageIdParam, channelIdParam);
}

function getDiscordId(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordIdParam?: string,
): string | undefined {
  if (discordIdParam) {
    return discordIdParam.replace(/[<@>]/g, '');
  }
  if (!interaction.isChatInputCommand()) {
    return undefined;
  }
  const member = interaction.options.getMember(CommandIds.DISCORD_ID);
  if (member && 'user' in member) {
    return member.user.id;
  }
  if (interaction.options.get(CommandIds.DISCORD_ID)) {
    const discordId = interaction.options.get(CommandIds.DISCORD_ID)?.value;
    if (typeof discordId === 'string') {
      const player = getPlayerByDiscordId(discordId); // look up the player in the database by discord id
      if (player) {
        return discordId.replace(/[<@>]/g, '');
      }
    }
  }
  return undefined;
}

function getBattleTag(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  battleTagParam?: string,
) {
  if (battleTagParam) {
    return battleTagParam;
  }
  if (!interaction.isChatInputCommand()) {
    return undefined;
  }
  return interaction.options.getString(CommandIds.BATTLE_TAG, false) ?? undefined;
}

async function handleAddHotsAccountCommandSub(
  interaction: ChatInputCommandInteraction<CacheType>,
  discordId: string,
  hotsBattleTag: string | null,
) {
  if (!hotsBattleTag) {
    // if they didn't provide a battle tag, then show them all the accounts they have associated with their discord id
    const player = getPlayerByDiscordId(discordId);
    if (!player?.usernames.accounts || player.usernames.accounts.length === 0) {
      await safeReply(interaction, {
        content: 'You have no Heroes of the Storm accounts associated with your Discord ID.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const accountsList = player.usernames.accounts
      .map(account => `* \`${account.hotsBattleTag}\` ${account.isPrimary ? '(Primary)' : ''}`)
      .join('\n');
    await safeReply(interaction, {
      content: `${
        interaction.user.id === discordId ? 'Your' : `<@${discordId}>'s`
      } associated Heroes of the Storm accounts:\n${accountsList}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await handleAddHotsAccount(interaction, discordId, hotsBattleTag);
}

async function handleDeleteHotsAccountCommandSub(
  interaction: ChatInputCommandInteraction<CacheType>,
  discordId: string,
  hotsBattleTag: string | null,
) {
  await handleDeleteHotsAccount(interaction, discordId, hotsBattleTag);
  await handleRefreshLobbyMessage(interaction, false);
}

/**
 * Handles the user name modal submission.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param discordId (optional) The Discord ID of the user, if not provided, it will use the interaction user ID.
 * @returns An object containing the battle tag and the modal interaction.
 */
async function handleUserNameModalSubmit(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordId?: string,
  pBattleTag?: string,
): Promise<{
  hotsBattleTag: string | undefined;
  modalInteraction: ModalSubmitInteraction<CacheType> | undefined;
}> {
  const previousPlayer = getPlayerByDiscordId(discordId ?? interaction.user.id);

  // create a modal with a text field to collect the battle tag
  let suggestedBattleTag =
    pBattleTag ??
    previousPlayer?.usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag ??
    previousPlayer?.usernames.accounts?.[0]?.hotsBattleTag ??
    interaction.user.displayName ??
    '';
  if (!suggestedBattleTag.includes('#')) {
    suggestedBattleTag += '#';
  }
  const battleTagInput = new TextInputBuilder()
    .setCustomId(CommandIds.BATTLE_TAG)
    .setLabel('Battle Tag (e.g. Name#1234)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Your Heroes of the Storm battle tag')
    .setValue(suggestedBattleTag); // Use previous battle tag if available
  // Add the input to an action row
  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(battleTagInput);

  // Create the modal
  const modal = new ModalBuilder().setCustomId('battleTag').setTitle('Set Your battle tag').addComponents(actionRow);
  // get the battle tag from the TextInputBuilder
  await interaction.showModal(modal);
  let modalInteraction: ModalSubmitInteraction<CacheType>;
  try {
    modalInteraction = await interaction.awaitModalSubmit({
      filter: i => i.customId === 'battleTag',
      time: 5 * 60 * 1000,
    }); // 5 minutes timeout
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'InteractionCollectorError') {
      return { hotsBattleTag: undefined, modalInteraction: undefined }; // Return undefined if the modal interaction is not received
    }
    console.error('Error awaiting modal submit:', error);
    return { hotsBattleTag: undefined, modalInteraction: undefined }; // Return undefined if the modal interaction is not received
  }
  const hotsBattleTag = modalInteraction.fields.getTextInputValue(CommandIds.BATTLE_TAG).trim();
  return { hotsBattleTag, modalInteraction };
}

function createEditRoleButtonDisabled(discordId: string, commandId: string, emoji: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(`${commandId}_${discordId}`).setLabel(emoji).setStyle(ButtonStyle.Secondary);
}

function createEditRoleButtonEnabled(discordId: string, commandId: string, emoji: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(`${commandId}_${discordId}`).setEmoji(emoji).setStyle(ButtonStyle.Primary);
}

function getEditRoleRow(discordId: string, action: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...Object.entries(roleMap).map(([key, label]) => {
      return new ButtonBuilder()
        .setCustomId(`${action}_${discordId}_${key}`) // Use the action
        .setLabel(label)
        .setStyle(ButtonStyle.Primary);
    }),
  );
}

/**
 * Handles the edit role command interaction, shows buttons to edit the user's role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns {Promise<void>}
 */
export async function handleEditRoleCommand(
  interaction: chatOrButtonOrModal,
  setActive = false,
  hotsBattleTag?: string,
): Promise<void> {
  const player = getPlayerByDiscordId(interaction.user.id); // Get player by Discord ID
  if (!player) {
    if (interaction.replied) {
      await interaction.followUp({
        content: 'You are not in the lobby. Click the button below to join.',
        flags: MessageFlags.Ephemeral,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
      });
      return;
    }
    await safeReply(interaction, {
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    });
    return;
  }
  const roles = ', current role: ' + getPlayerRolesFormatted(player.role);
  // create a button that will set this interaction to add mode
  const activeSuffix = (setActive ? '_' + CommandIds.ACTIVE : '') + (hotsBattleTag ? '_' + hotsBattleTag : '');
  const row2 = getEditRoleRow(interaction.user.id, CommandIds.ROLE_EDIT_REPLACE + activeSuffix);
  const content = (setActive ? 'You must click a role to join the lobby\n' : '') + 'Replace Mode' + roles; // Default content for the reply
  await safeReply(interaction, {
    content,
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(interaction.user.id, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonEnabled(interaction.user.id, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(interaction.user.id, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖'),
      ),
      row2,
    ],
  });
}

export async function handleEditRoleButtonCommand(
  interaction: ButtonInteraction<CacheType> | ChatInputCommandInteraction<CacheType>,
  discordId: string,
  action: string,
  role?: keyof typeof roleMap,
  setActive = false,
  hotsBattleTag?: string,
) {
  if (!interaction.isButton()) {
    await safeReply(interaction, {
      content: 'This command can only be used with buttons.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    await safeReply(interaction, {
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    });
    return;
  }
  const roles = ', current role: ' + getPlayerRolesFormatted(player.role); // Get the formatted roles of the player

  const row2 = getEditRoleRow(discordId, action);
  // Handle the role editing logic based on the action
  let setActiveNext: boolean;
  if (setActive === true && player.active === false && role !== undefined) {
    // If the action is set to active, we need to handle it differently
    setPlayerActive(discordId, true, hotsBattleTag); // Set the player as active
    setActiveNext = false; // Reset the active state for the next interaction
  } else {
    setActiveNext = setActive; // Keep the active state as is
  }
  const activeSuffix = setActiveNext ? '_' + CommandIds.ACTIVE : '';
  const activePrefix = setActive ? 'You must click a role to join the lobby\n' : ''; // Default content for the reply
  switch (action) {
    case CommandIds.ROLE_EDIT_ADD:
      showAddButtons(interaction, discordId, player, role, roles, activePrefix, row2, activeSuffix);
      break;
    case CommandIds.ROLE_EDIT_REMOVE:
      showRemoveButtons(interaction, discordId, player, role, roles, activePrefix, row2, activeSuffix);
      break;
    case CommandIds.ROLE_EDIT_REPLACE:
      showReplaceButtons(interaction, discordId, player, role, roles, activePrefix, row2, activeSuffix);
      break;
  }
  await updateLobbyMessage(interaction);
}

function showAddButtons(
  interaction: ButtonInteraction<CacheType>,
  discordId: string,
  player: Player,
  role: string | undefined,
  roles: string,
  activePrefix: string,
  row2: ActionRowBuilder<ButtonBuilder>,
  activeSuffix: string,
) {
  if (role && !player.role?.includes(role)) {
    // If the role is specified and does not exist in the player's roles, add it
    const newRoles = (player.role ?? '') + role; // Append the new role
    setPlayerRole(discordId, newRoles); // Update the player's role in the database
    roles = ', current role: ' + getPlayerRolesFormatted(newRoles);
  }
  interaction.update({
    content:
      (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + activePrefix + 'Add Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonEnabled(discordId, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖'),
      ),
      row2,
    ],
  });
}

function showRemoveButtons(
  interaction: ButtonInteraction<CacheType>,
  discordId: string,
  player: Player,
  role: string | undefined,
  roles: string,
  activePrefix: string,
  row2: ActionRowBuilder<ButtonBuilder>,
  activeSuffix: string,
) {
  if (role && player.role?.includes(role)) {
    // If the role is specified and exists in the player's roles, remove it
    const newRoles = (player.role ?? '')
      .split('')
      .filter(r => r !== role)
      .join('');
    setPlayerRole(discordId, newRoles); // Update the player's role in the database
    roles = ', current role: ' + getPlayerRolesFormatted(newRoles);
  }
  interaction.update({
    content:
      (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + activePrefix + 'Remove Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonEnabled(discordId, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖'),
      ),
      row2,
    ],
  });
}

function showReplaceButtons(
  interaction: ButtonInteraction<CacheType>,
  discordId: string,
  player: Player,
  role: string | undefined,
  roles: string,
  activePrefix: string,
  row2: ActionRowBuilder<ButtonBuilder>,
  activeSuffix: string,
) {
  if (role) {
    setPlayerRole(discordId, role);
    roles = ', current role: ' + getPlayerRolesFormatted(role);
  }
  interaction.update({
    content:
      (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + activePrefix + 'Replace Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonEnabled(discordId, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖'),
      ),
      row2,
    ],
  });
}

/**
 * gets the roles of the player as a pretty string
 * @param player The player object to get the roles from.
 * @returns A string of the player's roles, formatted as a list.
 */
function getPlayerRolesFormatted(role?: string): string {
  if (!role) {
    return 'role not set';
  }
  return role
    .split('')
    .map(r => roleMap[r])
    .join(', ');
}

export async function handleTwitchCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  // inside a command, event listener, etc.
  const exampleEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Norator's Twitch Channel")
    .setURL('https://www.twitch.tv/norator')
    .setAuthor({
      name: 'Nor is bald',
      iconURL:
        'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png',
      url: 'https://www.twitch.tv/norator',
    })
    .setDescription('Join Norator on Twitch for Heroes of the Storm content!')
    .setThumbnail(
      'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png',
    );

  await safeReply(interaction, { embeds: [exampleEmbed], flags: safePing() });
}

/**
 * Handles the move command interaction, moves a Discord member to a specified voice channel
 * @param interaction The interaction object from Discord, will be a ChatInputCommandInteraction
 * @returns <void>
 */
export async function handleMoveCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const member = interaction.options.getMember(CommandIds.DISCORD_ID);
  if (!member || 'user' in member === false) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to move.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const channel = interaction.options.getChannel('channel', true);
  if (!(channel instanceof VoiceChannel)) {
    await safeReply(interaction, {
      content: 'Please provide a valid voice channel to move the member to.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // Move the member to the specified voice channel
  const memberToMove = interaction.guild?.members.cache.get(member.user.id);
  if (memberToMove?.voice.channel) {
    try {
      await memberToMove.voice.setChannel(channel);
    } catch (error) {
      console.error('Error moving member:', error);
      await safeReply(interaction, {
        content: `Failed to move <@${member.user.id}> to <@${channel.id}>`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }
  await safeReply(interaction, {
    content: `Moved ${member.user.username} to ${channel.name}.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleDeleteMessageCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (!interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'This command can only be used as a slash command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if ((await userIsAdmin(interaction)) === false) {
    return;
  }
  const messageId = interaction.options.getString(CommandIds.MESSAGE_ID, true);
  const channel = interaction.channel;

  await deleteMessage(interaction, channel, messageId);
}

async function deleteMessage(
  interaction: ChatInputCommandInteraction<CacheType>,
  channel: TextBasedChannel | null,
  messageId: string,
) {
  try {
    let message: Message | null = null;

    // Try fetching the message from the current channel first
    if (channel) {
      try {
        message = await channel.messages.fetch(messageId);
      } catch {
        // Message not found in current channel
      }
    }

    // If not found in the current channel, search other text channels in the guild
    if (!message && interaction.guild) {
      const textChannels = interaction.guild.channels.cache.filter(ch => ch.isTextBased() && ch.id !== channel?.id);
      for (const [, ch] of textChannels) {
        try {
          message = await (ch as TextBasedChannel).messages.fetch(messageId);
          break;
        } catch {
          // Keep searching
        }
      }
    }

    if (!message) {
      await safeReply(interaction, {
        content: `Failed to delete message. Could not find message with ID \`${messageId}\` in this channel or server.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await message.delete();
    deleteLobbyMessagesById([messageId]); // if the message was a lobby message, remove it from the stored messages

    const preview = message.content
      ? `"${message.content.length > 50 ? message.content.substring(0, 50) + '...' : message.content}"`
      : `(ID: ${messageId})`;
    await safeReply(interaction, {
      content: `Deleted message: ${preview}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    await safeReply(interaction, {
      content: `Failed to delete message. Please make sure the message ID is correct.\nmessageId: ${messageId}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

function fetchDiscordNames(interaction: Interaction, id?: string): DiscordUserNames {
  const discordUser = interaction.guild?.members.cache.get(id ?? interaction.user.id)?.user;
  const discordDisplayName = discordUser?.displayName ?? 'N/A';
  const discordGlobalName = discordUser?.globalName ?? 'N/A';

  return {
    discordName: discordUser?.username ?? 'N/A',
    discordDisplayName,
    discordGlobalName,
  };
}

function getMemberFromInteraction(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>,
  pId?: string,
) {
  if (interaction.isChatInputCommand()) {
    const member = interaction.options.getMember(CommandIds.DISCORD_ID);
    const discordId = interaction.options.get(CommandIds.DISCORD_ID)?.value;
    if (!member || 'user' in member === false) {
      // check if the user is in the database
      if (discordId && typeof discordId === 'string') {
        const player = getPlayerByDiscordId(discordId);
        if (!player) {
          return null;
        }
        return discordId;
      }
      return null;
    }
    return member.user.id;
  }
  if (pId) {
    const player = getPlayerByDiscordId(pId);
    if (!player) {
      return null;
    }
    return pId;
  }
  return null;
}

export function handleAdminSetRoleCommand(interaction: ChatInputCommandInteraction<CacheType>): void;
export function handleAdminSetRoleCommand(
  interaction: ButtonInteraction<CacheType>,
  discordId: string,
  pRole: keyof typeof roleMap,
): void;
export async function handleAdminSetRoleCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordId?: string,
  pRole?: keyof typeof roleMap,
) {
  if (!userIsAdmin(interaction)) {
    return;
  }
  const member = getMemberFromInteraction(interaction, discordId);
  if (member === null) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to set their name.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const role = pRole
    ? pRole
    : interaction.isChatInputCommand() && interaction.options.getString(CommandIds.ROLE, false);
  if (interaction.isChatInputCommand() && !role) {
    const member = interaction.options.getMember(CommandIds.DISCORD_ID);
    if (member && 'user' in member) {
      await handleAdminShowRoleButtons(interaction, member.user.id);
      return;
    }
  }
  if (!role) {
    await safeReply(interaction, {
      content: 'Please provide a valid role to set for the member.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const id = member;
  const player = setPlayerRole(id, role);
  if (player === false) {
    await safeReply(interaction, {
      content: 'Player not found in the lobby. Please make sure they have joined first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // update the lobby message if the player is active
  if (player.active) {
    await updateLobbyMessage(interaction);
  }
  await safeReply(interaction, {
    content: `Set <@${id}>'s role to \`${getPlayerRolesFormatted(role)}\``,
    flags: MessageFlags.Ephemeral,
  });
  // return;
}

function getActiveFromInteraction(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pActive: boolean,
): boolean {
  if (interaction.isChatInputCommand()) {
    return interaction.options.getBoolean(CommandIds.ACTIVE, false) ?? pActive;
  }
  // If it's a button interaction, we assume the active status is true
  return pActive ?? true; // Default to true if not provided
}

export async function handleAdminSetActiveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
): Promise<void>;
export async function handleAdminSetActiveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  previousPlayersList: string[],
): Promise<void>;
export async function handleAdminSetActiveCommand(
  interaction: ButtonInteraction<CacheType>,
  pDiscordId: string,
  pActive?: boolean,
): Promise<void>;
export async function handleAdminSetActiveCommand(
  interaction: ButtonInteraction<CacheType>,
  pDiscordId: string,
  pActive?: boolean,
  isAdminActiveButton?: boolean,
): Promise<void>;
export async function handleAdminSetActiveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  pDiscordIdOrDiscordIdArray?: string | string[],
  pActive?: boolean,
  isAdminActiveButton = false,
): Promise<void> {
  if (!(await userIsAdmin(interaction))) {
    await safeReply(interaction, {
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  let pDiscordId: string | undefined = undefined;
  let previousPlayersList: string[] | undefined = undefined;
  if (Array.isArray(pDiscordIdOrDiscordIdArray)) {
    previousPlayersList = pDiscordIdOrDiscordIdArray;
  } else if (typeof pDiscordIdOrDiscordIdArray === 'string') {
    pDiscordId = pDiscordIdOrDiscordIdArray;
  }

  const discordId = getMemberFromInteraction(interaction, pDiscordId);
  if (discordId === null) {
    await handleAdminShowPlayerActiveButtons(interaction);
    return;
  }
  const storedPlayer = getPlayerByDiscordId(discordId);
  if (storedPlayer && pActive === undefined) {
    pActive = !storedPlayer.active; // Toggle the active status if not provided
  } else {
    pActive = pActive ?? true; // Default to true if not provided
  }
  const isActive = getActiveFromInteraction(interaction, pActive); // Get the active status from the interaction or use the provided value
  const id = discordId ?? pDiscordId;
  const { player, updated } = setPlayerActive(id, isActive); // Set player as active in the database
  if (!player) {
    await safeReply(interaction, {
      content: 'Player not found in the lobby. Please make sure they have joined first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (updated) {
    const adminJoinBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.JOIN}_${id}`)
      .setLabel('Admin Join')
      .setStyle(ButtonStyle.Primary);
    const adminLeaveBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.LEAVE}_${id}`)
      .setLabel('Admin Leave')
      .setStyle(ButtonStyle.Danger);
    const adminAddAccountBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.ADD_ACCOUNT}_${id}`)
      .setLabel('Admin Add Account')
      .setStyle(ButtonStyle.Secondary);
    const adminRoleBtn = new ButtonBuilder()
      .setCustomId(`${CommandIds.ROLE}_${id}`)
      .setLabel('Admin Role')
      .setStyle(ButtonStyle.Secondary);
    if (isAdminActiveButton) {
      // create a temporary reply, and then delete it
      await interaction
        .deferReply({
          flags: MessageFlags.Ephemeral,
        })
        .then(message => {
          message.delete().catch(console.error);
        })
        .catch(console.error);
    } else {
      const message = await safeReply(interaction, {
        content: `Set <@${id}>'s active status to \`${isActive ? CommandIds.ACTIVE : CommandIds.INACTIVE}\``,
        flags: MessageFlags.Ephemeral,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            isActive ? adminLeaveBtn : adminJoinBtn,
            adminAddAccountBtn,
            adminRoleBtn,
          ),
        ],
      });
    }
    await updateLobbyMessage(interaction, previousPlayersList);
  } else {
    await safeReply(interaction, {
      content: `${player.usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag.replace(/#.*$/, '')} is already ${
        isActive ? CommandIds.ACTIVE : CommandIds.INACTIVE
      }.`,
      flags: MessageFlags.Ephemeral,
    });
  }
  // return;
}

async function handleAdminShowPlayerActiveButtons(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if ((await userIsAdmin(interaction)) === false) {
    await safeReply(interaction, {
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await updateAdminActiveButtons(interaction, true);
}

/**
 * Gets the players in the voice channel with the given channel id, then looks up those players in the database and returns them as an array.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param channelId The id of the voice channel to get the players from.
 * @returns An array of Player objects that are in the voice channel and found in the database.
 */
async function getPlayersByVoiceChannelId(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  channelId: string | null,
  previousPlayersList?: string[],
): Promise<Player[]>;
async function getPlayersByVoiceChannelId(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  channelId: string | null,
): Promise<Player[]>;
async function getPlayersByVoiceChannelId(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  channelId: string | null,
  previousPlayersList?: string[],
): Promise<Player[]> {
  // get the users from the interaction's buttons
  const storedInteraction = getStoredInteraction(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}`, interaction.channelId);

  // get previously stored players from the buttons of the previously stored interaction
  const players = await getPreviousSetActivePlayers(storedInteraction);
  const previousPlayers = getLobbyPreviousPlayers(previousPlayersList);
  const activePlayers = getActivePlayers();
  players.push(...previousPlayers.filter(lp => !players.some(p => p.discordId === lp.discordId))); // add the lobby players that are not already in the players array
  players.push(...activePlayers.filter(ap => !players.some(p => p.discordId === ap.discordId))); // add the active players that are not already in the players array

  if (channelId) {
    const channel = await interaction.guild?.channels.fetch(channelId, { force: true });
    if (!channel || !(channel instanceof VoiceChannel)) {
      return players;
    }

    // add the players from the database that match the discord ids of the channel members
    players.push(
      ...channel.members
        .map(member => getPlayerByDiscordId(member.user.id))
        .filter((player): player is Player => !!player && !players.some(p => p.discordId === player.discordId)),
    ); // add the players from the channel that are not already in the players array
  }

  return players;
}

async function getPreviousSetActivePlayers(
  storedInteraction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | undefined,
): Promise<Player[]> {
  if (!storedInteraction) {
    return [];
  }
  let reply: Message | null = null;
  try {
    reply = await storedInteraction.fetchReply();
    if (!reply) {
      return [];
    }
  } catch (error) {
    // console.error('Error fetching stored interaction reply:', error);
    return [];
  }
  return (
    reply?.components.reduce<Player[]>((acc, actionRow) => {
      if ('components' in actionRow && Array.isArray(actionRow.components)) {
        for (const button of actionRow.components) {
          if (button instanceof ButtonComponent) {
            if (button.customId?.startsWith(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}_`)) {
              const parts = button.customId.split('_');
              const discordId = parts[2];
              if (discordId) {
                const player = getPlayerByDiscordId(discordId);
                if (player) {
                  acc.push(player);
                }
              }
            }
          }
        }
      }
      return acc;
    }, []) ?? []
  );
}

function getLobbyPreviousPlayers(previousPlayersList?: string[]): Player[];
function getLobbyPreviousPlayers(): Player[];
function getLobbyPreviousPlayers(previousPlayersList?: string[]): Player[] {
  const lobbyMessages = getLobbyMessages([CommandIds.NEW_GAME]);
  if (!lobbyMessages || lobbyMessages.length === 0) {
    return []; // No lobby message to update
  }
  const playerIds = previousPlayersList ?? JSON.parse(lobbyMessages[0].previousPlayersList ?? '[]');
  const players: Player[] = playerIds
    .map((discordId: string) => getPlayerByDiscordId(discordId))
    .filter((player: Player | undefined) => player !== undefined);
  return players;
}

export async function updateAdminActiveButtons(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>,
  previousPlayersList?: string[],
): Promise<void>;
export async function updateAdminActiveButtons(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>,
  newMessage?: boolean,
  fakeReply?: boolean,
): Promise<void>;
export async function updateAdminActiveButtons(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>,
  newMessageOrPreviousPlayersList?: boolean | string[],
  fakeReply = false,
): Promise<void> {
  let newMessage: boolean | undefined;
  let previousPlayersList: string[] | undefined;
  let followUp = false;
  if (typeof newMessageOrPreviousPlayersList === 'boolean') {
    newMessage = newMessageOrPreviousPlayersList;
  } else if (Array.isArray(newMessageOrPreviousPlayersList)) {
    previousPlayersList = newMessageOrPreviousPlayersList;
    newMessage = true;
  }

  if (interaction.isModalSubmit()) {
    await safeReply(interaction, {
      content: 'This command cannot be used in a modal.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const commandExecutor = interaction.user.id;

  // get the channel id that the commandExecutor is in
  const channelId = (await interaction.guild?.members.fetch(commandExecutor))?.voice.channelId ?? null;

  const players = await getPlayersByVoiceChannelId(interaction, channelId, previousPlayersList);
  if (players.length === 0) {
    await safeReply(interaction, {
      content: 'No players found in the voice channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const refreshButton = new ButtonBuilder()
    .setCustomId(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}_${CommandIds.REFRESH}`)
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Success);

  const buttons = players
    .map(player => {
      const isActive = player.active;
      return new ButtonBuilder()
        .setCustomId(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}_${player.discordId}_${!isActive}`)
        .setLabel(
          `${player.usernames.accounts?.find(account => account.isPrimary)?.hotsBattleTag.replace(/#.*$/, '') ?? player.usernames.discordGlobalName}`,
        )
        .setStyle(isActive ? ButtonStyle.Primary : ButtonStyle.Danger);
    })
    .concat(refreshButton);
  if (newMessage) {
    await createNewAdminRoleButton(interaction, buttons, followUp);
  } else {
    const storedInteraction = getStoredInteraction(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}`, interaction.channelId);
    if (!storedInteraction) {
      // just create a new message if we can't find the stored interaction, this can happen if the bot was restarted
      await createNewAdminRoleButton(interaction, buttons);
      return;
    }
    if (storedInteraction.deferred || storedInteraction.replied) {
      try {
        await storedInteraction.editReply({
          content: 'Click the buttons below to toggle the active status of the players in your voice channel.',
          components: createButtonRows(buttons),
        });
      } catch (error) {
        if (storedInteraction.deferred || storedInteraction.replied) {
          await storedInteraction?.deleteReply().catch(() => {
            console.log('Failed to delete ephemeral message');
            console.trace();
          });
        }
        await createNewAdminRoleButton(interaction, buttons);
      }
    }
    if (fakeReply) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (interaction.deferred || interaction.replied) {
        await interaction.deleteReply().catch(() => {
          console.log('Failed to delete ephemeral message');
          console.trace();
        });
      }
    }
  }
}

function createButtonRows(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const BUTTONS_PER_ROW = 5;
  const MAX_BUTTONS = 25;

  for (let i = 0; i < buttons.length && i < MAX_BUTTONS; i += BUTTONS_PER_ROW) {
    const chunk = buttons.slice(i, i + BUTTONS_PER_ROW);
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...chunk));
  }

  if (buttons.length > MAX_BUTTONS) {
    console.warn(
      `Too many buttons to display (${buttons.length}). Discord supports a maximum of ${MAX_BUTTONS} buttons per message.\n${buttons.length - MAX_BUTTONS} buttons were not shown.`,
    );
  }

  return rows;
}

async function createNewAdminRoleButton(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  buttons: ButtonBuilder[],
  followUp = false,
) {
  let message: InteractionResponse<boolean> | Message<boolean> | undefined = undefined;
  if (followUp) {
    message = await interaction.followUp({
      content: 'Click the buttons below to toggle the active status of the players in your voice channel.',
      flags: MessageFlags.Ephemeral,
      components: createButtonRows(buttons),
      withResponse: true,
    });
  } else {
    message = await safeReply(interaction, {
      content: 'Click the buttons below to toggle the active status of the players in your voice channel.',
      flags: MessageFlags.Ephemeral,
      components: createButtonRows(buttons),
      withResponse: true,
    });
  }
  if (message) {
    storeInteraction(`${CommandIds.ADMIN}_${CommandIds.ACTIVE}`, interaction.channelId, interaction);
  }
}

function findStormReplays(dir: string): string[] {
  let files: string[] = [];
  try {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(findStormReplays(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.StormReplay')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dir} for replays:`, error);
  }
  return files;
}

function formatDateToMMDDYYYY(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${month}-${day}-${year}`;
}

interface ReplayFilterParams {
  startDate: Date | null;
  endDate: Date | null;
  maxFilesLimit: number | null;
}

function parseReplayFilterParams(rawStartInput?: string | null, rawEndInput?: string | null): ReplayFilterParams {
  let maxFilesLimit: number | null = null;
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  const now = new Date();

  if (rawStartInput && rawStartInput.trim() !== '') {
    const trimmed = rawStartInput.trim();
    if (/^\d+$/.test(trimmed)) {
      maxFilesLimit = parseInt(trimmed, 10);
    } else {
      startDate = parseSingleDate(trimmed, false);
    }
  } else {
    // Default max files to 1 if no input provided
    maxFilesLimit = 8;
  }

  if (rawEndInput && rawEndInput.trim() !== '') {
    endDate = parseSingleDate(rawEndInput.trim(), true);
  }

  return { startDate, endDate, maxFilesLimit };
}

function parseSingleDate(inputStr: string, isEndOfDay: boolean): Date | null {
  const now = new Date();
  const lower = inputStr.toLowerCase();

  if (lower === 'yesterday') {
    return isEndOfDay
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
  }
  if (lower === 'today') {
    return isEndOfDay
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  let str = inputStr;
  if (/^\d{1,2}[\/\-]\d{1,2}$/.test(str)) {
    str = `${str}/${now.getFullYear()}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return isEndOfDay
      ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999)
      : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
  }
  return null;
}

function isReplayInFilterRange(
  file: string,
  replayDate: unknown,
  startDate: Date | null,
  endDate: Date | null,
): boolean {
  let fileTime: number | null = null;

  if (replayDate) {
    try {
      const d = new Date(replayDate as any);
      if (!isNaN(d.getTime())) {
        fileTime = d.getTime();
      }
    } catch {}
  }

  if (fileTime === null) {
    try {
      fileTime = fs.statSync(file).mtime.getTime();
    } catch {}
  }

  if (fileTime === null) {
    const fileName = path.basename(file);
    const match = fileName.match(/^(\d{4})[._-](\d{2})[._-](\d{2})/);
    if (match) {
      const fileDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), 12, 0, 0);
      if (!isNaN(fileDate.getTime())) {
        fileTime = fileDate.getTime();
      }
    }
  }

  if (fileTime === null) return true;

  if (startDate && fileTime < startDate.getTime()) return false;
  if (endDate && fileTime > endDate.getTime()) return false;

  return true;
}

export async function handleImportReplaysCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
) {
  if (!(await userIsAdmin(interaction))) {
    return;
  }
  if (!interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'This command can only be used as a slash command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const folderPath = '/mnt/HotsBandayd';
  const rawStartInput = interaction.options.getString(CommandIds.START_DATE_OR_COUNT);
  const rawEndInput = interaction.options.getString(CommandIds.END_DATE);
  const filterParams = parseReplayFilterParams(rawStartInput, rawEndInput);

  let files: string[] = [];
  try {
    files = findStormReplays(folderPath);
  } catch (error) {
    console.error('Error reading replay folder:', error);
    await safeReply(interaction, {
      content: `Error reading replay folder. Please make sure the folder path is correct.\n\`${folderPath}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (files.length === 0) {
    await safeReply(interaction, {
      content: `No .StormReplay files found in any Replays folder under:\n\`${folderPath}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // sort the files by date (newest first)
  files.sort((a, b) => {
    const aStat = fs.statSync(a);
    const bStat = fs.statSync(b);
    return bStat.mtime.getTime() - aStat.mtime.getTime();
  });
  const numTotalFiles = files.length;

  const maxContentLength = 1700; // Buffer for 2000 character limit
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Filter files by mtime cutoff for fast pre-filtering
  files = files.filter(file => {
    try {
      const fileStat = fs.statSync(file);
      const mtime = fileStat.mtime.getTime();
      if (filterParams.startDate && mtime < filterParams.startDate.getTime() - 86400000) {
        return false;
      }
      if (filterParams.endDate && mtime > filterParams.endDate.getTime() + 86400000) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  });

  let headerMsg = 'Found the following custom .StormReplay files';
  if (filterParams.maxFilesLimit !== null) {
    headerMsg += ` (import limit: **${filterParams.maxFilesLimit}** files)`;
  } else if (filterParams.startDate && filterParams.endDate) {
    headerMsg += ` between **${formatDateToMMDDYYYY(filterParams.startDate)}** and **${formatDateToMMDDYYYY(filterParams.endDate)}**`;
  } else if (filterParams.startDate) {
    headerMsg += ` on or after **${formatDateToMMDDYYYY(filterParams.startDate)}**`;
  }
  headerMsg += ` in:\n\`${folderPath}\`\n\n`;

  let count = 0;
  let currentChunk = headerMsg;
  let isFirstMessage = true;

  for (const file of files) {
    if (filterParams.maxFilesLimit !== null && count >= filterParams.maxFilesLimit) {
      break;
    }

    const fileName = path.basename(file);
    const replayData = await parseReplay(file);

    // Only include Custom games (mode === -1) played within the date range
    if (
      replayData &&
      replayData.mode === -1 &&
      isReplayInFilterRange(file, replayData.date, filterParams.startDate, filterParams.endDate)
    ) {
      count++;
      const replayId = saveReplayToDb(replayData);
      // copy the replay from its nested path 'file' to /mnt/NorCustoms/
      const destPath = path.join('/mnt/NorCustoms', fileName);
      try {
        fs.copyFileSync(file, destPath);
      } catch (error) {
        console.error('Error copying replay:', fileName, error);
      }
      const durationMin = Math.floor(replayData.length / 60);
      const durationSec = Math.floor(replayData.length % 60);
      const replayDate = formatDateToMMDDYYYY(new Date(replayData.date));
      const blueWin = replayData.winner === 0 ? ' 🎉' : '';
      const redWin = replayData.winner === 1 ? ' 🎉' : '';

      let entryStr = `${count.toLocaleString('en-US')}. ${fileName}\n`;
      entryStr += `  - Replay ID: ${replayId} Map: ${replayData.map}, Date: ${replayDate}, Duration: ${durationMin}m ${durationSec}s\n`;
      entryStr += `  - Winner: ${replayData.winner} Takedowns: ${replayData.team0Takedowns.toLocaleString('en-US')} - ${replayData.team1Takedowns.toLocaleString('en-US')}, Players:\n`;
      entryStr += `    Blue Team: ${blueWin} ${replayData.team0Players}\n`;
      entryStr += `    Red Team: ${redWin} ${replayData.team1Players}\n`;

      // // write the replayData to a file
      // const replayDataPath = path.join('/mnt/NorCustoms', `${fileName}.json`);
      // fs.writeFileSync(replayDataPath, JSON.stringify(replayData, null, 2));
      // console.log('replayData written to file path:', replayDataPath)
      let webhookExpired = false;
      const sendChunkUpdate = async (contentToSend: string, isFirst: boolean) => {
        if (webhookExpired) return;
        try {
          if (isFirst) {
            await interaction.editReply({ content: contentToSend });
          } else {
            await interaction.followUp({
              flags: MessageFlags.Ephemeral,
              content: contentToSend,
            });
          }
        } catch (err: any) {
          if (err?.code === 50027 || err?.status === 401 || String(err?.message).includes('Invalid Webhook Token')) {
            console.warn(
              `[import-replays] Discord interaction token expired after 15m (file ${count}). Continuing import in background...`,
            );
            webhookExpired = true;
          } else {
            console.error('Error sending Discord interaction update:', err);
          }
        }
      };

      if (isFirstMessage) {
        if (currentChunk.length + entryStr.length > maxContentLength) {
          // First message is full! Flush first message via editReply
          await sendChunkUpdate(currentChunk, true);
          isFirstMessage = false;
          currentChunk = entryStr;
        } else {
          currentChunk += entryStr;
          // Live update the first message while filling it up
          await sendChunkUpdate(currentChunk, true);
        }
      } else {
        if (currentChunk.length + entryStr.length > maxContentLength) {
          // Subsequent message is full! Send followUp message
          await sendChunkUpdate(currentChunk, false);
          currentChunk = entryStr;
        } else {
          currentChunk += entryStr;
        }
      }
    }
  }

  if (count > 0) {
    optimizeDb();
  }

  // After loop completes, append summary and send final chunk
  if (count > 0 && currentChunk.length > 0) {
    const summaryStr = `\nFinished importing **${count.toLocaleString('en-US')}** customs file${count === 1 ? '' : 's'} from ${numTotalFiles.toLocaleString('en-US')}.`;

    try {
      if (currentChunk.length + summaryStr.length <= maxContentLength) {
        currentChunk += summaryStr;
        if (isFirstMessage) {
          await interaction.editReply({ content: currentChunk });
        } else {
          await interaction.followUp({
            flags: MessageFlags.Ephemeral,
            content: currentChunk,
          });
        }
      } else {
        if (isFirstMessage) {
          await interaction.editReply({ content: currentChunk });
        } else {
          await interaction.followUp({
            flags: MessageFlags.Ephemeral,
            content: currentChunk,
          });
        }
        await interaction.followUp({
          flags: MessageFlags.Ephemeral,
          content: summaryStr,
        });
      }
    } catch (err: any) {
      console.warn(`[import-replays] Final summary could not be sent to Discord (interaction expired): ${summaryStr}`);
    }
  } else if (count === 0) {
    try {
      await interaction.editReply({
        content: `No custom .StormReplay games matched the criteria in:\n\`${folderPath}\``,
      });
    } catch {}
  }
}

export async function handleChannelCommand(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>,
) {
  if (!interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'This command can only be used as a slash command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const command = interaction.options.getString(CommandIds.COMMAND, true);
  const channel = interaction.options.getChannel(CommandIds.CHANNEL, false);
  const messageId = interaction.options.getString(CommandIds.MESSAGE_ID, false);
  const field1 = interaction.options.getString(CommandIds.FIELD1, false);
  const handler = handlers[command] ?? undefined;
  if (handler && channel && channel instanceof GuildChannel && messageId && field1) {
    await handler(channel, messageId, field1);
  } else {
    await safeReply(interaction, {
      content: 'Invalid command or missing parameters.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Checks if the user is an admin based on their Discord ID.
 * If the user is an admin, it returns true; otherwise, it replies with a message
 * indicating they do not have permission and returns false.
 * @param interaction The ChatInputCommandInteraction object from Discord
 * @returns boolean indicating if the user is an admin
 */
async function userIsAdmin(interaction: chatOrButtonOrModal): Promise<boolean> {
  const isAdmin = adminUserIds.includes(interaction.user.id);
  if (isAdmin) {
    return true;
  }
  await safeReply(interaction, {
    content: 'You do not have permission to use this command.',
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

const COMMAND1: string | undefined = process.env.COMMAND1;
const handlers: { [key: string]: (channel: GuildChannel, messageId?: string, field1?: string) => Promise<void> } = {
  ...(COMMAND1 && {
    [COMMAND1]: async (channel: GuildChannel, messageId?: string, field1?: string) => {
      if (channel instanceof TextChannel) {
        try {
          const message = await channel.messages.fetch(messageId ?? '');
          if (message) {
            await processMessageData(message, field1 ?? '');
          }
        } catch (error) {
          console.error('Error fetching message:', error);
        }
      }
    },
  }),
};

async function processMessageData(msg: Message, identifier: string) {
  if (!identifier) return;
  const reactions = msg.reactions.cache;
  const target = reactions.find(r => {
    const identifier2 = r.emoji.name;
    return identifier === identifier2;
  });
  if (target) {
    await target.remove();
  }
}
