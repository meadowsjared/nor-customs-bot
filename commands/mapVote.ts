import fs from 'fs';
import path from 'path';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  TextBasedChannel,
} from 'discord.js';
import { adminUserIds, CommandIds } from '../constants';
import {
  castMapVote,
  deleteMapVoteSession,
  endMapVoteSession,
  getActiveMapVoteSession,
  getGameNumberTonight,
  getMapVoteSessionById,
  getMapVoteSortedList,
  getNewestMapVoteSession,
  getUserVote,
  HOTS_MAPS,
  removeMapVote,
  startMapVoteSession,
  updateMapVoteSessionMessageIds,
} from '../store/mapVote';
import { MapDefinition, MapVoteSession, MapVoteTally } from '../types/mapVote';
import { safeReply } from './index';

const MAPS_ASSETS_DIR = path.resolve(process.cwd(), 'assets', 'maps');

/**
 * Builds ActionRows containing map vote buttons (3 buttons per row to prevent line wrapping)
 */
function buildMapVoteButtonRows(
  activeMaps: MapDefinition[],
  sessionId: string,
  talliesMap: Record<string, number>,
  isEnded: boolean = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();

  for (let i = 0; i < activeMaps.length; i++) {
    const mapDef = activeMaps[i];
    const voteCount = talliesMap[mapDef.id] ?? 0;
    const btnLabel = `${mapDef.name}${voteCount > 0 ? ` (${voteCount})` : ''}`;

    const btn = new ButtonBuilder()
      .setCustomId(`mapvote:vote:${sessionId}:${mapDef.id}`)
      .setLabel(btnLabel.length > 80 ? btnLabel.substring(0, 77) + '...' : btnLabel)
      .setStyle(voteCount > 0 ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(isEnded);

    currentRow.addComponents(btn);

    // Target 3 buttons per row to fit cleanly without wrapping.
    // On 5th row (index 4), allow 4 buttons to accommodate up to 16 active maps within Discord's 5 ActionRow limit.
    const targetSize = rows.length === 4 ? 4 : 3;
    if (currentRow.components.length === targetSize || i === activeMaps.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
    }
  }

  return rows;
}

/**
 * Builds the live standings summary embed featuring the current #1 leading map's image
 */
function buildSummaryEmbed(
  title: string,
  tallies: MapVoteTally[],
  leaderMap: MapDefinition | undefined,
  recentlyPlayedMaps: MapDefinition[],
  isEnded: boolean,
  winnerMap?: MapDefinition,
): { embed: EmbedBuilder; files: AttachmentBuilder[] } {
  const totalVotes = tallies.reduce((sum, t) => sum + t.count, 0);
  const displayMap = isEnded ? winnerMap : leaderMap;

  const embed = new EmbedBuilder()
    .setTitle(
      isEnded
        ? `📊 ${title} — Final Standings`
        : `📊 ${title} — Live Standings${leaderMap ? `\nCurrent Leader: ${leaderMap.name}` : ''}`,
    )
    .setColor(isEnded ? 0x2ecc71 : 0xf1c40f)
    .setFooter({ text: `Total Votes: ${totalVotes}` })
    .setTimestamp();

  const files: AttachmentBuilder[] = [];

  if (displayMap) {
    const imagePath = path.join(MAPS_ASSETS_DIR, displayMap.imageFileName);
    if (fs.existsSync(imagePath)) {
      files.push(new AttachmentBuilder(imagePath, { name: displayMap.imageFileName }));
      embed.setImage(`attachment://${displayMap.imageFileName}`);
    }
  }

  const sortedTallies = [...tallies].sort((a, b) => b.count - a.count);

  const displayTallies = isEnded
    ? sortedTallies.filter(t => t.count > 0)
    : sortedTallies;

  const lines = displayTallies.map((t, idx) => {
    const medal = idx === 0 && t.count > 0 ? '🥇 ' : idx === 1 && t.count > 0 ? '🥈 ' : idx === 2 && t.count > 0 ? '🥉 ' : '• ';
    const votersStr = t.voters.length > 0 ? ` (${t.voters.map(v => `@${v}`).join(', ')})` : '';
    return `${medal}**${t.mapName}**: ${t.count} vote${t.count === 1 ? '' : 's'}${votersStr}`;
  });

  const descriptionText = lines.join('\n').trim();
  embed.setDescription(descriptionText.length > 0 ? descriptionText : 'No votes were cast.');

  if (recentlyPlayedMaps.length > 0) {
    const recentlyPlayedStr = recentlyPlayedMaps.map(m => `• ~~${m.name}~~`).join('\n');
    embed.addFields({
      name: '🚫 Recently Played (Last 15 hrs - Excluded)',
      value: recentlyPlayedStr,
    });
  }

  return { embed, files };
}

const activeSessionInteractions = new Map<string, ChatInputCommandInteraction<CacheType>>();

/**
 * Starts a new map vote session in the channel
 */
export async function handleMapVoteCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  // Publicly defer reply so the command response itself becomes the map buttons message
  await interaction.deferReply();

  const channel = interaction.channel;
  if (!channel || !('send' in channel)) {
    await interaction.editReply({ content: 'Could not access current text channel.' });
    return;
  }

  const userTitle = interaction.options.getString('title');
  const gameNumber = getGameNumberTonight();
  const customTitle = userTitle ? `${userTitle} - Game ${gameNumber}` : `Game ${gameNumber}`;
  const sessionId = Date.now().toString();
  const createdBy = interaction.user.id;

  // Store interaction reference to allow deleting ephemeral host control message later via webhook
  activeSessionInteractions.set(sessionId, interaction);

  const { activeMaps, recentlyPlayedMaps, tallies } = getMapVoteSortedList(sessionId);
  const postedMessageIds: string[] = [];

  const talliesMap: Record<string, number> = {};
  for (const t of tallies) {
    talliesMap[t.mapId] = t.count;
  }

  // 1. Build combined message (Header content, Standings embed, and Map Buttons)
  const buttonRows = buildMapVoteButtonRows(activeMaps, sessionId, talliesMap, false);
  const leaderMap = activeMaps.length > 0 ? activeMaps[0] : undefined;
  const { embed: summaryEmbed, files } = buildSummaryEmbed(
    customTitle,
    tallies,
    leaderMap,
    recentlyPlayedMaps,
    false,
  );

  const combinedMessage = await interaction.editReply({
    content: `# 🗺️ ${customTitle}\nClick a map button below to cast your vote!`,
    embeds: [summaryEmbed],
    components: buttonRows,
    files,
  });
  postedMessageIds.push(combinedMessage.id);

  // 3. Post End Vote / Cancel Vote Host Control Message
  const endBtn = new ButtonBuilder()
    .setCustomId(`mapvote:end:${sessionId}`)
    .setLabel('End Vote')
    .setStyle(ButtonStyle.Danger);
  const cancelBtn = new ButtonBuilder()
    .setCustomId(`mapvote:cancel:${sessionId}`)
    .setLabel('Cancel Vote')
    .setStyle(ButtonStyle.Secondary);

  const hostControlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(endBtn, cancelBtn);

  const controlMessage = await interaction.followUp({
    content: '🏁 **Host Control:** Click below when ready to end or cancel the vote.',
    flags: MessageFlags.Ephemeral,
    components: [hostControlRow],
  });
  postedMessageIds.push(controlMessage.id);

  // Store session in DB
  startMapVoteSession(sessionId, channel.id, postedMessageIds, createdBy, customTitle);
}

/**
 * Handles clicking a map vote button (acts as a toggle: clicking again removes your vote)
 */
export async function handleVoteMapButtonClick(interaction: ButtonInteraction<CacheType>, sessionId: string, mapId: string) {
  // Silently acknowledge button click without ephemeral message popups
  await interaction.deferUpdate();

  const session = getMapVoteSessionById(sessionId);
  if (!session || !session.active) {
    await interaction.followUp({
      content: 'This map vote session has already ended or is no longer active.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mapDef = HOTS_MAPS.find(m => m.id === mapId);
  if (!mapDef) {
    await interaction.followUp({
      content: 'Unknown map.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const userName = interaction.user.displayName || interaction.user.username;
  const previousVote = getUserVote(sessionId, interaction.user.id);

  if (previousVote === mapId) {
    // Voting for the same map -> TOGGLE OFF (remove vote)
    removeMapVote(sessionId, interaction.user.id);
  } else {
    // Voting for a new map -> TOGGLE ON / SWAP VOTE
    castMapVote(sessionId, interaction.user.id, userName, mapId);
  }

  // Trigger throttled refresh (max once per second per session)
  triggerSessionRefresh(interaction.channel, session);
}

/**
 * Handles clicking the Remove My Vote button
 */
export async function handleVoteRemoveButtonClick(interaction: ButtonInteraction<CacheType>, sessionId: string) {
  await interaction.deferUpdate();

  const session = getMapVoteSessionById(sessionId);
  if (!session || !session.active) {
    await interaction.followUp({
      content: 'This map vote session has already ended or is no longer active.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  removeMapVote(sessionId, interaction.user.id);
  triggerSessionRefresh(interaction.channel, session);
}

interface RefreshState {
  timer: NodeJS.Timeout | null;
  firstVoteTime: number;
}

const sessionRefreshStates = new Map<string, RefreshState>();

/**
 * Debounces channel message updates with a 1-second delay, but enforces a maximum
 * wait time of 1.5 seconds during continuous voting spam so updates remain live.
 */
function triggerSessionRefresh(channel: TextBasedChannel | null, session: MapVoteSession) {
  if (!channel || !('messages' in channel)) return;

  const now = Date.now();
  let state = sessionRefreshStates.get(session.id);

  if (!state) {
    state = { timer: null, firstVoteTime: now };
    sessionRefreshStates.set(session.id, state);
  }

  // If a timer is already counting down:
  if (state.timer) {
    // If we've been accumulating votes for >= 1.5 seconds (1500ms), force an immediate update!
    if (now - state.firstVoteTime >= 1500) {
      clearTimeout(state.timer);
      state.timer = null;
      sessionRefreshStates.delete(session.id);
      refreshMapVoteSessionMessages(channel, session);
      return;
    }

    // Otherwise, extend the 1-second debounce timer
    clearTimeout(state.timer);
  }

  // Schedule / reset the 1-second debounce timer
  state.timer = setTimeout(async () => {
    sessionRefreshStates.delete(session.id);
    await refreshMapVoteSessionMessages(channel, session);
  }, 1000);
}

/**
 * Re-evaluates sorted map order and updates the public buttons & standings message
 */
async function refreshMapVoteSessionMessages(channel: TextBasedChannel | null, session: MapVoteSession) {
  if (!channel || !('messages' in channel)) return;

  const { activeMaps, recentlyPlayedMaps, tallies } = getMapVoteSortedList(session.id);
  const talliesMap: Record<string, number> = {};
  for (const t of tallies) {
    talliesMap[t.mapId] = t.count;
  }

  // Update Combined Map Buttons & Standings Embed Message
  const voteMsgId = session.messageIds[0];
  if (voteMsgId) {
    try {
      const voteMsg = await channel.messages.fetch(voteMsgId);
      if (voteMsg) {
        const buttonRows = buildMapVoteButtonRows(activeMaps, session.id, talliesMap, false);
        const leaderMap = activeMaps.length > 0 ? activeMaps[0] : undefined;
        const { embed: summaryEmbed, files } = buildSummaryEmbed(
          session.title ?? 'Vote for the Next Map!',
          tallies,
          leaderMap,
          recentlyPlayedMaps,
          false,
        );

        await voteMsg.edit({
          embeds: [summaryEmbed],
          components: buttonRows,
          files,
        });
      }
    } catch (err) {
      console.error(`Failed to refresh map vote message ${voteMsgId}:`, err);
    }
  }

  // If there was a legacy secondary summary message from an older session, handle gracefully
  const legacySummaryMsgId = session.messageIds[1];
  if (legacySummaryMsgId) {
    try {
      const summaryMsg = await channel.messages.fetch(legacySummaryMsgId);
      if (summaryMsg) {
        const leaderMap = activeMaps.length > 0 ? activeMaps[0] : undefined;
        const { embed: summaryEmbed, files } = buildSummaryEmbed(
          session.title ?? 'Vote for the Next Map!',
          tallies,
          leaderMap,
          recentlyPlayedMaps,
          false,
        );

        await summaryMsg.edit({
          embeds: [summaryEmbed],
          files,
        });
      }
    } catch (err) {
      // Ignore legacy summary errors
    }
  }
}

/**
 * Handles ending a map vote session (via command or button)
 */
export async function handleEndMapVoteCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  sessionIdParam?: string,
) {
  if (interaction.isButton()) {
    await interaction.deferUpdate();
    try {
      await interaction.deleteReply();
    } catch (err) {
      // Ignore if already deleted
    }
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.channel;
  if (!channel || !('send' in channel) || !('messages' in channel)) {
    await safeReply(interaction, { content: 'Could not access channel messages.', flags: MessageFlags.Ephemeral });
    return;
  }

  let session: MapVoteSession | undefined;
  if (sessionIdParam) {
    session = getMapVoteSessionById(sessionIdParam);
  } else {
    session = getActiveMapVoteSession(channel.id);
  }

  if (!session || !session.active) {
    await safeReply(interaction, {
      content: 'No active map vote session found in this channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Permission check: Admin or creator
  const userId = interaction.user.id;
  const isAdmin = adminUserIds.includes(userId) || session.createdBy === userId;

  if (!isAdmin) {
    await safeReply(interaction, {
      content: 'Only admins or the user who started the vote can end it.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  endMapVoteSession(session.id);

  const { activeMaps, recentlyPlayedMaps, tallies } = getMapVoteSortedList(session.id);

  // Determine winner(s)
  const maxVotes = Math.max(...tallies.map(t => t.count));
  const winners = tallies.filter(t => t.count === maxVotes && t.count > 0);

  let winnerMap: MapDefinition | undefined;
  let winnerText = '';

  if (winners.length === 1) {
    winnerMap = HOTS_MAPS.find(m => m.id === winners[0].mapId);
    winnerText = `🏆 **Winning Map: ${winners[0].mapName}** with ${winners[0].count} vote${winners[0].count === 1 ? '' : 's'}!`;
  } else if (winners.length > 1) {
    winnerText = `🤝 **Tie between:** ${winners.map(w => `**${w.mapName}**`).join(', ')} (${maxVotes} votes each)!`;
  } else {
    winnerText = 'No votes were cast.';
  }

  const talliesMap: Record<string, number> = {};
  for (const t of tallies) {
    talliesMap[t.mapId] = t.count;
  }

  // 1. Remove map buttons from the original voting message
  const voteMsgId = session.messageIds[0];
  if (voteMsgId) {
    try {
      const voteMsg = await channel.messages.fetch(voteMsgId);
      if (voteMsg) {
        const { embed: summaryEmbed } = buildSummaryEmbed(
          session.title ?? 'Vote Ended',
          tallies,
          undefined,
          recentlyPlayedMaps,
          true,
          undefined,
        );

        await voteMsg.edit({
          content: `# 🗺️ ${session.title ?? 'Vote'}\n🔒 **Voting has closed.**`,
          embeds: [summaryEmbed],
          components: [],
          files: [],
        });
      }
    } catch (err) {
      console.error(`Failed to remove buttons on ended map vote message ${voteMsgId}:`, err);
    }
  }

  // 2. Post a NEW public message announcing the vote closure and winning map ONLY IF votes were cast
  if (winnerMap && maxVotes > 0) {
    const closedTitle = `${session.title ?? 'Game 1'} : ${winnerMap.name}`;

    const closedEmbed = new EmbedBuilder()
      .setTitle(closedTitle)
      .setDescription(winnerText)
      .setColor(0x2ecc71)
      .setTimestamp();

    const files: AttachmentBuilder[] = [];
    const imagePath = path.join(MAPS_ASSETS_DIR, winnerMap.imageFileName);
    if (fs.existsSync(imagePath)) {
      files.push(new AttachmentBuilder(imagePath, { name: winnerMap.imageFileName }));
      closedEmbed.setImage(`attachment://${winnerMap.imageFileName}`);
    }

    const winningMapAnnouncementMsg = await channel.send({
      embeds: [closedEmbed],
      files,
    });
    session.messageIds.push(winningMapAnnouncementMsg.id);
    updateMapVoteSessionMessageIds(session.id, session.messageIds);
  }

  // Delete ephemeral host control message via stored interaction webhook if ended via slash command
  const startInteraction = activeSessionInteractions.get(session.id);
  if (startInteraction) {
    const controlMsgId = session.messageIds[1];
    if (controlMsgId) {
      try {
        await startInteraction.webhook.deleteMessage(controlMsgId);
      } catch (err) {
        // Ignore if webhook expired or message already deleted
      }
    }
    activeSessionInteractions.delete(session.id);
  }

  if (!interaction.isButton()) {
    await safeReply(interaction, { content: `Map vote ended! ${winnerText}`, flags: MessageFlags.Ephemeral });
  }
}

/**
 * Cancels an active map vote session (or newest session if ended) and deletes its messages
 */
export async function handleCancelMapVoteCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  sessionIdParam?: string,
) {
  if (interaction.isButton()) {
    await interaction.deferUpdate();
    try {
      await interaction.deleteReply();
    } catch (err) {
      // Ignore if already deleted
    }
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.channel;
  if (!channel || !('messages' in channel)) {
    if (!interaction.isButton()) {
      await safeReply(interaction, { content: 'Could not access channel messages.', flags: MessageFlags.Ephemeral });
    }
    return;
  }

  let session: MapVoteSession | undefined;
  if (sessionIdParam) {
    session = getMapVoteSessionById(sessionIdParam);
  } else {
    session = getActiveMapVoteSession(channel.id) ?? getNewestMapVoteSession(channel.id);
  }

  if (!session) {
    if (!interaction.isButton()) {
      await safeReply(interaction, {
        content: 'No map vote session found in this channel.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  // Permission check: Admin or creator
  const userId = interaction.user.id;
  const isAdmin = adminUserIds.includes(userId) || session.createdBy === userId;

  if (!isAdmin) {
    if (!interaction.isButton()) {
      await safeReply(interaction, {
        content: 'Only admins or the user who started the vote can cancel it.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  deleteMapVoteSession(session.id);

  // Delete all messages stored for this session
  for (const msgId of session.messageIds) {
    if (!msgId) continue;
    try {
      const msg = await channel.messages.fetch(msgId);
      if (msg) {
        await msg.delete();
      }
    } catch (err) {
      // Ignore if message was already deleted or is ephemeral
    }
  }

  // Delete ephemeral host control message via stored interaction webhook if canceled via slash command
  const startInteraction = activeSessionInteractions.get(session.id);
  if (startInteraction) {
    const controlMsgId = session.messageIds[1];
    if (controlMsgId) {
      try {
        await startInteraction.webhook.deleteMessage(controlMsgId);
      } catch (err) {
        // Ignore if webhook expired or message already deleted
      }
    }
    activeSessionInteractions.delete(session.id);
  }

  if (!interaction.isButton()) {
    await safeReply(interaction, {
      content: '🗑️ Map vote session canceled and messages deleted.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
