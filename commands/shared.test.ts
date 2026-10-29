import { describe, expect, it } from 'bun:test'
import { ButtonBuilder, ButtonStyle, ChatInputCommandInteraction } from 'discord.js'
import {
  createButtonRows,
  extractDiscordIdFromInteraction,
  formatDateToMMDDYYYY,
  getDiscordId,
} from './shared'

describe('commands.shared.formatDateToMMDDYYYY', () => {
  it('formats single-digit months and days with leading zeros', () => {
    // Note: Month is 0-indexed in JavaScript Date (2 = March)
    const date = new Date(2026, 2, 5)
    expect(formatDateToMMDDYYYY(date)).toBe('03-05-2026')
  })

  it('formats double-digit months and days correctly', () => {
    const date = new Date(2026, 11, 25)
    expect(formatDateToMMDDYYYY(date)).toBe('12-25-2026')
  })
})

describe('commands.shared.createButtonRows', () => {
  it('returns an empty array when given no buttons', () => {
    const rows = createButtonRows([])
    expect(rows).toEqual([])
  })

  it('splits buttons into chunks of 5 per row', () => {
    const buttons = Array.from({ length: 12 }, (_, i) =>
      new ButtonBuilder().setCustomId(`btn_${i}`).setLabel(`Button ${i}`).setStyle(ButtonStyle.Primary)
    )

    const rows = createButtonRows(buttons)
    expect(rows.length).toBe(3)
    expect(rows[0].components.length).toBe(5)
    expect(rows[1].components.length).toBe(5)
    expect(rows[2].components.length).toBe(2)
  })

  it('caps at the Discord limit of 25 buttons (5 rows of 5)', () => {
    const buttons = Array.from({ length: 30 }, (_, i) =>
      new ButtonBuilder().setCustomId(`btn_${i}`).setLabel(`Button ${i}`).setStyle(ButtonStyle.Primary)
    )

    const rows = createButtonRows(buttons)
    expect(rows.length).toBe(5)
    const totalRenderedButtons = rows.reduce((acc, row) => acc + row.components.length, 0)
    expect(totalRenderedButtons).toBe(25)
  })
})

describe('commands.shared.extractDiscordIdFromInteraction', () => {
  it('strips mention symbols <@...> from raw option value', () => {
    const mockInteraction = {
      options: {
        getMember: () => null,
        getUser: () => null,
        get: (name: string) => (name === 'discord_id' ? { value: '<@987654321>' } : null),
      },
    }

    // Type-safe duck typed mock without using the "as" keyword
    const interaction: ChatInputCommandInteraction = Object.assign(
      Object.create(ChatInputCommandInteraction.prototype),
      mockInteraction
    )

    expect(extractDiscordIdFromInteraction(interaction, 'discord_id')).toBe('987654321')
  })

  it('strips nickname mention symbols <@!...> from raw option value', () => {
    const mockInteraction = {
      options: {
        getMember: () => null,
        getUser: () => null,
        get: (name: string) => (name === 'discord_id' ? { value: '<@!987654321>' } : null),
      },
    }

    const interaction: ChatInputCommandInteraction = Object.assign(
      Object.create(ChatInputCommandInteraction.prototype),
      mockInteraction
    )

    expect(extractDiscordIdFromInteraction(interaction, 'discord_id')).toBe('987654321')
  })

  it('extracts id from user option if present', () => {
    const mockInteraction = {
      options: {
        getMember: () => null,
        getUser: (name: string) => (name === 'discord_id' ? { id: '555666777' } : null),
        get: () => null,
      },
    }

    const interaction: ChatInputCommandInteraction = Object.assign(
      Object.create(ChatInputCommandInteraction.prototype),
      mockInteraction
    )

    expect(extractDiscordIdFromInteraction(interaction, 'discord_id')).toBe('555666777')
  })

  it('extracts id from member option if present', () => {
    const mockInteraction = {
      options: {
        getMember: (name: string) => (name === 'discord_id' ? { user: { id: '111222333' } } : null),
        getUser: () => null,
        get: () => null,
      },
    }

    const interaction: ChatInputCommandInteraction = Object.assign(
      Object.create(ChatInputCommandInteraction.prototype),
      mockInteraction
    )

    expect(extractDiscordIdFromInteraction(interaction, 'discord_id')).toBe('111222333')
  })
})

describe('commands.shared.getDiscordId', () => {
  it('cleans mention characters when passed as discordIdParam', () => {
    const mockInteraction = {
      isChatInputCommand: () => false,
    }
    const interaction: ChatInputCommandInteraction = Object.assign(
      Object.create(ChatInputCommandInteraction.prototype),
      mockInteraction
    )

    expect(getDiscordId(interaction, 'guild_1', '<@123456789>')).toBe('123456789')
    expect(getDiscordId(interaction, 'guild_1', '<@!123456789>')).toBe('123456789')
  })
})

