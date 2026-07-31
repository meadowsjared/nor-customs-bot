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
  getMapVoteResults,
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
 * Starts a new map vote session in the channel
 */
export async function handleMapVoteCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  await interaction.deferReply();

  const channel = interaction.channel;
  if (!channel || !('send' in channel)) {
    await interaction.editReply({ content: 'Could not access current text channel.' });
    return;
  }

  const customTitle = interaction.options.getString('title') ?? 'Vote for the Next Map!';
  const sessionId = `session_${Date.now()}`;
  const createdBy = interaction.user.id;

  const { activeMaps, recentlyPlayedMaps, tallies } = getMapVoteSortedList(sessionId);

  // Group active maps into chunks of 4
  const mapGroups: MapDefinition[][] = [];
  for (let i = 0; i < activeMaps.length; i += 4) {
    mapGroups.push(activeMaps.slice(i, i + 4));
  }

  const postedMessageIds: string[] = [];
  const talliesMap: Record<string, number> = {};
  for (const t of tallies) {
    talliesMap[t.mapId] = t.count;
  }

  // Post map cards
  for (let groupIdx = 0; groupIdx < mapGroups.length; groupIdx++) {
    const group = mapGroups[groupIdx];
    const embeds: EmbedBuilder[] = [];
    const files: AttachmentBuilder[] = [];
    const buttonRow = new ActionRowBuilder<ButtonBuilder>();

    for (const mapDef of group) {
      const voteCount = talliesMap[mapDef.id] ?? 0;
      const countBadge = voteCount > 0 ? ` (${voteCount} vote${voteCount === 1 ? '' : 's'})` : '';
      const imagePath = path.join(MAPS_ASSETS_DIR, mapDef.imageFileName);

      const embed = new EmbedBuilder().setTitle(`🗺️ ${mapDef.name}${countBadge}`).setColor(0x3498db);

      if (fs.existsSync(imagePath)) {
        files.push(new AttachmentBuilder(imagePath, { name: mapDef.imageFileName }));
        embed.setImage(`attachment://${mapDef.imageFileName}`);
      }

      embeds.push(embed);

      const btnLabel = `Vote ${mapDef.name}${voteCount > 0 ? ` (${voteCount})` : ''}`;
      const btn = new ButtonBuilder()
        .setCustomId(`${CommandIds.VOTE_MAP_BTN}_${sessionId}_${mapDef.id}`)
        .setLabel(btnLabel.length > 80 ? btnLabel.substring(0, 77) + '...' : btnLabel)
        .setStyle(voteCount > 0 ? ButtonStyle.Success : ButtonStyle.Primary);

      buttonRow.addComponents(btn);
    }

    const groupMessage = await (groupIdx === 0
      ? interaction.editReply({
          content: `# 🗺️ ${customTitle}\nSelect a map below to cast your vote!`,
          embeds,
          files,
          components: [buttonRow],
        })
      : channel.send({
          embeds,
          files,
          components: [buttonRow],
        }));

    postedMessageIds.push(groupMessage.id);
  }

  // Post Standings Summary card
  const summaryEmbed = buildSummaryEmbed(customTitle, tallies, recentlyPlayedMaps, false);
  const controlRow = buildControlRow(sessionId, false);

  const summaryMessage = await channel.send({
    embeds: [summaryEmbed],
    components: [controlRow],
  });

  postedMessageIds.push(summaryMessage.id);

  // Store session in DB
  startMapVoteSession(sessionId, channel.id, postedMessageIds, createdBy, customTitle);
}

/**
 * Builds the live standings summary embed
 */
function buildSummaryEmbed(
  title: string,
  tallies: MapVoteTally[],
  recentlyPlayedMaps: MapDefinition[],
  isEnded: boolean,
  winnerMap?: MapDefinition,
): EmbedBuilder {
  const totalVotes = tallies.reduce((sum, t) => sum + t.count, 0);

  const embed = new EmbedBuilder()
    .setTitle(isEnded ? `🏆 Vote Closed: ${winnerMap ? winnerMap.name : 'Tie / Winner'}` : `📊 ${title} — Live Standings`)
    .setColor(isEnded ? 0x2ecc71 : 0xf1c40f)
    .setFooter({ text: `Total Votes: ${totalVotes}` })
    .setTimestamp();

  if (isEnded && winnerMap) {
    const winnerPath = path.join(MAPS_ASSETS_DIR, winnerMap.imageFileName);
    if (fs.existsSync(winnerPath)) {
      embed.setImage(`attachment://${winnerMap.imageFileName}`);
    }
  }

  // Sort tallies descending by vote count
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

  return embed;
}

/**
 * Builds control row for summary card
 */
function buildControlRow(sessionId: string, isEnded: boolean): ActionRowBuilder<ButtonBuilder> {
  const removeBtn = new ButtonBuilder()
    .setCustomId(`${CommandIds.REMOVE_MAP_VOTE}_${sessionId}`)
    .setLabel('Remove My Vote')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isEnded);

  const endBtn = new ButtonBuilder()
    .setCustomId(`${CommandIds.END_MAP_VOTE}_${sessionId}`)
    .setLabel('End Vote')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(isEnded);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(removeBtn, endBtn);
}

/**
 * Handles clicking a map vote button under any map card
 */
export async function handleVoteMapButtonClick(interaction: ButtonInteraction<CacheType>, sessionId: string, mapId: string) {
  const session = getMapVoteSessionById(sessionId);
  if (!session || !session.active) {
    await safeReply(interaction, {
      content: 'This map vote session has already ended or is no longer active.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mapDef = HOTS_MAPS.find(m => m.id === mapId);
  if (!mapDef) {
    await safeReply(interaction, { content: 'Unknown map.', flags: MessageFlags.Ephemeral });
    return;
  }

  const userName = interaction.user.displayName || interaction.user.username;
  const previousVote = getUserVote(sessionId, interaction.user.id);

  castMapVote(sessionId, interaction.user.id, userName, mapId);

  const confirmationMsg = previousVote && previousVote !== mapId
    ? `✅ Changed your vote to **${mapDef.name}**!`
    : `✅ Your vote for **${mapDef.name}** has been recorded!`;

  await safeReply(interaction, { content: confirmationMsg, flags: MessageFlags.Ephemeral });

  // Update & re-order messages
  await refreshMapVoteSessionMessages(interaction.channel, session);
}

/**
 * Handles clicking the Remove My Vote button
 */
export async function handleVoteRemoveButtonClick(interaction: ButtonInteraction<CacheType>, sessionId: string) {
  const session = getMapVoteSessionById(sessionId);
  if (!session || !session.active) {
    await safeReply(interaction, {
      content: 'This map vote session has already ended.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  removeMapVote(sessionId, interaction.user.id);
  await safeReply(interaction, { content: 'Your vote has been removed.', flags: MessageFlags.Ephemeral });

  await refreshMapVoteSessionMessages(interaction.channel, session);
}

/**
 * Re-evaluates sorted map order and edits all session messages in Discord
 */
async function refreshMapVoteSessionMessages(channel: TextBasedChannel | null, session: MapVoteSession) {
  if (!channel || !('messages' in channel)) return;

  const { activeMaps, recentlyPlayedMaps, tallies } = getMapVoteSortedList(session.id);
  const talliesMap: Record<string, number> = {};
  for (const t of tallies) {
    talliesMap[t.mapId] = t.count;
  }

  const mapGroups: MapDefinition[][] = [];
  for (let i = 0; i < activeMaps.length; i += 4) {
    mapGroups.push(activeMaps.slice(i, i + 4));
  }

  // Update card messages
  for (let groupIdx = 0; groupIdx < mapGroups.length && groupIdx < session.messageIds.length - 1; groupIdx++) {
    const msgId = session.messageIds[groupIdx];
    const group = mapGroups[groupIdx];

    try {
      const msg = await channel.messages.fetch(msgId);
      if (!msg) continue;

      const embeds: EmbedBuilder[] = [];
      const files: AttachmentBuilder[] = [];
      const buttonRow = new ActionRowBuilder<ButtonBuilder>();

      for (const mapDef of group) {
        const voteCount = talliesMap[mapDef.id] ?? 0;
        const countBadge = voteCount > 0 ? ` (${voteCount} vote${voteCount === 1 ? '' : 's'})` : '';
        const imagePath = path.join(MAPS_ASSETS_DIR, mapDef.imageFileName);

        const embed = new EmbedBuilder().setTitle(`🗺️ ${mapDef.name}${countBadge}`).setColor(voteCount > 0 ? 0x2ecc71 : 0x3498db);

        if (fs.existsSync(imagePath)) {
          files.push(new AttachmentBuilder(imagePath, { name: mapDef.imageFileName }));
          embed.setImage(`attachment://${mapDef.imageFileName}`);
        }

        embeds.push(embed);

        const btnLabel = `Vote ${mapDef.name}${voteCount > 0 ? ` (${voteCount})` : ''}`;
        const btn = new ButtonBuilder()
          .setCustomId(`${CommandIds.VOTE_MAP_BTN}_${session.id}_${mapDef.id}`)
          .setLabel(btnLabel.length > 80 ? btnLabel.substring(0, 77) + '...' : btnLabel)
          .setStyle(voteCount > 0 ? ButtonStyle.Success : ButtonStyle.Primary);

        buttonRow.addComponents(btn);
      }

      await msg.edit({
        embeds,
        files,
        components: [buttonRow],
      });
    } catch (err) {
      console.error(`Failed to refresh map vote message ${msgId}:`, err);
    }
  }

  // Update Standings Summary card
  const summaryMsgId = session.messageIds[session.messageIds.length - 1];
  if (summaryMsgId) {
    try {
      const summaryMsg = await channel.messages.fetch(summaryMsgId);
      if (summaryMsg) {
        const summaryEmbed = buildSummaryEmbed(
          session.title ?? 'Vote for the Next Map!',
          tallies,
          recentlyPlayedMaps,
          false,
        );
        const controlRow = buildControlRow(session.id, false);

        await summaryMsg.edit({
          embeds: [summaryEmbed],
          components: [controlRow],
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

  // Update summary card with ended state & winner image if applicable
  const summaryMsgId = session.messageIds[session.messageIds.length - 1];
  let files: AttachmentBuilder[] = [];

  if (winnerMap) {
    const winnerPath = path.join(MAPS_ASSETS_DIR, winnerMap.imageFileName);
    if (fs.existsSync(winnerPath)) {
      files.push(new AttachmentBuilder(winnerPath, { name: winnerMap.imageFileName }));
    }
  }

  const summaryEmbed = buildSummaryEmbed(session.title ?? 'Vote Ended', tallies, recentlyPlayedMaps, true, winnerMap);
  const controlRow = buildControlRow(session.id, true);

  if (summaryMsgId) {
    try {
      const summaryMsg = await channel.messages.fetch(summaryMsgId);
      if (summaryMsg) {
        await summaryMsg.edit({
          content: `# ${winnerText}`,
          embeds: [summaryEmbed],
          files,
          components: [controlRow],
        });
      }
    } catch (err) {
      console.error('Failed to update summary message on end vote:', err);
    }
  }

  // Disable buttons on the card group messages
  for (let i = 0; i < session.messageIds.length - 1; i++) {
    const msgId = session.messageIds[i];
    try {
      const cardMsg = await channel.messages.fetch(msgId);
      if (cardMsg) {
        const disabledRows = cardMsg.components.map(row => {
          const newRow = new ActionRowBuilder<ButtonBuilder>();
          ((row as any).components || []).forEach((comp: any) => {
            if (comp.type === ComponentType.Button) {
              newRow.addComponents(ButtonBuilder.from(comp).setDisabled(true));
            }
          });
          return newRow;
        });
        await cardMsg.edit({ components: disabledRows });
      }
    } catch (err) {
      console.error(`Failed to disable buttons on message ${msgId}:`, err);
    }
  }

  await safeReply(interaction, { content: `Map vote ended! ${winnerText}` });
}
