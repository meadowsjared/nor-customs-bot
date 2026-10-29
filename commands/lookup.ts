import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Interaction,
  MessageFlags,
  StringSelectMenuBuilder,
  User,
} from 'discord.js'
import { CommandIds } from '../constants'
import {
  getPlayerMatchStats,
  getUnlinkedReplayAccounts,
  getUnlinkedReplayAccountsForAutocomplete,
} from '../store/hotsReplays'
import {
  deleteHotsAccount,
  deletePlayer,
  findPlayersByHotSAccount,
  getAccountLoanStatusTag,
  getActivePlayers,
  getActiveSubstitutions,
  getAllPlayers,
  getAllRegisteredHotSAccounts,
  getPlayerByDiscordId,
  getPlayerRolesFormatted,
   getStoredInteraction,
  savePlayer,
  setPlayerDiscordNames,
  setPlayerName,
  storeInteraction,
} from '../store/player'
import { DiscordUserNames } from '../types/player'
import { announce, safePing } from '../utils/announce'
import { getBotChannel } from '../utils/channel'
import { requireGuildId, safeDeferUpdate, safeReply } from '../utils/interaction'
import { handleAddHotsAccountCommandSub } from './accounts'
import { updateLobbyMessage } from './lobby'
import { extractDiscordIdFromInteraction, fetchDiscordNames, formatDateToMMDDYYYY } from './shared'

/**
 * Handles the /players command interaction, which lists all active players in the lobby.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param onlyRaw Whether to only output raw mentions.
 * @param pingLobby Whether to ping the players in the lobby.
 */
export async function handlePlayersCommand(
  interaction: Interaction<CacheType>,
  onlyRaw: boolean = false,
  pingLobby: boolean = false
) {
  // check if interaction can be replied to
  if (!interaction.isChatInputCommand() && !interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const players = await getActivePlayers(guildId)

  const playerList =
    players
      .map(({ discordId, usernames, role }) => {
        const battleTag = usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag.replace(/#.*$/, '')
        const tagSuffix = battleTag ? `: (${battleTag})` : ''
        if (!discordId) {
          return `**${usernames.discordDisplayName}**${tagSuffix} \`${getPlayerRolesFormatted(role)}\``
        }
        if (pingLobby) {
          // if pingLobby is true, mention the user
          return `${`<@${discordId}>`}${tagSuffix} \`${getPlayerRolesFormatted(role)}\``
        }
        const user = interaction.guild?.members.cache.get(discordId)
        return onlyRaw
          ? `<@${discordId}>`
          : `@${user?.displayName ?? usernames.discordDisplayName}` +
              `${tagSuffix} \`${getPlayerRolesFormatted(role)}\``
      })
      .join('\n') || 'No players in the lobby'
  const rawPlayerList = Object.values(players)
    .filter(player => player.active)
    .map(
      ({ usernames, role }) =>
        `${usernames.accounts?.find(a => a.isPrimary)?.hotsBattleTag.replace(/#.*$/, '')} ${role}`
    )
  await safeReply(interaction, {
    content: `__**Players in the lobby**__: **${rawPlayerList.length}**\n${playerList}`,
    flags: safePing(onlyRaw ? MessageFlags.Ephemeral : undefined),
  })
  if (rawPlayerList.length > 0) {
    // show a public message in the channel, if there are players in the lobby
    const channel = await getBotChannel(interaction.guild)
    if (channel && 'send' in channel) {
      interaction.followUp({
        content: `\`${rawPlayerList.join(',') || 'No players in the lobby'}\``,
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}

/**
 * Handles the /players_all command interaction, which lists all registered players with pagination and sorting options.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param isButtonInteraction true if the interaction if from a button
 * @param sort 'alphabetical' | 'mmr'
 * @param ascending boolean whether to sort ascending or descending
 * @param pageString string page number as a string
 */
export async function handlePlayersAllCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  isButtonInteraction?: true,
  sort: 'alphabetical' | 'mmr' = 'mmr',
  ascending: boolean = true,
  pageString: string = '0'
) {
  let newInteraction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | undefined
  const playerId = interaction.user.id
  if (isButtonInteraction === undefined) {
    newInteraction = interaction
    await interaction.deferReply({ flags: safePing(MessageFlags.Ephemeral) })
    // store the reply for later
    if (newInteraction) {
      storeInteraction(`${playerId}_${CommandIds.PLAYERS_ALL}`, interaction.channelId, interaction)
    }
  } else {
    if (interaction.isButton()) {
      await safeDeferUpdate(interaction)
    }
    newInteraction = getStoredInteraction(`${playerId}_${CommandIds.PLAYERS_ALL}`, interaction.channelId)
  }
  const pageNumber = parseInt(pageString, 10)
  const players = await getAllPlayers(pageNumber, sort, ascending)
  const playerList = players
    .map(
      ({ discordId, usernames, role, mmr }) =>
        `\`${mmr}\` <@${discordId}>: (${usernames.accounts
          ?.find(a => a.isPrimary)
          ?.hotsBattleTag.replace(/#.*$/, '')}) \`${getPlayerRolesFormatted(role)}\``
    )
    .join('\n')
  // since the max length of a message is 2000 characters, we need to split the message into multiple messages if it exceeds the limit
  const backButton = new ButtonBuilder()
    .setCustomId(`${CommandIds.PLAYERS_ALL_PAGE}_${sort}_${ascending}_${pageNumber - 1}`)
    .setEmoji('⬅️')
    .setStyle(ButtonStyle.Secondary)
  const refreshButton = new ButtonBuilder()
    .setCustomId(`${CommandIds.PLAYERS_ALL_PAGE}_${sort}_${ascending}_${pageNumber}`)
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Primary)
  const forwardButton = new ButtonBuilder()
    .setCustomId(`${CommandIds.PLAYERS_ALL_PAGE}_${sort}_${ascending}_${pageNumber + 1}`)
    .setEmoji('➡️')
    .setStyle(ButtonStyle.Secondary)
  const buttons = [refreshButton]
  if (pageNumber > 0) {
    buttons.unshift(backButton)
  }
  if (players.length === 20) {
    buttons.push(forwardButton)
  }
  // check if newInteraction is a button interaction, if so, edit the reply
  if (newInteraction) {
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)
    const sortAlphbetically = new ButtonBuilder()
      .setCustomId(
        `${CommandIds.PLAYERS_ALL_PAGE_SORT}_alphabetical_${
          sort === 'alphabetical' ? !ascending : ascending
        }_${pageNumber}`
      )
      .setEmoji('🔤')
      .setLabel(`ABC${ascending ? '🔼' : '🔽'}`)
      .setStyle(sort === 'alphabetical' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    const sortByMMR = new ButtonBuilder()
      .setCustomId(`${CommandIds.PLAYERS_ALL_PAGE_SORT}_mmr_${sort === 'mmr' ? !ascending : ascending}_${pageNumber}`)
      .setEmoji('📊')
      .setLabel(`MMR${ascending ? '🔽' : '🔼'}`)
      .setStyle(sort === 'mmr' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(sortAlphbetically, sortByMMR)
    try {
      await newInteraction.editReply({
        content: `__**All Players**__:\n${playerList}`,
        components: [row1, row2],
      })
    } catch {
      await safeReply(newInteraction, {
        content: `__**All Players**__:\n${playerList}`,
        components: [row1, row2],
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}

export async function handleLookupByDiscordIdCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const discordId = interaction.options.getString(CommandIds.DISCORD_ID, true).replace(/[<@>]/g, '')
  const displayName = interaction.options.getString(CommandIds.DISCORD_DISPLAY_NAME, true)
  const discordName = interaction.options.getString(CommandIds.DISCORD_NAME, true)
  const discordData: DiscordUserNames = {
    discordName: discordName,
    discordGlobalName: displayName,
    discordDisplayName: displayName,
  }
  return await handleLookupCommandSub(interaction, discordId, discordData, guildId)
}

export async function handleLookupAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focusedOption = interaction.options.getFocused(true)
  if (focusedOption.name !== CommandIds.BATTLE_TAG) {
    await interaction.respond([])
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) {
    await interaction.respond([])
    return
  }

  const query = focusedOption.value.trim().toLowerCase()
  const registeredAccounts = await getAllRegisteredHotSAccounts(guildId)

  const rawDiscordId = interaction.options.get(CommandIds.DISCORD_ID)?.value
  const targetDiscordId =
    typeof rawDiscordId === 'string' && rawDiscordId.trim().length > 0
      ? rawDiscordId.replace(/[<@!>]/g, '').trim()
      : undefined

  let baseAccounts = registeredAccounts
  if (targetDiscordId) {
    baseAccounts = registeredAccounts.filter(acc => acc.discordId === targetDiscordId)
    const subCommand = interaction.options.getSubcommand(false)
    if (subCommand === CommandIds.PRIMARY) {
      baseAccounts = baseAccounts.filter(acc => !acc.ownerDiscordId)
    }
  }

  let filtered = baseAccounts
  if (query.length > 0) {
    filtered = baseAccounts.filter(acc => {
      const tag = acc.hotsBattleTag.toLowerCase()
      const tagPrefix = tag.split('#')[0]
      const realId = acc.realIdName?.toLowerCase() ?? ''
      const discordDisplayName = acc.discordDisplayName.toLowerCase()
      const discordName = acc.discordName?.toLowerCase() ?? ''

      return (
        tag.startsWith(query) ||
        tagPrefix === query ||
        tag.includes(query) ||
        realId.includes(query) ||
        discordDisplayName.includes(query) ||
        discordName.includes(query)
      )
    })

    filtered.sort((a, b) => {
      const aTag = a.hotsBattleTag.toLowerCase()
      const bTag = b.hotsBattleTag.toLowerCase()
      const aPrefix = aTag.split('#')[0]
      const bPrefix = bTag.split('#')[0]

      const aStarts = aPrefix.startsWith(query) || aTag.startsWith(query)
      const bStarts = bPrefix.startsWith(query) || bTag.startsWith(query)
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1

      return aTag.localeCompare(bTag)
    })
  }

  const choices = await Promise.all(
    filtered.slice(0, 25).map(async acc => {
      let discordStr = `@${acc.discordDisplayName}`
      if (acc.ownerDiscordId) {
        const owner = await getPlayerByDiscordId(acc.ownerDiscordId, guildId)
        const ownerName =
          owner?.usernames.discordDisplayName ??
          owner?.usernames.discordGlobalName ??
          owner?.usernames.discordName ??
          'unknown'
        discordStr += `, owned by @${ownerName}`
      }
      const label = `${acc.hotsBattleTag} (${discordStr})`.slice(0, 100)
      return {
        name: label,
        value: acc.hotsBattleTag,
      }
    })
  )

  // Fallback to unlinked replay accounts if choices under limit and not filtering for a specific player
  if (choices.length < 25 && !targetDiscordId) {
    const remainingSlots = 25 - choices.length
    const unlinked = await getUnlinkedReplayAccountsForAutocomplete(query, remainingSlots)
    const existingTags = new Set(choices.map(c => c.value.toLowerCase()))
    for (const u of unlinked) {
      if (existingTags.has(u.hotsBattleTag.toLowerCase())) {
        continue
      }
      existingTags.add(u.hotsBattleTag.toLowerCase())
      const gameText = u.gameCount === 1 ? '1 replay game' : `${u.gameCount} replay games`
      choices.push({
        name: `${u.hotsBattleTag} (🎮 ${gameText}, unlinked)`.slice(0, 100),
        value: u.hotsBattleTag,
      })
      if (choices.length >= 25) break
    }
  }

  await interaction.respond(choices)
}

export async function handleLookupCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const member = interaction.options.getMember(CommandIds.DISCORD_ID)
  const userOption = interaction.options.getUser(CommandIds.DISCORD_ID)
  const targetDiscordId = extractDiscordIdFromInteraction(interaction, CommandIds.DISCORD_ID)
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG, false)?.trim()

  // 1. If a Discord member or ID was provided
  if (targetDiscordId) {
    let resolvedUser: User | null = null
    if (userOption && userOption.id === targetDiscordId) {
      resolvedUser = userOption
    } else if (member && 'user' in member && member.user.id === targetDiscordId) {
      resolvedUser = member.user
    } else {
      const cached = interaction.client.users.cache.get(targetDiscordId)
      if (cached) {
        resolvedUser = cached
      } else if (/^\d{17,20}$/.test(targetDiscordId)) {
        try {
          resolvedUser = await interaction.client.users.fetch(targetDiscordId)
        } catch {
          resolvedUser = null
        }
      }
    }

    const player = await getPlayerByDiscordId(targetDiscordId, guildId)

    // If neither Discord nor our database has a record of this user
    if (!resolvedUser && !player) {
      await safeReply(interaction, {
        content: 'Please provide a valid Discord member to look up.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const discordData = fetchDiscordNames(interaction, targetDiscordId, resolvedUser)
    if (player) {
      if (discordData.discordDisplayName === 'N/A') {
        discordData.discordDisplayName = player.usernames.discordDisplayName
      }
      if (discordData.discordName === 'N/A') {
        discordData.discordName = player.usernames.discordName
      }
      if (discordData.discordGlobalName === 'N/A') {
        discordData.discordGlobalName = player.usernames.discordGlobalName
      }
    }

    return await handleLookupCommandSub(interaction, targetDiscordId, discordData, guildId, true)
  }

  // 2. If HotS BattleTag or account name was provided (without discord-id)
  if (hotsBattleTag) {
    const matches = await findPlayersByHotSAccount(hotsBattleTag, guildId)

    if (matches.length === 0) {
      const unlinkedMatches = await getUnlinkedReplayAccounts({ search: hotsBattleTag, limit: 1 })
      const exactUnlinked =
        unlinkedMatches.accounts.find(
          u =>
            u.hotsBattleTag.toLowerCase() === hotsBattleTag.toLowerCase() ||
            u.name.toLowerCase() === hotsBattleTag.toLowerCase()
        ) ?? unlinkedMatches.accounts[0]

      if (exactUnlinked) {
        const publish = interaction.options.getString(CommandIds.PUBLISH) === 'true'
        const embed = new EmbedBuilder()
          .setColor(0xf39c12)
          .setTitle(`Unlinked Account: ${exactUnlinked.hotsBattleTag}`)
          .setDescription(
            `**${exactUnlinked.hotsBattleTag}** has played in custom game replays but is not currently linked to any Discord user.`
          )
          .addFields(
            { name: 'BattleTag', value: exactUnlinked.hotsBattleTag, inline: true },
            { name: 'Replay Games', value: String(exactUnlinked.gameCount), inline: true },
            {
              name: 'Last Seen',
              value: exactUnlinked.lastSeenDate ? formatDateToMMDDYYYY(new Date(exactUnlinked.lastSeenDate)) : 'Unknown',
              inline: true,
            }
          )
        if (exactUnlinked.heroesPlayed) {
          embed.addFields({
            name: 'Heroes Played',
            value: exactUnlinked.heroesPlayed.split(',').slice(0, 5).join(', '),
          })
        }
        embed.setFooter({
          text: `To link this account, run: /admin add-account battle-tag:${exactUnlinked.hotsBattleTag} discord-id:`,
        })

        if (publish) {
          await announce(interaction, { embeds: [embed] })
        } else {
          await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral })
        }
        return
      }

      await safeReply(interaction, {
        content: `❌ No registered player or replay record found with HotS BattleTag matching \`${hotsBattleTag}\`.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (matches.length === 1) {
      const { player, matchedAccounts } = matches[0]
      const discordId = player.discordId
      if (!discordId) {
        const matchedTag = matchedAccounts[0]?.hotsBattleTag ?? player.usernames.discordDisplayName
        const publish = interaction.options.getString(CommandIds.PUBLISH) === 'true'
        const embed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(`Guest Account: ${matchedTag}`)
          .setDescription(`**${matchedTag}** is a guest HotS account and is not currently linked to a Discord user.`)
          .addFields(
            { name: 'BattleTag', value: matchedTag, inline: true },
            { name: 'MMR', value: String(player.mmr ?? 0), inline: true },
            {
              name: 'Games Played',
              value: String(
                (matchedAccounts[0]?.hpQmGames ?? 0) +
                  (matchedAccounts[0]?.hpSlGames ?? 0) +
                  (matchedAccounts[0]?.hpArGames ?? 0)
              ),
              inline: true,
            }
          )
          .setFooter({ text: 'To link this account to a Discord user, run /lookup user:@User and add this BattleTag.' })

        if (publish) {
          await announce(interaction, { embeds: [embed] })
        } else {
          await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral })
        }
        return
      }
      let discordData = fetchDiscordNames(interaction, discordId)
      if (discordData.discordDisplayName === 'N/A') {
        discordData = {
          discordName: player.usernames.discordName,
          discordDisplayName: player.usernames.discordDisplayName,
          discordGlobalName: player.usernames.discordGlobalName,
        }
      }
      return await handleLookupCommandSub(
        interaction,
        discordId,
        discordData,
        guildId,
        false,
        matchedAccounts[0]?.hotsBattleTag
      )
    }

    // Multiple matches found: list all matched players
    const publish = interaction.options.getString(CommandIds.PUBLISH) === 'true'
    const activeSubs = await getActiveSubstitutions(guildId)
    const list = matches
      .map(({ player, matchedAccounts }) => {
        const accountsStr =
          player.usernames.accounts
            ?.map(
              a =>
                `\`${a.hotsBattleTag}\`` +
                (a.isPrimary ? ' (Primary)' : '') +
                getAccountLoanStatusTag(a, guildId, player.discordId, activeSubs)
            )
            .join(', ') || 'No HotS accounts'
        const matchedTags = matchedAccounts.map(a => `\`${a.hotsBattleTag}\``).join(', ')
        const userHeader = player.discordId
          ? `<@${player.discordId}> (**${player.usernames.discordDisplayName}** | \`${player.usernames.discordName}\`)`
          : `**${player.usernames.discordDisplayName}** (Guest Account)`
        return (
          `• ${userHeader}\n` +
          `  Matched: ${matchedTags}\n` +
          `  Accounts: ${accountsStr}\n` +
          `  Highest MMR: **${player.mmr}** | Role: \`${getPlayerRolesFormatted(player.role)}\``
        )
      })
      .join('\n\n')

    const embed = new EmbedBuilder()
      .setTitle(`HotS Lookup: Multiple Players Found for "${hotsBattleTag}"`)
      .setColor(0x3498db)
      .setDescription(`Found **${matches.length}** players matching **"${hotsBattleTag}"**:\n\n${list}`)
      .setFooter({
        text: 'Use /lookup with the Discord user or specific BattleTag to view full stats.',
      })

    if (publish) {
      await announce(interaction, { embeds: [embed] })
    } else {
      await safeReply(interaction, {
        embeds: [embed],
        flags: safePing(MessageFlags.Ephemeral),
      })
    }
    return
  }

  // 4. Neither option provided
  await safeReply(interaction, {
    content:
      'Please provide either a Discord user (via `discord-id`) or a HotS BattleTag / account name (via `battle-tag`) to look up.',
    flags: MessageFlags.Ephemeral,
  })
}

async function handleLookupCommandSub(
  interaction: ChatInputCommandInteraction<CacheType>,
  discordId: string,
  discordData: DiscordUserNames,
  guildId: string,
  allowAccountMutation: boolean = true,
  matchedHotSTag?: string
) {
  const hotsBattleTag = matchedHotSTag ?? interaction.options.getString(CommandIds.BATTLE_TAG, false) ?? ''
  const player = await getPlayerByDiscordId(discordId, guildId)
  if (player || (!player && hotsBattleTag === '')) {
    const message = player
      ? matchedHotSTag
        ? `Matched HotS account \`${matchedHotSTag}\` • ${player.active ? 'Active in lobby' : 'Registered player'} • Role: \`${getPlayerRolesFormatted(player.role)}\``
        : `${hotsBattleTag || 'Player'} found with role: \`${getPlayerRolesFormatted(player.role)}\`${player.active ? ' (Active in lobby)' : ''}`
      : `${hotsBattleTag || 'Player'} not found in the lobby, adding them to the database.`
    // show the player's hots_accounts.hotsBattleTag
    const hotsAccounts =
      player?.usernames.accounts?.sort((a, b) => {
        const aMMR = Math.max(a.hpSlMMR || 0, a.hpArMMR || 0, a.hpQmMMR || 0)
        const bMMR = Math.max(b.hpSlMMR || 0, b.hpArMMR || 0, b.hpQmMMR || 0)
        return bMMR - aMMR
      }) || []
    const activeSubs = await getActiveSubstitutions(guildId)
    const accounts =
      hotsAccounts
        ?.map(
          (a, index) =>
            `${index + 1}. ${Math.max(a.hpSlMMR || 0, a.hpArMMR || 0, a.hpQmMMR || 0)} ${a.hotsBattleTag}` +
            (a.isPrimary ? ' (Primary)' : '') +
            getAccountLoanStatusTag(a, guildId, discordId, activeSubs)
        )
        .join('\n') || 'No HotS accounts'

    // get the player's highest MMR from the max player?.usernames using hpSlMMR, hpArMMR, or hpQmMMR
    const MMR = player?.mmr ?? 0

    const limit = interaction.options.getInteger(CommandIds.RECENT_MATCHES_LIMIT, false) ?? 30
    const minHeroGames = interaction.options.getInteger(CommandIds.MIN_HERO_GAMES, false) ?? 5
    const numHeroes = interaction.options.getInteger(CommandIds.NUM_HEROES, false) ?? 6
    const matchStats = await getPlayerMatchStats(discordId, limit, minHeroGames, numHeroes)

    const embed = new EmbedBuilder()
      .setTitle(`Player Lookup: ${discordData.discordDisplayName || discordData.discordName}`)
      .setColor(0x3498db)
      .setDescription(`<@${discordId}>\n${message}`)
      .addFields(
        {
          name: '👤 Discord Info',
          value: `• **Discord ID:** \`${discordId}\`\n• **discordName:** \`${discordData.discordName}\`\n• **discordGlobalName:** \`${discordData.discordGlobalName}\`\n• **Display Name:** \`${discordData.discordDisplayName}\`${player?.adjustment ? `\n• **Adjustment:** ${player.adjustment}` : ''}`,
          inline: false,
        },
        {
          name: '🎮 HotS Accounts & MMR',
          value: `**Highest MMR:** ${MMR}\n${accounts}`,
          inline: false,
        }
      )

    if (matchStats.totalGames > 0) {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

      const buildEmojis = (matches: typeof matchStats.recentMatches) => {
        return matches
          .map(m => {
            if (!m.date) return m.win ? '🟩' : '🟥'
            const matchDate = new Date(m.date)
            if (isNaN(matchDate.getTime())) return m.win ? '🟩' : '🟥'

            const year = matchDate.getFullYear()
            const month = matchDate.getMonth() + 1
            const day = matchDate.getDate()

            const matchDayStart = new Date(year, month - 1, day).getTime()
            const diffDays = Math.round((todayStart - matchDayStart) / (1000 * 60 * 60 * 24))
            const relativeStr = diffDays <= 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays}d_ago`

            const dateStr = matchDate
              .toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
              .replace(/[\s,]+/g, '_')

            const heroPart = m.hero ? `hero=${encodeURIComponent(m.hero.replace(/\s+/g, '_'))}` : ''
            const mapPart = m.map ? `map=${encodeURIComponent(m.map.replace(/\s+/g, '_'))}` : ''
            const datePart = `date=${dateStr}(${relativeStr})`
            const subTag = m.isSubstitute ? '(sub)' : ''
            const tagPart = m.battleTag
              ? `account=${encodeURIComponent(m.battleTag.replace(/\s+/g, '_').replace(/#/g, '-'))}${subTag}`
              : ''

            const queryParams = [heroPart, mapPart, datePart, tagPart].filter(Boolean).join('&')
            const matchId = m.replayId ? `${m.replayId}` : 'custom'
            const baseUrl = process.env.MATCH_VIEWER_BASE_URL?.replace(/\/$/, '') || 'https://storm-stats.duckdns.org'
            const url = `<${baseUrl}/replay/${matchId}?${queryParams}>`
            return `[${m.win ? '🟩' : '🟥'}](${url})`
          })
          .join(' ')
      }

      const recentFormW = matchStats.recentMatches.filter(m => m.win).length
      const recentFormL = matchStats.recentMatches.length - recentFormW
      const totalRecent = matchStats.recentMatches.length
      const recentWinRate = totalRecent > 0 ? ((recentFormW / totalRecent) * 100).toFixed(1) : '0.0'

      const matchStatsValue = `• **Career Record:** ${matchStats.totalGames} Games | ${matchStats.wins}W - ${matchStats.losses}L (${matchStats.winRate}% WR)`
      const recentStats = `(${recentFormW}W - ${recentFormL}L, ${recentWinRate}% WR)`

      const topHeroesStr =
        matchStats.topHeroes.length > 0
          ? matchStats.topHeroes.map((h, i) => `${i + 1}. **${h.hero}**\n(${h.games}G, ${h.winRate}% WR)`).join('\n')
          : 'N/A'

      const bestHeroesStr =
        matchStats.bestHeroes.length > 0
          ? matchStats.bestHeroes.map((h, i) => `${i + 1}. **${h.hero}**\n(${h.games}G, ${h.winRate}% WR)`).join('\n')
          : 'N/A'

      const formatBmCategory = (label: string, count: number, td: number, deaths: number) => {
        if (count <= 0 && td <= 0 && deaths <= 0) return null
        let details = `${count} ${label}`
        const extras: string[] = []
        if (td > 0) extras.push(`${td} ${label.slice(0, -1)} TD`)
        if (deaths > 0) extras.push(`${deaths} ${label.slice(0, -1)} Deaths`)
        if (extras.length > 0) {
          details += `, ${extras.join(', ')}`
        }
        return details
      }

      const bmStr = [
        formatBmCategory(
          'B-Steps',
          matchStats.bmStats.bsteps,
          matchStats.bmStats.bstepTd,
          matchStats.bmStats.bstepDeaths
        ),
        formatBmCategory(
          'Sprays',
          matchStats.bmStats.sprays,
          matchStats.bmStats.sprayTd,
          matchStats.bmStats.sprayDeaths
        ),
        formatBmCategory(
          'Dances',
          matchStats.bmStats.dances,
          matchStats.bmStats.danceTd,
          matchStats.bmStats.danceDeaths
        ),
        formatBmCategory(
          'Taunts',
          matchStats.bmStats.taunts,
          matchStats.bmStats.tauntTd,
          matchStats.bmStats.tauntDeaths
        ),
      ]
        .filter(Boolean)
        .join('\n')

      embed.addFields({
        name: '📊 Match Stats',
        value: matchStatsValue.slice(0, 1024),
        inline: false,
      })

      const recentFormEmojis = buildEmojis(matchStats.recentMatches)
      const fullRecentValue = `${recentFormEmojis}\n${recentStats}`

      if (fullRecentValue.length <= 1024) {
        embed.addFields({
          name: `Recent Matches (${matchStats.recentMatches.length})`,
          value: fullRecentValue,
        })
      } else if (recentFormEmojis.length <= 1024) {
        embed.addFields(
          {
            name: `Recent Matches (${matchStats.recentMatches.length})`,
            value: recentFormEmojis,
          },
          {
            name: '',
            value: recentStats,
          }
        )
      } else {
        const total = matchStats.recentMatches.length
        let numChunks = 1

        while (numChunks <= total) {
          const baseSize = Math.floor(total / numChunks)
          const remainder = total % numChunks
          let allFit = true
          let offset = 0

          for (let i = 0; i < numChunks; i++) {
            const chunkSize = baseSize + (i < remainder ? 1 : 0)
            const chunk = matchStats.recentMatches.slice(offset, offset + chunkSize)
            offset += chunkSize

            if (buildEmojis(chunk).length >= 1024) {
              allFit = false
              break
            }
          }

          if (allFit) break
          numChunks++
        }

        const baseSize = Math.floor(total / numChunks)
        const remainder = total % numChunks
        let offset = 0
        let chunkIdx = 0

        while (chunkIdx < numChunks) {
          const chunkSize = baseSize + (chunkIdx < remainder ? 1 : 0)
          const chunk = matchStats.recentMatches.slice(offset, offset + chunkSize)
          offset += chunkSize

          embed.addFields({
            name: chunkIdx === 0 ? `Recent Matches (${matchStats.recentMatches.length})` : '',
            value: buildEmojis(chunk),
          })

          chunkIdx++
        }

        embed.addFields({
          name: '',
          value: recentStats,
        })
      }

      embed.addFields({
        name: '⭐ Top Played Heroes',
        value: topHeroesStr.slice(0, 1024),
        inline: true,
      })
      embed.addFields({
        name: '🏆 Best Heroes',
        value: bestHeroesStr.slice(0, 1024),
        inline: true,
      })
      if (bmStr) {
        embed.addFields({
          name: '💃 BM Highlights',
          value: bmStr.slice(0, 1024),
          inline: true,
        })
      }
    }

    const components: ActionRowBuilder<StringSelectMenuBuilder>[] = []
    if (matchStats && matchStats.recentMatches && matchStats.recentMatches.length > 0) {
      const seenReplayIds = new Set<number>()
      const selectOptions: { label: string; description: string; value: string }[] = []
      for (const m of matchStats.recentMatches) {
        if (!m.replayId || seenReplayIds.has(m.replayId)) continue
        seenReplayIds.add(m.replayId)

        const matchDate = m.date ? new Date(m.date) : null
        const dateStr =
          matchDate && !isNaN(matchDate.getTime())
            ? matchDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'Unknown date'

        const winLoss = m.win ? '🟩 Win' : '🟥 Loss'
        const label = `#${m.replayId} • ${winLoss} • ${m.hero || 'Unknown'} on ${m.map || 'Unknown'}`.slice(0, 100)
        const subInfo = m.isSubstitute
          ? ` • Sub: ${m.battleTag || 'unknown'}`
          : m.battleTag
            ? ` • Account: ${m.battleTag}`
            : ''
        const description = `${dateStr}${subInfo}`.slice(0, 100)

        selectOptions.push({
          label,
          description,
          value: String(m.replayId),
        })

        if (selectOptions.length >= 25) break
      }

      if (selectOptions.length > 0) {
        const replaySelectMenu = new StringSelectMenuBuilder()
          .setCustomId(`lookup_replay_select:${discordId}`)
          .setPlaceholder('🔍 Select a recent match to view full replay details...')
          .addOptions(selectOptions)

        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(replaySelectMenu))
      }
    }

    const publish = interaction.options.getString(CommandIds.PUBLISH) === 'true'

    if (publish) {
      // send the message publicly
      await announce(interaction, {
        embeds: [embed],
        components,
      })
    } else {
      await safeReply(interaction, {
        embeds: [embed],
        components,
        flags: safePing(MessageFlags.Ephemeral),
      })
    }
  }
  if (!allowAccountMutation) {
    return
  }
  // save the player to the database if they are not already there
  if (!player) {
    await savePlayer(
      interaction,
      discordId,
      {
        discordId,
        usernames: {
          ...discordData,
        },
        active: false,
        team: null,
        lobbyRank: NaN,
        draftOrder: NaN,
        adjustment: null,
        mmr: 0,
        lastActive: new Date(),
      },
      hotsBattleTag
    )
    return
  }
  // update the player's Discord data in the database
  await setPlayerDiscordNames(discordId, guildId, discordData)
  // If a hotsBattleTag is provided, and does this player already have this specific battle tag?
  if (
    hotsBattleTag &&
    player.usernames.accounts?.some(a => a.hotsBattleTag.toLowerCase() === hotsBattleTag.toLowerCase())
  ) {
    await setPlayerName(interaction, guildId, discordId, hotsBattleTag) // Update the player's Heroes of the Storm name in the database
  } else if (hotsBattleTag) {
    await handleAddHotsAccountCommandSub(interaction, guildId, discordId, hotsBattleTag) // Add the new battle tag to the player's accounts in the database
  }
}

export async function handleDeletePlayerCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const discordId = extractDiscordIdFromInteraction(interaction, CommandIds.DISCORD_ID)
  if (!discordId) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to delete.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const { playersDeleted, hotsAccountsDeleted } = await deletePlayer(discordId)
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  await updateLobbyMessage(guildId, interaction)
  // reply with the number of players and accounts deleted
  await safeReply(interaction, {
    content: `Deleted ${playersDeleted} player${
      playersDeleted === 1 ? '' : 's'
    } and ${hotsAccountsDeleted} HotS account${hotsAccountsDeleted === 1 ? '' : 's'} for Discord ID: <@${discordId}>.`,
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleDeleteHotsAccountCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG, true)
  await deleteHotsAccount(hotsBattleTag)
  await safeReply(interaction, {
    content: `Deleted HotS account: \`${hotsBattleTag}\`.`,
    flags: MessageFlags.Ephemeral,
  })
}

