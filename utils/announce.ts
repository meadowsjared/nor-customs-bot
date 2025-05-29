import { ButtonInteraction, CacheType, ChatInputCommandInteraction, MessageCreateOptions } from 'discord.js';
import { botChannelName } from '../constants';

type InteractionReplyOptionsFlags = MessageCreateOptions['flags'];

/**
 * Announces a message in the bot channel.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param message The message to announce in the bot channel.
 * @param flags Optional flags for the message, such as `EPHEMERAL` to make it visible only to the user.
 */
export async function announce(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  message: string,
  flags?: InteractionReplyOptionsFlags
) {
  const channel = interaction.guild?.channels.cache.find(ch => ch.name === botChannelName);
  if (channel && channel.isTextBased()) {
    await channel.send({
      content: message,
      flags,
    });
  }
}
