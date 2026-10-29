import { ButtonInteraction, CacheType, ChannelType, ChatInputCommandInteraction, MessageFlags, VoiceChannel } from 'discord.js'
import { getChannels, saveChannel } from '../store/channels'
import { setSetting } from '../store/settings'
import { getBotChannel } from '../utils/channel'
import { requireGuildId, safeReply } from '../utils/interaction'

export async function handleSetChannelTeamIdCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const channel = interaction.options.getChannel('channel_id', false)
  const teamId = interaction.options.getString('team_number', false)
  if (!channel || !teamId) {
    await handleGetChannelsCommand(interaction)
    return
  }
  if (!(channel instanceof VoiceChannel)) {
    await safeReply(interaction, {
      content: 'Please select a valid voice channel.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  await saveChannel(guildId, teamId, channel)
  await safeReply(interaction, {
    content: `\`${teamId}\` channel set to <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleSetLobbyChannelCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand() || interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const channel = interaction.options.getChannel('channel_id', false)
  if (channel === null) {
    await handleGetChannelsCommand(interaction)
    return
  }

  if (!(channel instanceof VoiceChannel)) {
    await safeReply(interaction, {
      content: 'Please select a valid voice channel.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  await saveChannel(guildId, 'lobby', channel)
  await safeReply(interaction, {
    content: `\`lobby\` channel set to <#${channel.id}>`,
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleSetBotChannelCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand() || interaction.isButton()) {
    console.error('Interaction is not a chat input command')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const channel = interaction.options.getChannel('channel', true)
  if (channel.type !== ChannelType.GuildText) {
    return await safeReply(interaction, {
      content: 'Please select a valid text channel.',
      flags: MessageFlags.Ephemeral,
    })
  }

  await setSetting('bot_channel_id', channel.id, guildId)

  return await safeReply(interaction, {
    content: `Bot channel set to <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleRenameBotChannelCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand() || interaction.isButton()) {
    console.error('Interaction is not a chat input command')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const newName = interaction.options.getString('name', true)
  const channel = await getBotChannel(interaction.guild)

  if (!channel) {
    return await safeReply(interaction, {
      content: 'Bot channel is not set or not found. Use `/set_bot_channel` first.',
      flags: MessageFlags.Ephemeral,
    })
  }

  if ('setName' in channel && typeof channel.setName === 'function') {
    try {
      await channel.setName(newName)
      return await safeReply(interaction, {
        content: `Bot channel <#${channel.id}> renamed to **${newName}**!`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (error) {
      console.error('Error renaming bot channel:', error)
      return await safeReply(interaction, {
        content: 'Failed to rename bot channel. Please check bot permissions.',
        flags: MessageFlags.Ephemeral,
      })
    }
  }

  return await safeReply(interaction, {
    content: 'The configured bot channel cannot be renamed.',
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleGetChannelsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const channels = await getChannels(guildId, ['lobby', 'team1', 'team2'])
  if (!channels || channels.length === 0) {
    await safeReply(interaction, {
      content: 'No channels set. Please set a lobby channel and team channels first.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const lobbyChannel = channels.find(c => c.channelType === 'lobby')
  const team1Channel = channels.find(c => c.channelType === 'team1')
  const team2Channel = channels.find(c => c.channelType === 'team2')
  await safeReply(interaction, {
    content: `Current channels:\nLobby: ${lobbyChannel ? `<#${lobbyChannel.channelId}>` : 'Not set'}\nTeam 1: ${
      team1Channel ? `<#${team1Channel.channelId}>` : 'Not set'
    }\nTeam 2: ${team2Channel ? `<#${team2Channel.channelId}>` : 'Not set'}`,
    flags: MessageFlags.Ephemeral,
  })
}

