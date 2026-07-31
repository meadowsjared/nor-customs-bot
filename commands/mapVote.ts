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
  endMapVoteSession,
  getActiveMapVoteSession,
  getGameNumberTonight,
  getMapVoteSessionById,
  getMapVoteSortedList,
  getUserVote,
  HOTS_MAPS,
  removeMapVote,
  startMapVoteSession,
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
        ? `🏆 ${title} Closed: ${winnerMap ? winnerMap.name : 'Tie / Winner'}`
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

  const lines = sortedTallies.map((t, idx) => {
    const medal = idx === 0 && t.count > 0 ? '🥇 ' : idx === 1 && t.count > 0 ? '🥈 ' : idx === 2 && t.count > 0 ? '🥉 ' : '• ';
    const votersStr = t.voters.length > 0 ? ` (${t.voters.map(v => `@${v}`).join(', ')})` : '';
    return `${medal}**${t.mapName}**: ${t.count} vote${t.count === 1 ? '' : 's'}${votersStr}`;
  });

  embed.setDescription(lines.join('\n'));

  if (recentlyPlayedMaps.length > 0) {
    const recentlyPlayedStr = recentlyPlayedMaps.map(m => `• ~~${m.name}~~`).join('\n');
    embed.addFields({
      name: '🚫 Recently Played (Last 15 hrs - Excluded)',
      value: recentlyPlayedStr,
    });
  }

  return { embed, files };
}

/**
 * Starts a new map vote session in the channel
 */
export async function handleMapVoteCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.channel;
  if (!channel || !('send' in channel)) {
    await interaction.editReply({ content: 'Could not access current text channel.' });
    return;
  }

  const userTitle = interaction.options.getString('title');
  const gameNumber = getGameNumberTonight();
  const customTitle = userTitle ?? `Game ${gameNumber}`;
  const sessionId = Date.now().toString();
  const createdBy = interaction.user.id;

  const { activeMaps, recentlyPlayedMaps, tallies } = getMapVoteSortedList(sessionId);
  const postedMessageIds: string[] = [];

  const talliesMap: Record<string, number> = {};
  for (const t of tallies) {
    talliesMap[t.mapId] = t.count;
  }

  // 1. Post Single Map Buttons Message (Compact Grid of Map Buttons)
  const buttonRows = buildMapVoteButtonRows(activeMaps, sessionId, talliesMap, false);
  const buttonsMessage = await channel.send({
    content: `# 🗺️ ${customTitle}\nClick a map button below to cast your vote!`,
    components: buttonRows,
  });
  postedMessageIds.push(buttonsMessage.id);

  // 2. Post Standings & Current Winning Map Image Banner Message
  const leaderMap = activeMaps.length > 0 ? activeMaps[0] : undefined;
  const { embed: summaryEmbed, files } = buildSummaryEmbed(
    customTitle,
    tallies,
    leaderMap,
    recentlyPlayedMaps,
    false,
  );

  const summaryMessage = await channel.send({
    embeds: [summaryEmbed],
    files,
  });
  postedMessageIds.push(summaryMessage.id);

  // Store session in DB
  startMapVoteSession(sessionId, channel.id, postedMessageIds, createdBy, customTitle);

  // Reply ephemerally to the host with End Vote control button
  const endBtn = new ButtonBuilder()
    .setCustomId(`mapvote:end:${sessionId}`)
    .setLabel('End Vote')
    .setStyle(ButtonStyle.Danger);

  const hostControlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(endBtn);

  await interaction.editReply({
    content: `🗺️ **Map vote started in the channel!**\nUse the button below when you are ready to end the vote.`,
    components: [hostControlRow],
  });
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

  // Refresh public map buttons & live standings message
  await refreshMapVoteSessionMessages(interaction.channel, session);
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
  await refreshMapVoteSessionMessages(interaction.channel, session);
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

  // 1. Update Map Buttons Message
  const buttonsMsgId = session.messageIds[0];
  if (buttonsMsgId) {
    try {
      const buttonsMsg = await channel.messages.fetch(buttonsMsgId);
      if (buttonsMsg) {
        const buttonRows = buildMapVoteButtonRows(activeMaps, session.id, talliesMap, false);
        await buttonsMsg.edit({
          components: buttonRows,
        });
      }
    } catch (err) {
      console.error(`Failed to refresh map buttons message ${buttonsMsgId}:`, err);
    }
  }

  // 2. Update Standings & Current Leaderboard Banner Message
  const summaryMsgId = session.messageIds[1];
  if (summaryMsgId) {
    try {
      const summaryMsg = await channel.messages.fetch(summaryMsgId);
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
      console.error('Failed to update map vote summary card:', err);
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
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.channel;
  if (!channel || !('messages' in channel)) {
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

  // Disable all map buttons on Message 1
  const buttonsMsgId = session.messageIds[0];
  if (buttonsMsgId) {
    try {
      const buttonsMsg = await channel.messages.fetch(buttonsMsgId);
      if (buttonsMsg) {
        const disabledRows = buildMapVoteButtonRows(activeMaps, session.id, talliesMap, true);
        await buttonsMsg.edit({ components: disabledRows });
      }
    } catch (err) {
      console.error(`Failed to disable buttons on message ${buttonsMsgId}:`, err);
    }
  }

  // Update summary card with ended state & winning map banner image
  const summaryMsgId = session.messageIds[1];
  if (summaryMsgId) {
    try {
      const summaryMsg = await channel.messages.fetch(summaryMsgId);
      if (summaryMsg) {
        const { embed: summaryEmbed, files } = buildSummaryEmbed(
          session.title ?? 'Vote Ended',
          tallies,
          winnerMap,
          recentlyPlayedMaps,
          true,
          winnerMap,
        );

        await summaryMsg.edit({
          content: `# ${winnerText}`,
          embeds: [summaryEmbed],
          files,
        });
      }
    } catch (err) {
      console.error('Failed to update summary message on end vote:', err);
    }
  }

  await safeReply(interaction, { content: `Map vote ended! ${winnerText}`, flags: MessageFlags.Ephemeral });
}
