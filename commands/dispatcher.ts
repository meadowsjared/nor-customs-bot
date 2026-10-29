import {
  ButtonInteraction,
  CacheType,
  ChatInputCommandInteraction,
  Interaction,
  MessageFlags,
} from 'discord.js'
import { CommandIds, roleMap } from '../constants'
import { safeReply } from '../utils/interaction'
import {
  handleAdminAddHotsAccountButton,
  handleAdminAddHotsAccountByDiscordIdCommand,
  handleAdminAddHotsAccountCommand,
  handleAdminDeleteHotsAccountCommand,
  handleAdminPrimaryCommand,
  handleAdminRealIdNameCommand,
  handleAddHotsAccountCommand,
  handleAssignAccountAutocomplete,
  handleAssignAccountClearCommand,
  handleAssignAccountCommand,
  handleEditRoleButtonCommand,
  handleEditRoleCommand,
} from './accounts'
import {
  handleAdminSetActiveCommand,
  handleAdminSetRoleCommand,
  handleAdminShowRoleButtons,
  handleAdminUnlinkedButton,
  handleAdminUnlinkedCommand,
  handlePlayerAdjustCommand,
  updateAdminActiveButtons,
} from './admin'
import {
  handleRenameBotChannelCommand,
  handleSetBotChannelCommand,
  handleSetChannelTeamIdCommand,
  handleSetLobbyChannelCommand,
} from './channels'
import {
  handleDraftAutocomplete,
  handleDraftCaptainCommand,
  handleDraftChoiceButton,
  handleDraftCoinCallButton,
  handleDraftCommand,
  handleDraftModeCommand,
  handleDraftPickButton,
  handleDraftTeamAssignCommand,
  handleDraftToggleModeButton,
  handleDraftUndoCommand,
} from './draft'
import {
  handleClearCommand,
  handleJoinCommand,
  handleLeaveCommand,
  handleNewGameCommand,
  handleRefreshLobbyMessage,
  handleRejoinCommand,
} from './lobby'
import {
  handleDeleteHotsAccountCommand,
  handleDeletePlayerCommand,
  handleLookupAutocomplete,
  handleLookupByDiscordIdCommand,
  handleLookupCommand,
  handlePlayersAllCommand,
  handlePlayersCommand,
} from './lookup'
import {
  handleCancelMapVoteCommand,
  handleEndMapVoteCommand,
  handleMapVoteCommand,
  handleVoteMapButtonClick,
  handleVoteRemoveButtonClick,
} from './mapVote'
import {
  handleImportReplaysCommand,
  handleLookupReplaySelect,
  handleReassignReplayPlayerAutocomplete,
  handleReassignReplayPlayerCommand,
  handleRecentReplaysCommand,
} from './replays'
import { handleScanLobbyCommand } from './scanLobby'
import {
  handleChannelCommand,
  handleDeleteMessageCommand,
  handleGuideCommand,
  handleTwitchCommand,
} from './shared'
import {
  handleCheckTeamsCommand,
  handleMakeTeamsCommand,
  handleMoveCommand,
  handleMoveToLobbyCommand,
  handleMoveToTeamsCommand,
  handlePublishTeamsCommand,
  handleSetTeamsCommand,
  handleShowTeamsCommand,
  handleSwapTeamsCommand,
} from './teams'

type InteractionHandler = (
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) => Promise<unknown>

type SlashOnlyHandler = (interaction: ChatInputCommandInteraction<CacheType>) => Promise<unknown>

function wrapSlashOnly(handler: SlashOnlyHandler): InteractionHandler {
  return async interaction => {
    if (!interaction.isChatInputCommand()) {
      await safeReply(interaction, {
        content: 'This command can only be used as a slash command.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }
    await handler(interaction)
  }
}

/**
 * Registry of exact-match command and button custom ID handlers.
 */
const exactHandlers = new Map<string, InteractionHandler>([
  [CommandIds.NEW_GAME, handleNewGameCommand],
  [CommandIds.SCAN_LOBBY, handleScanLobbyCommand],
  [CommandIds.SET_TEAMS, handleSetTeamsCommand],
  [CommandIds.MAKE_TEAMS, handleMakeTeamsCommand],
  [CommandIds.DRAFT, handleDraftCommand],
  [CommandIds.DRAFT_CAPTAIN, handleDraftCaptainCommand],
  [CommandIds.DRAFT_TEAM_ASSIGN, handleDraftTeamAssignCommand],
  [CommandIds.DRAFT_MODE, handleDraftModeCommand],
  [CommandIds.DRAFT_UNDO, handleDraftUndoCommand],
  [CommandIds.SWAP_PLAYERS, handleSwapTeamsCommand],
  [CommandIds.PUBLISH_TEAMS, handlePublishTeamsCommand],
  [CommandIds.SHOW_TEAMS, handleShowTeamsCommand],
  [CommandIds.SET_CHANNEL_TEAM_ID, handleSetChannelTeamIdCommand],
  [CommandIds.SET_LOBBY_CHANNEL, handleSetLobbyChannelCommand],
  [CommandIds.SET_BOT_CHANNEL, handleSetBotChannelCommand],
  [CommandIds.RENAME_BOT_CHANNEL, handleRenameBotChannelCommand],
  [CommandIds.MOVE_TO_LOBBY, handleMoveToLobbyCommand],
  [CommandIds.MOVE_TO_TEAMS, handleMoveToTeamsCommand],
  [CommandIds.HELP, handleGuideCommand],
  [CommandIds.GUIDE, handleGuideCommand],
  [CommandIds.JOIN, handleJoinCommand],
  [CommandIds.REJOIN, handleRejoinCommand],
  [CommandIds.LEAVE, handleLeaveCommand],
  [CommandIds.CLEAR, handleClearCommand],
  [CommandIds.PLAYERS, async i => handlePlayersCommand(i)],
  [CommandIds.PLAYERS_RAW, async i => handlePlayersCommand(i, true)],
  [CommandIds.PLAYERS_ALL, async i => handlePlayersAllCommand(i)],
  [CommandIds.ADD_ACCOUNT, handleAddHotsAccountCommand],
  [CommandIds.ROLE, handleEditRoleCommand],
  [CommandIds.TWITCH, handleTwitchCommand],
  [`${CommandIds.LOOKUP}_${CommandIds.DISCORD_ID}`, handleLookupByDiscordIdCommand],
  [CommandIds.LOOKUP, handleLookupCommand],
  [CommandIds.DELETE_PLAYER, handleDeletePlayerCommand],
  [CommandIds.DELETE_HOTS_ACCOUNT, handleDeleteHotsAccountCommand],
  ['refresh_lobby', handleRefreshLobbyMessage],
  [CommandIds.MOVE, wrapSlashOnly(handleMoveCommand)],
  [CommandIds.DELETE_MESSAGE, handleDeleteMessageCommand],
  [CommandIds.IMPORT_REPLAYS, handleImportReplaysCommand],
  [CommandIds.REASSIGN_REPLAY_PLAYER, wrapSlashOnly(handleReassignReplayPlayerCommand)],
  [CommandIds.RECENT_REPLAYS, wrapSlashOnly(handleRecentReplaysCommand)],
  [CommandIds.CHANNEL_COMMAND, wrapSlashOnly(handleChannelCommand)],
  [CommandIds.ADMIN, wrapSlashOnly(handleAdminSubCommand)],
  [`${CommandIds.ADMIN}_${CommandIds.ACTIVE}_${CommandIds.REFRESH}`, async i => updateAdminActiveButtons(i, false, true)],
  [CommandIds.MAP_VOTE, wrapSlashOnly(handleMapVoteCommand)],
  [CommandIds.END_MAP_VOTE, handleEndMapVoteCommand],
  [CommandIds.CANCEL_MAP_VOTE, handleCancelMapVoteCommand],
  [CommandIds.PLAYER_ADJUST, wrapSlashOnly(handlePlayerAdjustCommand)],
  [CommandIds.CHECK_TEAMS, handleCheckTeamsCommand],
  [CommandIds.ASSIGN_ACCOUNT, wrapSlashOnly(handleAssignAccountCommand)],
  [CommandIds.ASSIGN_ACCOUNT_CLEAR, wrapSlashOnly(handleAssignAccountClearCommand)],
])

/**
 * Handles subcommands for `/admin <subcommand>`
 */
async function handleAdminSubCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const subCommand = interaction.options.getSubcommand(true)
  switch (subCommand) {
    case CommandIds.ROLE:
      await handleAdminSetRoleCommand(interaction)
      break
    case CommandIds.ACTIVE:
      await handleAdminSetActiveCommand(interaction)
      break
    case `${CommandIds.ADD_ACCOUNT}_${CommandIds.DISCORD_ID}`:
      await handleAdminAddHotsAccountByDiscordIdCommand(interaction)
      break
    case CommandIds.ADD_ACCOUNT:
      await handleAdminAddHotsAccountCommand(interaction)
      break
    case CommandIds.DELETE_ACCOUNT:
      await handleAdminDeleteHotsAccountCommand(interaction)
      break
    case CommandIds.PRIMARY:
      await handleAdminPrimaryCommand(interaction)
      break
    case CommandIds.REAL_ID_NAME:
      await handleAdminRealIdNameCommand(interaction)
      break
    case CommandIds.UNLINKED:
      await handleAdminUnlinkedCommand(interaction)
      break
  }
}

function getCommandName(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
): string | null {
  if (interaction.isButton()) {
    return interaction.customId
  } else if (interaction.isChatInputCommand()) {
    return interaction.commandName
  }
  return null
}

function isAdminSetActiveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  part0: string,
  part1: string,
  part2: string,
  part3: string
): boolean {
  return (
    interaction.isButton() &&
    part0 === CommandIds.ADMIN &&
    part1 === CommandIds.ACTIVE &&
    (/^\d{17,19}$/.test(part2) || part2.startsWith('hotsRowId:')) &&
    ['true', 'false'].includes(part3.toLowerCase())
  )
}

function isRoleCommandId(commandName: string): commandName is CommandIds {
  const commandAr = Object.values<string>([
    CommandIds.ROLE_EDIT_ADD,
    CommandIds.ROLE_EDIT_REPLACE,
    CommandIds.ROLE_EDIT_REMOVE,
  ])
  return commandAr.includes(commandName)
}

async function handleUnknownCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  commandName: string
) {
  await safeReply(interaction, {
    content: `Unknown command: ${commandName}. Please use a valid command.`,
    flags: MessageFlags.Ephemeral,
  })
  if (process.env.DEBUG === 'true') {
    console.log('invalid command:', commandName)
  }
}

/**
 * Handles dynamic/pattern-based button interactions.
 */
async function handlePatternCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  commandName: string
): Promise<void> {
  if (!commandName.includes('_') || interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'Unknown command. Please use a valid command. ' + commandName,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const parts = commandName.split('_')

  if (parts[0] === CommandIds.VOTE_MAP_BTN && interaction.isButton()) {
    await handleVoteMapButtonClick(interaction, parts[1], parts[2])
    return
  }
  if (parts[0] === CommandIds.REMOVE_MAP_VOTE && interaction.isButton()) {
    await handleVoteRemoveButtonClick(interaction, parts[1])
    return
  }
  if (parts[0] === CommandIds.END_MAP_VOTE && interaction.isButton()) {
    await handleEndMapVoteCommand(interaction, parts[1])
    return
  }

  if (parts.length === 2) {
    switch (parts[0]) {
      case CommandIds.JOIN:
        await handleAdminSetActiveCommand(interaction, parts[1], true)
        return
      case CommandIds.LEAVE:
        await handleAdminSetActiveCommand(interaction, parts[1], false)
        return
      case CommandIds.ROLE:
        await handleAdminShowRoleButtons(interaction, parts[1])
        return
      case CommandIds.ADD_ACCOUNT:
        await handleAdminAddHotsAccountButton(interaction, parts[1])
        return
      case CommandIds.JOIN_WITH_BATTLE_TAG:
        await handleJoinCommand(interaction, parts[1])
        return
    }
  }

  if (parts.length === 3 && parts[0] === CommandIds.ROLE_ADMIN) {
    await handleAdminSetRoleCommand(interaction, parts[1], parts[2])
    return
  }

  if (parts.length === 2 && isRoleCommandId(parts[0])) {
    await handleEditRoleButtonCommand(interaction, parts[1], parts[0])
    return
  }

  if (parts.length === 3 && isRoleCommandId(parts[0])) {
    if (parts[1] === CommandIds.ACTIVE) {
      await handleEditRoleButtonCommand(interaction, parts[2], parts[0], undefined, true)
    } else if (parts[2] in roleMap) {
      await handleEditRoleButtonCommand(interaction, parts[1], parts[0], parts[2])
    }
    return
  }

  if (parts.length === 4 && parts[0].startsWith(CommandIds.PLAYERS_ALL_PAGE)) {
    switch (parts[0]) {
      case CommandIds.PLAYERS_ALL_PAGE:
      case CommandIds.PLAYERS_ALL_PAGE_SORT:
        await handlePlayersAllCommand(
          interaction,
          true,
          parts[1] === 'mmr' ? 'mmr' : 'alphabetical',
          parts[2] === 'true',
          parts[3]
        )
        return
    }
  }

  if (parts.length === 4 && isAdminSetActiveCommand(interaction, parts[0], parts[1], parts[2], parts[3])) {
    await handleAdminSetActiveCommand(interaction, parts[2], parts[3] === 'true', true)
    return
  }

  if (parts.length === 5 && isRoleCommandId(parts[0])) {
    await handleEditRoleButtonCommand(
      interaction,
      parts[3],
      parts[0],
      parts[4],
      parts[1] === CommandIds.ACTIVE,
      parts[2]
    )
    return
  }

  if (parts.length === 6 && parts[0] === CommandIds.ADMIN && parts[1] === CommandIds.PRIMARY) {
    await handleAdminPrimaryCommand(interaction, parts[2], parts[3], parts[4], parts[5])
    return
  }

  if (interaction.isButton() && interaction.customId.startsWith('draft_pick:')) {
    const pickedPlayerId = interaction.customId.split(':')[1]
    await handleDraftPickButton(interaction, pickedPlayerId)
    return
  }

  if (interaction.isButton() && interaction.customId.startsWith('draft_coin:')) {
    const callStr = interaction.customId.split(':')[1]
    const call: 'heads' | 'tails' = callStr === 'heads' ? 'heads' : 'tails'
    await handleDraftCoinCallButton(interaction, call)
    return
  }

  if (interaction.isButton() && interaction.customId.startsWith('draft_choice:')) {
    const choiceStr = interaction.customId.split(':')[1]
    const isFirstPick = choiceStr === 'first'
    await handleDraftChoiceButton(interaction, isFirstPick)
    return
  }

  if (interaction.isButton() && interaction.customId === 'draft_undo') {
    await handleDraftUndoCommand(interaction)
    return
  }

  if (interaction.isButton() && interaction.customId === 'draft_toggle_mode') {
    await handleDraftToggleModeButton(interaction)
    return
  }

  await handleUnknownCommand(interaction, commandName)
}

/**
 * Top-level interaction dispatcher that routes incoming Discord interactions.
 */
export async function dispatchInteraction(interaction: Interaction<CacheType>): Promise<void> {
  if (interaction.isAutocomplete()) {
    if (
      interaction.commandName === CommandIds.DRAFT ||
      interaction.commandName === CommandIds.DRAFT_CAPTAIN ||
      interaction.commandName === CommandIds.DRAFT_TEAM_ASSIGN
    ) {
      await handleDraftAutocomplete(interaction)
      return
    }
    if (
      interaction.commandName === CommandIds.LOOKUP ||
      interaction.commandName === CommandIds.ADD_ACCOUNT ||
      interaction.options.getFocused(true).name === CommandIds.BATTLE_TAG
    ) {
      await handleLookupAutocomplete(interaction)
      return
    }
    if (
      interaction.commandName === CommandIds.ASSIGN_ACCOUNT ||
      interaction.commandName === CommandIds.ASSIGN_ACCOUNT_CLEAR
    ) {
      await handleAssignAccountAutocomplete(interaction)
      return
    }
    if (
      interaction.commandName === CommandIds.REASSIGN_REPLAY_PLAYER ||
      interaction.commandName === CommandIds.RECENT_REPLAYS
    ) {
      await handleReassignReplayPlayerAutocomplete(interaction)
      return
    }
    return
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('lookup_replay_select:')) {
    await handleLookupReplaySelect(interaction)
    return
  }

  if (!interaction.isChatInputCommand() && !interaction.isButton()) return

  if (interaction.isButton() && interaction.customId.startsWith('admin_unlinked_')) {
    await handleAdminUnlinkedButton(interaction)
    return
  }

  if (interaction.isButton() && interaction.customId.startsWith('mapvote:')) {
    const parts = interaction.customId.split(':')
    const action = parts[1]
    const sessionId = parts[2]
    const mapId = parts[3]

    if (action === 'vote') {
      await handleVoteMapButtonClick(interaction, sessionId, mapId)
      return
    } else if (action === 'remove') {
      await handleVoteRemoveButtonClick(interaction, sessionId)
      return
    } else if (action === 'end') {
      await handleEndMapVoteCommand(interaction, sessionId)
      return
    } else if (action === 'cancel') {
      await handleCancelMapVoteCommand(interaction, sessionId)
      return
    }
  }

  const commandName = getCommandName(interaction)
  if (!commandName) return

  const handler = exactHandlers.get(commandName)
  if (handler) {
    await handler(interaction)
    return
  }

  await handlePatternCommand(interaction, commandName)
}
