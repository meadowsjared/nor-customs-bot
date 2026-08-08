import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  CacheType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageCreateOptions,
  MessageFlags,
  MessagePayload,
  ModalSubmitInteraction,
} from 'discord.js';
import { getBotChannel } from './channel';

type InteractionReplyOptionsFlags = MessageCreateOptions['flags'];

/**
 * Announces a message in the bot channel.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param message The message to announce in the bot channel.
 * @param flags Optional flags for the message, such as `EPHEMERAL` to make it visible only to the user.
 * @param components Optional components (buttons) to include with the message.
 * @returns The sent message object, or undefined if channel not found
 */
export async function announce(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>,
  options: string | MessagePayload | MessageCreateOptions
) {
  const channel = await getBotChannel(interaction.guild);
  if (channel && 'send' in channel) {
    return await channel.send(options);
  }

  if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
    await interaction.reply({
      content:
        '⚠️ No bot channel is configured for this server. Please ask an admin to run `/set_bot_channel #channel` or create a channel named `🫠-nor-customs`.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return undefined;
}

/**
 * Safely pings a user by returning the appropriate flags based on if we're debugging.
 * In production, it returns the provided flags. In testing, it adds the SuppressNotifications flag to prevent actual pings.
 * @param flags Optional flags to include with the message.
 * @returns The modified flags for testing or the original flags for production.
 */
export function safePing(flags?: MessageFlags) {
  const testing = process.env.DEBUG === 'true';
  if (testing) {
    return (flags ?? 0) + MessageFlags.SuppressNotifications;
  } else {
    return flags;
  }
}
