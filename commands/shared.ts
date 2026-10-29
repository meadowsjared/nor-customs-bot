import dotenv from 'dotenv'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Interaction,
  Message,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextBasedChannel,
  TextInputBuilder,
  TextInputStyle,
  User,
} from 'discord.js'
import { adminUserIds, chatOrButtonOrModal, CommandIds, roleMap } from '../constants'
import { deleteLobbyMessagesById } from '../store/channels'
import { getPlayerByDiscordId } from '../store/player'
import { DiscordUserNames } from '../types/player'
import { safePing } from '../utils/announce'
import { safeReply } from '../utils/interaction'

dotenv.config()

export function formatDateToMMDDYYYY(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${month}-${day}-${year}`
}

export function extractDiscordIdFromInteraction(
  interaction: ChatInputCommandInteraction<CacheType>,
  optionName: string = CommandIds.DISCORD_ID
): string | undefined {
  const member = interaction.options.getMember(optionName)
  if (member && 'user' in member) {
    return member.user.id
  }
  const userOption = interaction.options.getUser(optionName)
  if (userOption) {
    return userOption.id
  }
  const rawDiscordId = interaction.options.get(optionName)?.value
  if (typeof rawDiscordId === 'string' && rawDiscordId.trim().length > 0) {
    return rawDiscordId.replace(/[<@!>]/g, '').trim()
  }
  return undefined
}

export function getDiscordId(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  _guildId: string,
  discordIdParam?: string
): string | undefined {
  if (discordIdParam) {
    return discordIdParam.replace(/[<@!>]/g, '')
  }
  if (!interaction.isChatInputCommand()) {
    return undefined
  }
  return extractDiscordIdFromInteraction(interaction, CommandIds.DISCORD_ID)
}

export function getBattleTag(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  battleTagParam?: string
): string | undefined {
  if (battleTagParam) {
    return battleTagParam
  }
  if (!interaction.isChatInputCommand()) {
    return undefined
  }
  return interaction.options.getString(CommandIds.BATTLE_TAG, false) ?? undefined
}

export function fetchDiscordNames(interaction: Interaction, id?: string, resolvedUser?: User | null): DiscordUserNames {
  const targetId = id ?? interaction.user.id
  const member = interaction.guild?.members.cache.get(targetId)
  const discordUser =
    member?.user ??
    resolvedUser ??
    interaction.client.users.cache.get(targetId) ??
    (targetId === interaction.user.id ? interaction.user : undefined)
  const discordDisplayName =
    member?.displayName ?? discordUser?.displayName ?? discordUser?.globalName ?? discordUser?.username ?? 'N/A'
  const discordGlobalName = discordUser?.globalName ?? discordUser?.username ?? 'N/A'

  return {
    discordName: discordUser?.username ?? 'N/A',
    discordDisplayName,
    discordGlobalName,
  }
}

export async function getMemberFromInteraction(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>,
  guildId: string,
  pId?: string
): Promise<string | null> {
  if (interaction.isChatInputCommand()) {
    const discordId = extractDiscordIdFromInteraction(interaction, CommandIds.DISCORD_ID)
    if (discordId) {
      return discordId
    }
    return null
  }
  if (pId) {
    const player = await getPlayerByDiscordId(pId, guildId)
    if (!player) {
      return null
    }
    return pId
  }
  return null
}

/**
 * Checks if the user is an admin based on their Discord ID.
 * If the user is an admin, it returns true; otherwise, it replies with a message
 * indicating they do not have permission and returns false.
 */
export async function userIsAdmin(interaction: chatOrButtonOrModal): Promise<boolean> {
  const isAdmin = adminUserIds.includes(interaction.user.id)
  if (isAdmin) {
    return true
  }
  await safeReply(interaction, {
    content: 'You do not have permission to use this command.',
    flags: MessageFlags.Ephemeral,
  })
  return false
}

export function createButtonRows(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  const BUTTONS_PER_ROW = 5
  const MAX_BUTTONS = 25

  for (let i = 0; i < buttons.length && i < MAX_BUTTONS; i += BUTTONS_PER_ROW) {
    const chunk = buttons.slice(i, i + BUTTONS_PER_ROW)
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...chunk))
  }

  if (buttons.length > MAX_BUTTONS) {
    console.warn(
      `Too many buttons to display (${buttons.length}). Discord supports a maximum of ${MAX_BUTTONS} buttons per message.\n${buttons.length - MAX_BUTTONS} buttons were not shown.`
    )
  }

  return rows
}

export function createEditRoleButtonDisabled(discordId: string, commandId: string, emoji: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(`${commandId}_${discordId}`).setLabel(emoji).setStyle(ButtonStyle.Secondary)
}

export function createEditRoleButtonEnabled(discordId: string, commandId: string, emoji: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(`${commandId}_${discordId}`).setEmoji(emoji).setStyle(ButtonStyle.Primary)
}

export function getEditRoleRow(discordId: string, action: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...Object.entries(roleMap).map(([key, label]) => {
      return new ButtonBuilder()
        .setCustomId(`${action}_${discordId}_${key}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary)
    })
  )
}

/**
 * Handles the user name modal submission.
 */
export async function handleUserNameModalSubmit(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  guildId: string,
  discordId?: string,
  pBattleTag?: string
): Promise<{
  hotsBattleTag: string | undefined
  modalInteraction: ModalSubmitInteraction<CacheType> | undefined
}> {
  const previousPlayer = await getPlayerByDiscordId(discordId ?? interaction.user.id, guildId)

  let suggestedBattleTag =
    pBattleTag ??
    previousPlayer?.usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag ??
    previousPlayer?.usernames.accounts?.[0]?.hotsBattleTag ??
    interaction.user.displayName ??
    ''
  if (!suggestedBattleTag.includes('#')) {
    suggestedBattleTag += '#'
  }
  const battleTagInput = new TextInputBuilder()
    .setCustomId(CommandIds.BATTLE_TAG)
    .setLabel('Battle Tag (e.g. Name#1234)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Your Heroes of the Storm battle tag')
    .setValue(suggestedBattleTag)

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(battleTagInput)
  const modal = new ModalBuilder().setCustomId('battleTag').setTitle('Set Your battle tag').addComponents(actionRow)

  await interaction.showModal(modal)
  let modalInteraction: ModalSubmitInteraction<CacheType>
  try {
    modalInteraction = await interaction.awaitModalSubmit({
      filter: i => i.customId === 'battleTag',
      time: 5 * 60 * 1000,
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'InteractionCollectorError') {
      return { hotsBattleTag: undefined, modalInteraction: undefined }
    }
    console.error('Error awaiting modal submit:', error)
    return { hotsBattleTag: undefined, modalInteraction: undefined }
  }
  const hotsBattleTag = modalInteraction.fields.getTextInputValue(CommandIds.BATTLE_TAG).trim()
  return { hotsBattleTag, modalInteraction }
}

export async function handleGuideCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const exampleEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle('Customs Cruncher — Lobby Guide')
    .setDescription(
      [
        'Commands:',
        '```🟢 /join        — Join the lobby with your battle tag',
        '                  and role',
        '🔴 /leave       — Leave the lobby',
        '🔄 /rejoin      — Rejoin the lobby',
        '✏️ /add-account — Add a HotS account',
        '🎭 /role        — Change your role```',
      ].join('\n')
    )
    .addFields({
      name: 'Roles',
      value: `🛡️ Tank, ⚔️ Assassin, 💪 Bruiser, 💉 Healer, 🔄 Flex`,
    })
    .addFields({
      name: 'Note:',
      value: `You can select multiple roles to indicate your preferences:
\`🛡️ Tank, 💉 Healer\` — prefer tanking or healing
\`💪 Bruiser, 🔄 Flex\` — prefer bruising but comfortable filling any role
\`⚔️ Assassin, 🔄 Flex\` — prefer assassin but comfortable filling any role`,
    })
    .setFooter({ text: 'Enjoy playing!' })
    .setImage(
      'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png'
    )
  await safeReply(interaction, { embeds: [exampleEmbed], flags: safePing() })
}

export async function handleTwitchCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const exampleEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Norator's Twitch Channel")
    .setURL('https://www.twitch.tv/norator')
    .setAuthor({
      name: 'Nor is bald',
      iconURL:
        'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png',
      url: 'https://www.twitch.tv/norator',
    })
    .setDescription('Join Norator on Twitch for Heroes of the Storm content!')
    .setThumbnail(
      'https://static-cdn.jtvnw.net/jtv_user_pictures/f9bdb9b4-911b-4f2d-8e04-f0bde098a4d9-profile_image-70x70.png'
    )

  await safeReply(interaction, { embeds: [exampleEmbed], flags: safePing() })
}

export async function handleDeleteMessageCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'This command can only be used as a slash command.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  if ((await userIsAdmin(interaction)) === false) {
    return
  }
  const messageId = interaction.options.getString(CommandIds.MESSAGE_ID, true)
  const channel = interaction.channel

  await deleteMessage(interaction, channel, messageId)
}

async function deleteMessage(
  interaction: ChatInputCommandInteraction<CacheType>,
  channel: TextBasedChannel | null,
  messageId: string
) {
  try {
    let message: Message | null = null

    if (channel) {
      try {
        message = await channel.messages.fetch(messageId)
      } catch {
        // Message not found in current channel
      }
    }

    if (!message && interaction.guild) {
      for (const [, ch] of interaction.guild.channels.cache) {
        if (ch.isTextBased() && ch.id !== channel?.id) {
          try {
            message = await ch.messages.fetch(messageId)
            break
          } catch {
            // Keep searching
          }
        }
      }
    }

    if (!message) {
      await safeReply(interaction, {
        content: `Failed to delete message. Could not find message with ID \`${messageId}\` in this channel or server.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await message.delete()
    await deleteLobbyMessagesById([messageId])

    const preview = message.content
      ? `"${message.content.length > 50 ? message.content.substring(0, 50) + '...' : message.content}"`
      : `(ID: ${messageId})`
    await safeReply(interaction, {
      content: `Deleted message: ${preview}`,
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error('Error deleting message:', error)
    await safeReply(interaction, {
      content: `Failed to delete message. Please make sure the message ID is correct.\nmessageId: ${messageId}`,
      flags: MessageFlags.Ephemeral,
    })
  }
}

const COMMAND1: string | undefined = process.env.COMMAND1
const handlers: {
  [key: string]: (channel: TextBasedChannel, messageId: string, field1?: string) => Promise<string>
} = {
  ...(COMMAND1 && {
    [COMMAND1]: async (channel: TextBasedChannel, messageId: string, field1?: string): Promise<string> => {
      const message = await channel.messages.fetch({
        message: messageId,
        force: true,
      })
      if (!message) {
        throw new Error(`Message with ID ${messageId} not found.`)
      }
      return await processMessageData(message, field1)
    },
  }),
}

async function processMessageData(msg: Message, identifier?: string): Promise<string> {
  const reactions = msg.reactions.cache
  const messageLink = `[message](${msg.url})`
  if (!identifier) {
    let removedCount = 0
    for (const [, r] of reactions) {
      await r.remove()
      removedCount++
    }
    return `Removed all reactions (${removedCount}) from ${messageLink}.`
  }
  const parsedNum = parseInt(identifier, 10)
  if (isNaN(parsedNum)) {
    const customEmojiMatch = identifier.match(/<a?:([a-zA-Z0-9_]+):(\d+)>/)
    const cleanIdentifier = customEmojiMatch ? customEmojiMatch[1] : identifier.replace(/^:|:$/g, '')
    const target = reactions.find(r => {
      const name = r.emoji.name
      const id = r.emoji.id
      return (
        name === cleanIdentifier ||
        name === identifier ||
        (id && customEmojiMatch && id === customEmojiMatch[2]) ||
        id === identifier
      )
    })
    if (target) {
      await target.remove()
      return `Removed reaction \`${target.emoji.name ?? identifier}\` from ${messageLink}.`
    }
    return `Reaction \`${identifier}\` not found on ${messageLink}.`
  }
  let countRemoved = 0
  for (const [, r] of reactions) {
    if (r.count < parsedNum) {
      await r.remove()
      countRemoved++
    }
  }
  return `Removed ${countRemoved} reactions with fewer than ${parsedNum} votes from ${messageLink}.`
}

export async function handleChannelCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | ModalSubmitInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'This command can only be used as a slash command.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const command = interaction.options.getString(CommandIds.COMMAND, true)
  const channelOption = interaction.options.getChannel(CommandIds.CHANNEL, false)
  const messageId = interaction.options.getString(CommandIds.MESSAGE_ID, false)
  const field1 = interaction.options.getString(CommandIds.FIELD1, false) ?? undefined
  const handler = handlers[command] ?? undefined

  if (!handler || !messageId) {
    await safeReply(interaction, {
      content: 'Invalid command or missing parameters.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const channel = channelOption
    ? (interaction.guild?.channels.cache.get(channelOption.id) ??
      (await interaction.guild?.channels.fetch(channelOption.id)))
    : interaction.channel

  if (!channel || !channel.isTextBased()) {
    await safeReply(interaction, {
      content: 'Target channel not found or is not a text channel.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    const resultMessage = await handler(channel, messageId, field1)
    const messageUrl = `https://discord.com/channels/${interaction.guildId ?? '@me'}/${channel.id}/${messageId}`
    let content = resultMessage || `Command \`${command}\` executed successfully.`
    if (!content.includes(messageId)) {
      content = `${content} ([view message](${messageUrl}))`
    }
    await safeReply(interaction, {
      content,
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error('Error executing channel command:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await safeReply(interaction, {
      content: `Failed to execute command: ${errorMessage}`,
      flags: MessageFlags.Ephemeral,
    })
  }
}

