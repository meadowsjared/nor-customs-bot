import dotenv from 'dotenv'

dotenv.config()

process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection:', error)
})

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error)
})

import {
  ActivityType,
  ChannelType,
  Client,
  GatewayIntentBits,
  PresenceUpdateStatus,
} from 'discord.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { dispatchInteraction } from './commands/dispatcher'
import { slashCommands } from './commands/definitions'
import { botChannelName, norsServerId } from './constants'
import { setSetting } from './store/settings'
import { getBotChannel } from './utils/channel'

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
})

// reply to direct messages
client.on('messageCreate', msg => {
  if (msg.channel.type == ChannelType.DM) {
    msg.author.send('You are DMing me now!')
  }
})

client.on('guildCreate', async guild => {
  guild.commands.set(slashCommands).catch(err => console.error(`Error setting commands for guild ${guild.name}:`, err))
  let channel = await getBotChannel(guild)
  if (!channel) {
    try {
      channel = await guild.channels.create({
        name: botChannelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: ['ViewChannel', 'SendMessages'],
          },
        ],
      })
      await setSetting('bot_channel_id', channel.id, guild.id)
      console.log(`Joined new guild: ${guild.name} (ID: ${guild.id}) - Created bot channel.`)
    } catch (err) {
      console.error(`Could not create channel in guild ${guild.name}:`, err)
    }
  }

  if (channel && 'send' in channel) {
    await channel
      .send(
        `Hello! 👋 This channel (<#${channel.id}>) is configured as the bot channel for **Customs Cruncher Bot**. You can rename it anytime with \`/rename_bot_channel\` or select a different channel with \`/set_bot_channel\`.`
      )
      .catch(err => console.error(`Error sending welcome message in guild ${guild.name}:`, err))
  } else {
    try {
      const owner = await guild.fetchOwner()
      await owner.send(
        `Thanks for adding **Customs Cruncher Bot** to **${guild.name}**! 👋\n\nPlease run \`/set_bot_channel #channel\` in your server or create a text channel named \`${botChannelName}\` to complete setup.`
      )
    } catch (err) {
      console.error(`Could not DM owner of guild ${guild.name}:`, err)
    }
  }
})

client.once('clientReady', async () => {
  // Set bot status/activity
  client.user?.setPresence({
    status: 'online',
    activities: [
      {
        name: 'Customs Cruncher',
        type: ActivityType.Watching,
        url: 'https://www.twitch.tv/norator',
        state: 'Heroes of the Storm',
      },
    ],
  })

  // Log all guilds the bot is in and resolve bot channel
  client.guilds.cache.forEach(async guild => {
    guild.commands.set(slashCommands)
    const botChannel = await getBotChannel(guild)
    const channelName = botChannel && 'name' in botChannel ? botChannel.name : 'None/Not Found'
    console.log(`Guild: ${guild.name} (ID: ${guild.id}) - Bot Channel: ${channelName}`)
  })

  // List all commands in Nor's server for debugging
  client.guilds.cache
    .get(norsServerId)
    ?.commands.fetch()
    .then(commands => {
      console.log('--- Commands in Guild ---')
      commands.forEach(command => {
        console.log(`Command: ${command.name}, ID: ${command.id}`)
      })
      const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'))
      console.log(`Bot version: ${packageJson.version}`)
    })
    .catch(error => {
      console.error('Error fetching guild commands:', error)
    })

  console.log(`Bot is ready! Logged in as ${client.user?.tag}`)
  if (client.application?.id) {
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.application.id}&permissions=8&scope=bot%20applications.commands`
    console.log(`Bot Invite Link (Guild Install):\n${inviteUrl}`)
  }
})

client.on('interactionCreate', async interaction => {
  try {
    await dispatchInteraction(interaction)
  } catch (error) {
    console.error('Error handling interaction:', error)
  }
})

client.login(process.env.DISCORD_TOKEN)

// Graceful shutdown handler
const shutdown = async () => {
  console.log('Shutting down bot...')
  client.user?.setPresence({
    status: PresenceUpdateStatus.Invisible,
    activities: [{ name: 'Shutting down...', type: 0 }],
  })
  console.log('Bot disconnected')
  await new Promise(resolve => setTimeout(resolve, 1000))

  client.destroy()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
