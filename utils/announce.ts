import { Interaction } from 'discord.js';
import { botChannelName } from '../constants';

/**
 * Announces a message in the bot channel.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param message The message to announce in the bot channel.
 */
export async function announce(interaction: Interaction, message: string) {
  const channel = interaction.guild?.channels.cache.find(ch => ch.name === botChannelName);
  if (channel && channel.isTextBased()) {
    await channel.send({
      content: message,
    });
  }
}
