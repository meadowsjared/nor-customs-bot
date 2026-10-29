import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { chatOrButtonOrModal, CommandIds, joinBtn, roleMap } from '../constants'
import {
  clearAccountSubstitutions,
  getAccountLoanStatusTag,
  getActiveSubstitutions,
  getAssignAccountChoices,
  getAssignAccountClearChoices,
  getHotsAccountByBattleTag,
  getPlayerByDiscordId,
  getPlayerRolesFormatted,
  handleAddHotsAccount,
  handleDeleteHotsAccount,
  setAccountSubstitution,
  setHotsAccountRealIdName,
  setPlayerActive,
  setPlayerRole,
  setPrimaryAccount,
  storeInteraction,
} from '../store/player'
import { Player } from '../types/player'
import { requireGuildId, safeReply, safeUpdate } from '../utils/interaction'
import { handleRefreshLobbyMessage, updateLobbyMessage } from './lobby'
import {
  createEditRoleButtonDisabled,
  createEditRoleButtonEnabled,
  extractDiscordIdFromInteraction,
  getBattleTag,
  getDiscordId,
  getEditRoleRow,
  handleUserNameModalSubmit,
  userIsAdmin,
} from './shared'

/**
 * Handles the admin add hots account button interaction, shows a modal to collect the battle tag and adds it to the player's account
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param discordId The Discord ID of the user to add the HotS account for.
 * @returns Promise<void>
 */
export async function handleAdminAddHotsAccountButton(interaction: ButtonInteraction<CacheType>, discordId: string) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const { hotsBattleTag, modalInteraction } = await handleUserNameModalSubmit(interaction, guildId, discordId)
  if (!modalInteraction || !hotsBattleTag) {
    // If modal interaction is undefined, it means the user did not respond in time
    return
  }
  const player = await getPlayerByDiscordId(discordId, guildId)
  if (player) {
    await handleAddHotsAccount(modalInteraction, discordId, hotsBattleTag) // Update the player's battle tag in the database
  }
}

export async function handleAddHotsAccountCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  if (interaction.isButton()) {
    const { hotsBattleTag, modalInteraction } = await handleUserNameModalSubmit(interaction, guildId)
    if (!modalInteraction || !hotsBattleTag) {
      // If modal interaction is undefined, it means the user did not respond in time
      return
    }
    const player = await getPlayerByDiscordId(modalInteraction.user.id, guildId)
    if (player) {
      await handleAddHotsAccount(modalInteraction, modalInteraction.user.id, hotsBattleTag) // Update the player's battle tag in the database
    }
    return
  }
  const discordId = interaction.user.id
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG)
  // check if the battleTag is valid, it should be in the format of Name#1234
  await handleAddHotsAccountCommandSub(interaction, guildId, discordId, hotsBattleTag)
}

export async function handleAdminAddHotsAccountByDiscordIdCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const discordId = interaction.options.getString(CommandIds.DISCORD_ID, true).replace(/[<@>]/g, '')
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG)
  await handleAddHotsAccountCommandSub(interaction, guildId, discordId, hotsBattleTag)
}

export async function handleAdminAddHotsAccountCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const discordId = extractDiscordIdFromInteraction(interaction, CommandIds.DISCORD_ID)
  if (!discordId) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to look up.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG)
  // check if the battleTag is valid, it should be in the format of Name#1234
  await handleAddHotsAccountCommandSub(interaction, guildId, discordId, hotsBattleTag)
}

export async function handleAdminDeleteHotsAccountCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const discordId = extractDiscordIdFromInteraction(interaction, CommandIds.DISCORD_ID)
  if (!discordId) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord member to look up.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const hotsBattleTag = interaction.options.getString(CommandIds.BATTLE_TAG, false)
  // check if the battleTag is valid, it should be in the format of Name#1234
  await handleDeleteHotsAccountCommandSub(interaction, discordId, hotsBattleTag)
  await handleRefreshLobbyMessage(interaction, false)
}

export async function handleAdminPrimaryCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordIdParam?: string,
  battleTagParam?: string,
  messageIdParam?: string,
  channelIdParam?: string
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const discordId = getDiscordId(interaction, guildId, discordIdParam)
  if (!discordId) {
    await safeReply(interaction, {
      content: 'Please provide a valid Discord ID or member to look up.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const player = await getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    await safeReply(interaction, {
      content: 'The specified user does not exist in the database.',
      flags: MessageFlags.Ephemeral,
    })
    return
  } else if (!player.usernames.accounts || player.usernames.accounts.length === 0) {
    await safeReply(interaction, {
      content: 'The specified user does not have any Heroes of the Storm accounts associated with their Discord ID.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const battleTag = getBattleTag(interaction, battleTagParam)
  if (!battleTag || !messageIdParam || !channelIdParam) {
    // if they didn't provide a battle tag, then show them a list of buttons for each account the user has
    const channelId = interaction.channelId
    const message = await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    })
    if (player.usernames.accounts.length === 1) {
      // set that account as primary directly
      await setPrimaryAccount(
        interaction,
        guildId,
        discordId,
        player.usernames.accounts[0].hotsBattleTag,
        message.id,
        channelId
      )
      return
    }
    if (!battleTagParam && battleTag) {
      if (!player.usernames.accounts.some(account => account.hotsBattleTag === battleTag)) {
        // set that account as primary
        await safeReply(interaction, {
          content: `The specified battle tag \`${battleTag}\` is not associated with the user <@${discordId}>.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
      await setPrimaryAccount(interaction, guildId, discordId, battleTag, message.id, channelId)
      return
    }
    const accountButtons = player.usernames.accounts.map(account => {
      return new ButtonBuilder()
        .setCustomId(
          `${CommandIds.ADMIN}_${CommandIds.PRIMARY}_${discordId}_${account.hotsBattleTag}_${message.id}_${channelId}`
        )
        .setLabel(account.hotsBattleTag)
        .setStyle(account.isPrimary ? ButtonStyle.Primary : ButtonStyle.Secondary)
    })
    await interaction.editReply({
      content: 'Please select the account to set as primary using the buttons below.',
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...accountButtons)],
    })
    if (!message) {
      await safeReply(interaction, {
        content: 'An error occurred while trying to send the message. Please try again.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }
    storeInteraction(message.id, interaction.channelId, interaction)
    return
  }
  await setPrimaryAccount(interaction, guildId, discordId, battleTag, messageIdParam, channelIdParam)
}

export async function handleAdminRealIdNameCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const discordId = getDiscordId(interaction, guildId)
  const battleTag = getBattleTag(interaction)

  if (!discordId && !battleTag) {
    await safeReply(interaction, {
      content: 'Please provide either a BattleTag (`battle-tag`) or a Discord user (`discord-id`).',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const clear = interaction.options.getBoolean('clear') ?? false
  const name = interaction.options.getString('name')

  // Case 1: battleTag provided without discordId
  if (!discordId && battleTag) {
    const account = await getHotsAccountByBattleTag(battleTag.trim())
    if (!account) {
      await safeReply(interaction, {
        content: `HotS account \`${battleTag}\` was not found in the database.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const ownerInfo = account.discord_id ? `<@${account.discord_id}>` : 'unlinked'

    if (clear) {
      await setHotsAccountRealIdName(account.hots_battle_tag, null)
      await safeReply(interaction, {
        content: `Cleared Real ID name for \`${account.hots_battle_tag}\` (${ownerInfo}).`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (name !== null && name !== undefined) {
      const trimmed = name.trim()
      if (trimmed.length === 0) {
        await setHotsAccountRealIdName(account.hots_battle_tag, null)
        await safeReply(interaction, {
          content: `Cleared Real ID name for \`${account.hots_battle_tag}\` (${ownerInfo}).`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      await setHotsAccountRealIdName(account.hots_battle_tag, trimmed)
      await safeReply(interaction, {
        content: `Set Real ID name for \`${account.hots_battle_tag}\` (${ownerInfo}) to **${trimmed}**.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // View mode for single battleTag
    await safeReply(interaction, {
      content: `• \`${account.hots_battle_tag}\` (${ownerInfo}): ${
        account.real_id_name ? `**${account.real_id_name}**` : '*None*'
      }`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Case 2: discordId is provided (with optional battleTag)
  if (!discordId) return

  const player = await getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    await safeReply(interaction, {
      content: `Player <@${discordId}> was not found in the database.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const accounts = player.usernames.accounts ?? []
  if (accounts.length === 0) {
    await safeReply(interaction, {
      content: `Player <@${discordId}> does not have any Heroes of the Storm accounts registered.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  let targetAccount = accounts[0]
  if (battleTag) {
    const found = accounts.find(acc => acc.hotsBattleTag.toLowerCase() === battleTag.trim().toLowerCase())
    if (!found) {
      await safeReply(interaction, {
        content: `Account \`${battleTag}\` was not found for <@${discordId}>. Registered accounts: ${accounts.map(a => `\`${a.hotsBattleTag}\``).join(', ')}`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }
    targetAccount = found
  } else {
    const primary = accounts.find(acc => acc.isPrimary)
    if (primary) {
      targetAccount = primary
    }
  }

  const displayName = player.usernames.discordDisplayName || player.usernames.discordName

  if (clear) {
    await setHotsAccountRealIdName(targetAccount.hotsBattleTag, null)
    await safeReply(interaction, {
      content: `Cleared Real ID name for **${displayName}** (\`${targetAccount.hotsBattleTag}\`).`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (name !== null && name !== undefined) {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      await setHotsAccountRealIdName(targetAccount.hotsBattleTag, null)
      await safeReply(interaction, {
        content: `Cleared Real ID name for **${displayName}** (\`${targetAccount.hotsBattleTag}\`).`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await setHotsAccountRealIdName(targetAccount.hotsBattleTag, trimmed)
    await safeReply(interaction, {
      content: `Set Real ID name for **${displayName}** (\`${targetAccount.hotsBattleTag}\`) to **${trimmed}**.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // View current Real ID names for the player
  const activeSubs = await getActiveSubstitutions(guildId)
  const accountList = accounts
    .map(
      a =>
        `• \`${a.hotsBattleTag}\`${a.isPrimary ? ' *(Primary)*' : ''}${getAccountLoanStatusTag(a, guildId, discordId, activeSubs)}: ${
          a.realIdName ? `**${a.realIdName}**` : '*None*'
        }`
    )
    .join('\n')

  await safeReply(interaction, {
    content: `Real ID name(s) for **${displayName}**:\n${accountList}`,
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleAddHotsAccountCommandSub(
  interaction: ChatInputCommandInteraction<CacheType>,
  guildId: string,
  discordId: string,
  hotsBattleTag: string | null
) {
  if (!hotsBattleTag) {
    // if they didn't provide a battle tag, then show them all the accounts they have associated with their discord id
    const player = await getPlayerByDiscordId(discordId, guildId)
    if (!player?.usernames.accounts || player.usernames.accounts.length === 0) {
      await safeReply(interaction, {
        content: 'You have no Heroes of the Storm accounts associated with your Discord ID.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }
    const activeSubs = await getActiveSubstitutions(guildId)
    const accountsList = player.usernames.accounts
      .map(
        account =>
          `* \`${account.hotsBattleTag}\` ${account.isPrimary ? '(Primary)' : ''}${getAccountLoanStatusTag(account, guildId, discordId, activeSubs)}`
      )
      .join('\n')
    await safeReply(interaction, {
      content: `${
        interaction.user.id === discordId ? 'Your' : `<@${discordId}>'s`
      } associated Heroes of the Storm accounts:\n${accountsList}`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await handleAddHotsAccount(interaction, discordId, hotsBattleTag)
}

async function handleDeleteHotsAccountCommandSub(
  interaction: ChatInputCommandInteraction<CacheType>,
  discordId: string,
  hotsBattleTag: string | null
) {
  await handleDeleteHotsAccount(interaction, discordId, hotsBattleTag)
  await handleRefreshLobbyMessage(interaction, false)
}

/**
 * Handles the edit role command interaction, shows buttons to edit the user's role
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @returns {Promise<void>}
 */
export async function handleEditRoleCommand(
  interaction: chatOrButtonOrModal,
  setActive = false,
  hotsBattleTag?: string
): Promise<void> {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const player = await getPlayerByDiscordId(interaction.user.id, guildId) // Get player by Discord ID
  if (!player) {
    if (interaction.replied) {
      await interaction.followUp({
        content: 'You are not in the lobby. Click the button below to join.',
        flags: MessageFlags.Ephemeral,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
      })
      return
    }
    await safeReply(interaction, {
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    })
    return
  }
  const roles = ', current role: ' + getPlayerRolesFormatted(player.role)
  // create a button that will set this interaction to add mode
  const activeSuffix = (setActive ? '_' + CommandIds.ACTIVE : '') + (hotsBattleTag ? '_' + hotsBattleTag : '')
  const row2 = getEditRoleRow(interaction.user.id, CommandIds.ROLE_EDIT_REPLACE + activeSuffix)
  const content = (setActive ? 'You must click a role to join the lobby\n' : '') + 'Replace Mode' + roles // Default content for the reply
  await safeReply(interaction, {
    content,
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(interaction.user.id, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonEnabled(interaction.user.id, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(interaction.user.id, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
      ),
      row2,
    ],
  })
}

export async function handleEditRoleButtonCommand(
  interaction: ButtonInteraction<CacheType> | ChatInputCommandInteraction<CacheType>,
  discordId: string,
  action: string,
  role?: keyof typeof roleMap,
  setActive = false,
  hotsBattleTag?: string
) {
  if (!interaction.isButton()) {
    await safeReply(interaction, {
      content: 'This command can only be used with buttons.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const player = await getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    await safeReply(interaction, {
      content: 'You are not in the lobby. Click the button below to join.',
      flags: MessageFlags.Ephemeral,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
    })
    return
  }
  const roles = ', current role: ' + getPlayerRolesFormatted(player.role) // Get the formatted roles of the player

  const row2 = getEditRoleRow(discordId, action)
  // Handle the role editing logic based on the action
  let setActiveNext: boolean
  if (setActive === true && player.active === false && role !== undefined) {
    // If the action is set to active, we need to handle it differently
    await setPlayerActive(discordId, true, guildId, hotsBattleTag) // Set the player as active
    setActiveNext = false // Reset the active state for the next interaction
  } else {
    setActiveNext = setActive // Keep the active state as is
  }
  const activeSuffix = setActiveNext ? '_' + CommandIds.ACTIVE : ''
  const activePrefix = setActive ? 'You must click a role to join the lobby\n' : '' // Default content for the reply
  switch (action) {
    case CommandIds.ROLE_EDIT_ADD:
      await showAddButtons(interaction, guildId, discordId, player, role, roles, activePrefix, row2, activeSuffix)
      break
    case CommandIds.ROLE_EDIT_REMOVE:
      await showRemoveButtons(interaction, guildId, discordId, player, role, roles, activePrefix, row2, activeSuffix)
      break
    case CommandIds.ROLE_EDIT_REPLACE:
      await showReplaceButtons(interaction, guildId, discordId, player, role, roles, activePrefix, row2, activeSuffix)
      break
  }
  await updateLobbyMessage(guildId, interaction)
}

async function showAddButtons(
  interaction: ButtonInteraction<CacheType>,
  guildId: string,
  discordId: string,
  player: Player,
  role: string | undefined,
  roles: string,
  activePrefix: string,
  row2: ActionRowBuilder<ButtonBuilder>,
  activeSuffix: string
) {
  if (role && !player.role?.includes(role)) {
    // If the role is specified and does not exist in the player's roles, add it
    const newRoles = (player.role ?? '') + role // Append the new role
    await setPlayerRole(discordId, guildId, newRoles) // Update the player's role in the database
    player.role = newRoles
    roles = ', current role: ' + getPlayerRolesFormatted(newRoles)
  }
  await safeUpdate(interaction, {
    content:
      (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + activePrefix + 'Add Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonEnabled(discordId, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
      ),
      row2,
    ],
  })
}

async function showRemoveButtons(
  interaction: ButtonInteraction<CacheType>,
  guildId: string,
  discordId: string,
  player: Player,
  role: string | undefined,
  roles: string,
  activePrefix: string,
  row2: ActionRowBuilder<ButtonBuilder>,
  activeSuffix: string
) {
  if (role && player.role?.includes(role)) {
    // If the role is specified and exists in the player's roles, remove it
    const newRoles = (player.role ?? '')
      .split('')
      .filter(r => r !== role)
      .join('')
    await setPlayerRole(discordId, guildId, newRoles) // Update the player's role in the database
    player.role = newRoles || undefined
    roles = ', current role: ' + getPlayerRolesFormatted(newRoles)
  }
  await safeUpdate(interaction, {
    content:
      (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + activePrefix + 'Remove Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonEnabled(discordId, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
      ),
      row2,
    ],
  })
}

async function showReplaceButtons(
  interaction: ButtonInteraction<CacheType>,
  guildId: string,
  discordId: string,
  player: Player,
  role: string | undefined,
  roles: string,
  activePrefix: string,
  row2: ActionRowBuilder<ButtonBuilder>,
  activeSuffix: string
) {
  if (role) {
    await setPlayerRole(discordId, guildId, role)
    player.role = role
    roles = ', current role: ' + getPlayerRolesFormatted(role)
  }
  await safeUpdate(interaction, {
    content:
      (interaction.user.id === discordId ? '' : `**User:** <@${discordId}>\n`) + activePrefix + 'Replace Mode' + roles,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_ADD + activeSuffix, '➕'),
        createEditRoleButtonEnabled(discordId, CommandIds.ROLE_EDIT_REPLACE + activeSuffix, '🔄'),
        createEditRoleButtonDisabled(discordId, CommandIds.ROLE_EDIT_REMOVE + activeSuffix, '➖')
      ),
      row2,
    ],
  })
}

export async function handleAssignAccountCommand(
  interaction: ChatInputCommandInteraction<CacheType>
): Promise<void> {
  if (!(await userIsAdmin(interaction))) {
    return
  }

  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const accountInput = interaction.options.getString(CommandIds.ACCOUNT, true).trim()
  const targetUser = interaction.options.getUser(CommandIds.TO, true)

  const result = await setAccountSubstitution(guildId, accountInput, targetUser.id)
  if (!result.success) {
    await safeReply(interaction, {
      content: `Could not find an account matching "${accountInput}". Please verify the account exists.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await safeReply(interaction, {
    content: `✅ Successfully assigned HotS account **${result.hotsBattleTag}** (owned by <@${result.originalDiscordId}>) to <@${targetUser.id}> for this evening.`,
  })

  // Update lobby if it exists
  try {
    await updateLobbyMessage(guildId, interaction)
  } catch (err) {
    console.error('Error updating lobby message after account substitution:', err)
  }
}

export async function handleAssignAccountClearCommand(
  interaction: ChatInputCommandInteraction<CacheType>
): Promise<void> {
  if (!(await userIsAdmin(interaction))) {
    return
  }

  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const accountInput = interaction.options.getString(CommandIds.ACCOUNT)?.trim()

  const clearedCount = await clearAccountSubstitutions(guildId, accountInput ?? undefined)

  if (accountInput) {
    await safeReply(interaction, {
      content: `✅ Cleared active substitution for **${accountInput}** (${clearedCount} active substitution cleared).`,
    })
  } else {
    await safeReply(interaction, {
      content: `✅ Cleared all active account substitutions (${clearedCount} active substitutions removed).`,
    })
  }

  // Update lobby if it exists
  try {
    await updateLobbyMessage(guildId, interaction)
  } catch (err) {
    console.error('Error updating lobby message after clearing account substitution:', err)
  }
}

export async function handleAssignAccountAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focusedOption = interaction.options.getFocused(true)
  const guildId = interaction.guildId
  if (focusedOption.name !== CommandIds.ACCOUNT || !guildId) {
    await interaction.respond([])
    return
  }

  const query = focusedOption.value
  const choices =
    interaction.commandName === CommandIds.ASSIGN_ACCOUNT_CLEAR
      ? await getAssignAccountClearChoices(guildId, query)
      : await getAssignAccountChoices(guildId, query)

  await interaction.respond(choices)
}

