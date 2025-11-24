import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  CacheType,
  ChatInputCommandInteraction,
  MessageCreateOptions,
  MessageFlags,
  ModalSubmitInteraction,
} from 'discord.js';
import { botChannelName } from '../constants';

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
  message: string,
  flags?: InteractionReplyOptionsFlags,
  components?: ActionRowBuilder<ButtonBuilder>[]
) {
  const channel = interaction.guild?.channels.cache.find(ch => ch.name === botChannelName);
  if (channel?.isTextBased()) {
    return await channel.send({
      content: message,
      flags,
      components,
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
