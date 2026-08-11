import {
  AutocompleteInteraction,
  ButtonInteraction,
  CacheType,
  ChatInputCommandInteraction,
  Interaction,
  InteractionReplyOptions,
  MessageFlags,
  MessagePayload,
  ModalSubmitInteraction,
} from 'discord.js';
import { botChannelName, chatOrButtonOrModal } from '../constants';
import { client } from '../index';
import { getBotChannel } from './channel';

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
 * Safely replies to an interaction, using followUp if already replied
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param options The options for the reply message
 */
export async function safeReply(
  interaction: Interaction<CacheType> | chatOrButtonOrModal | undefined,
  options: string | MessagePayload | InteractionReplyOptions,
) {
  if (!interaction) {
    if (!process.env.NOR_DISCORD_ID) {
      console.error('No NOR_DISCORD_ID environment variable set.');
      return;
    }
    const guild = client.guilds.cache.get(process.env.NOR_DISCORD_ID);
    if (!guild) {
      console.error(`Guild with ID ${process.env.NOR_DISCORD_ID} not found.`);
      return;
    }
    const channel = await getBotChannel(guild);
    if (!channel || !('send' in channel)) {
      console.error(`Channel with name ${botChannelName} not found or is not text-based.`);
      return;
    }
    const message = getMessageContent(options);
    return channel.send({
      content: message,
    });
  }
  if (interaction.isRepliable() && (interaction.replied || interaction.deferred)) {
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
        if (interaction.isRepliable()) {
          return await interaction.followUp(options);
        }
      } catch (followUpError) {
        console.error('Failed to follow up on interaction:', followUpError);
      }
    }
  }
}

/**
 * Ensures an interaction occurred within a server (guild).
 * If interaction.guildId is missing (e.g. in DMs), replies with an ephemeral error message and returns null.
 * Otherwise returns the non-null string guildId.
 */
export async function requireGuildId(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>
    | AutocompleteInteraction<CacheType>
    | undefined,
): Promise<string | null> {
  if (!interaction) {
    return null;
  }
  if (!interaction.guildId) {
    await safeReply(interaction, {
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return interaction.guildId;
}
