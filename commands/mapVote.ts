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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.channel;
  if (!channel || !('send' in channel)) {
    await interaction.editReply({ content: 'Could not access current text channel.' });
    return;
  }

  const customTitle = interaction.options.getString('title') ?? 'Vote for the Next Map!';
  const sessionId = Date.now().toString();
  const createdBy = interaction.user.id;

  const { activeMaps, recentlyPlayedMaps, tallies } = getMapVoteSortedList(sessionId);
  const postedMessageIds: string[] = [];

  const talliesMap: Record<string, number> = {};
  for (const t of tallies) {
    talliesMap[t.mapId] = t.count;
  }

  // Header message
  const headerMessage = await channel.send({
    content: `# 🗺️ ${customTitle}\nClick the button for a map below to cast your vote!`,
  });
  postedMessageIds.push(headerMessage.id);

  // Group active maps into chunks of 4 per message card
  const mapGroups: MapDefinition[][] = [];
  for (let i = 0; i < activeMaps.length; i += 4) {
    mapGroups.push(activeMaps.slice(i, i + 4));
  }

  // Post map group messages (1 message per 4 maps)
  for (let groupIdx = 0; groupIdx < mapGroups.length; groupIdx++) {
    const group = mapGroups[groupIdx];
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
        .setCustomId(`mapvote:vote:${sessionId}:${mapDef.id}`)
        .setLabel(btnLabel.length > 80 ? btnLabel.substring(0, 77) + '...' : btnLabel)
        .setStyle(voteCount > 0 ? ButtonStyle.Success : ButtonStyle.Primary);

      buttonRow.addComponents(btn);
    }

    const cardMsg = await channel.send({
      embeds,
      files,
      components: [buttonRow],
    });

    postedMessageIds.push(cardMsg.id);
  }

  // Post Standings Summary card
  const summaryEmbed = buildSummaryEmbed(customTitle, tallies, recentlyPlayedMaps, false);
  const summaryMessage = await channel.send({
    embeds: [summaryEmbed],
  });

  postedMessageIds.push(summaryMessage.id);

  // Store session in DB
  startMapVoteSession(sessionId, channel.id, postedMessageIds, createdBy, customTitle);

  // Reply ephemerally to the host with the End Vote control button
  const endBtn = new ButtonBuilder()
    .setCustomId(`mapvote:end:${sessionId}`)
    .setLabel('End Vote')
    .setStyle(ButtonStyle.Danger);

  const hostControlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(endBtn);

  await interaction.editReply({
    content: `🗺️ **Map vote started in the channel!**\nAll ${activeMaps.length} map cards have been posted.\nUse the button below when you are ready to end the vote.`,
    components: [hostControlRow],
  });
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

  // Ephemeral Remove My Vote button sent to voter
  const removeBtn = new ButtonBuilder()
    .setCustomId(`mapvote:remove:${sessionId}`)
    .setLabel('Remove My Vote')
    .setStyle(ButtonStyle.Secondary);

  const removeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(removeBtn);

  await safeReply(interaction, {
    content: confirmationMsg,
    components: [removeRow],
    flags: MessageFlags.Ephemeral,
  });

  // Re-order and refresh public map card messages
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
 * Re-evaluates sorted map order and edits session group messages in Discord
 */
async function refreshMapVoteSessionMessages(channel: TextBasedChannel | null, session: MapVoteSession) {
  if (!channel || !('messages' in channel)) return;

  const { activeMaps, recentlyPlayedMaps, tallies } = getMapVoteSortedList(session.id);
  const talliesMap: Record<string, number> = {};
  for (const t of tallies) {
    talliesMap[t.mapId] = t.count;
  }

  // Group active maps into chunks of 4 maps per message card
  const mapGroups: MapDefinition[][] = [];
  for (let i = 0; i < activeMaps.length; i += 4) {
    mapGroups.push(activeMaps.slice(i, i + 4));
  }

  // Update card messages (starting at index 1 after header message)
  for (let groupIdx = 0; groupIdx < mapGroups.length && groupIdx + 1 < session.messageIds.length - 1; groupIdx++) {
    const msgId = session.messageIds[groupIdx + 1];
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
          .setCustomId(`mapvote:vote:${session.id}:${mapDef.id}`)
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

        await summaryMsg.edit({
          embeds: [summaryEmbed],
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

  // Disable buttons on all group messages
  for (let i = 1; i < session.messageIds.length - 1; i++) {
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

  // Update summary card with ended state & winner image
  const summaryMsgId = session.messageIds[session.messageIds.length - 1];
  let files: AttachmentBuilder[] = [];

  if (winnerMap) {
    const winnerPath = path.join(MAPS_ASSETS_DIR, winnerMap.imageFileName);
    if (fs.existsSync(winnerPath)) {
      files.push(new AttachmentBuilder(winnerPath, { name: winnerMap.imageFileName }));
    }
  }

  const summaryEmbed = buildSummaryEmbed(session.title ?? 'Vote Ended', tallies, recentlyPlayedMaps, true, winnerMap);

  if (summaryMsgId) {
    try {
      const summaryMsg = await channel.messages.fetch(summaryMsgId);
      if (summaryMsg) {
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
