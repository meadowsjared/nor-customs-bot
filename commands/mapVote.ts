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
  getSortedMapList,
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

  const allMaps = getSortedMapList();

  // Split maps into groups of 4 (4 messages of 4 maps each for 16 maps)
  const mapGroups: MapDefinition[][] = [];
  for (let i = 0; i < allMaps.length; i += 4) {
    mapGroups.push(allMaps.slice(i, i + 4));
  }

  const postedMessageIds: string[] = [];

  // Post the 3 card group messages sequentially
  for (let groupIdx = 0; groupIdx < mapGroups.length; groupIdx++) {
    const group = mapGroups[groupIdx];
    const embeds: EmbedBuilder[] = [];
    const files: AttachmentBuilder[] = [];
    const buttonRow = new ActionRowBuilder<ButtonBuilder>();

    for (const mapDef of group) {
      const imagePath = path.join(MAPS_ASSETS_DIR, mapDef.imageFileName);
      const embed = new EmbedBuilder().setTitle(`🗺️ ${mapDef.name}`).setColor(0x3498db);

      if (fs.existsSync(imagePath)) {
        files.push(new AttachmentBuilder(imagePath, { name: mapDef.imageFileName }));
        embed.setImage(`attachment://${mapDef.imageFileName}`);
      }

      embeds.push(embed);

      const btn = new ButtonBuilder()
        .setCustomId(`${CommandIds.VOTE_MAP_BTN}_${sessionId}_${mapDef.id}`)
        .setLabel(`Vote ${mapDef.name}`)
        .setStyle(ButtonStyle.Primary);

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

  // Post the Standings Summary card as the 4th message
  const initialTallies = getMapVoteResults(sessionId);
  const summaryEmbed = buildSummaryEmbed(customTitle, initialTallies, false);
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
function buildSummaryEmbed(title: string, tallies: MapVoteTally[], isEnded: boolean, winnerMap?: MapDefinition): EmbedBuilder {
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

  // Update summary card
  await updateSummaryCard(interaction.channel, session);
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

  await updateSummaryCard(interaction.channel, session);
}

/**
 * Updates the summary card message in Discord
 */
async function updateSummaryCard(channel: TextBasedChannel | null, session: MapVoteSession) {
  if (!channel) return;
  const summaryMsgId = session.messageIds[session.messageIds.length - 1];
  if (!summaryMsgId) return;

  try {
    const summaryMsg = await channel.messages.fetch(summaryMsgId);
    if (summaryMsg) {
      const tallies = getMapVoteResults(session.id);
      const summaryEmbed = buildSummaryEmbed(session.title ?? 'Vote for the Next Map!', tallies, false);
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

  const tallies = getMapVoteResults(session.id);

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

  const summaryEmbed = buildSummaryEmbed(session.title ?? 'Vote Ended', tallies, true, winnerMap);
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

  // Disable buttons on the 3 card group messages
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

