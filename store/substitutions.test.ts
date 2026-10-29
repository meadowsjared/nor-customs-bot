import { describe, expect, it } from 'bun:test'
import {
  getAccountLoanStatusTag,
  getSubstitutedAccountOwnerTag,
} from './substitutions'
import { cachePlayerDisplayName } from './playerCache'
import { HotsAccount, AccountSubstitution } from '../types/player'

describe('store.substitutions tags', () => {
  it('getSubstitutedAccountOwnerTag formats loaned owner tag from cache', () => {
    cachePlayerDisplayName('user_owner_1', 'Norator')
    const tag = getSubstitutedAccountOwnerTag('user_owner_1')
    expect(tag).toBe(' [not @Norator]')
  })

  it('getSubstitutedAccountOwnerTag falls back to unknown when not in cache', () => {
    const tag = getSubstitutedAccountOwnerTag('non_existent_user')
    expect(tag).toBe(' [not @unknown]')
  })

  it('getAccountLoanStatusTag reports owned by when account has ownerDiscordId', () => {
    const account: HotsAccount = {
      id: 1,
      hotsBattleTag: 'LentAccount#1234',
      isPrimary: false,
      ownerDiscordId: 'owner_999',
      hpQmMMR: null,
      hpSlMMR: null,
      hpArMMR: null,
      hpQmGames: null,
      hpSlGames: null,
      hpArGames: null,
    }

    const label = getAccountLoanStatusTag(account, 'guild_1')
    expect(label).toBe(' (owned by <@owner_999>)')
  })

  it('getAccountLoanStatusTag reports loaned to when user is the lender', () => {
    const account: HotsAccount = {
      id: 2,
      hotsBattleTag: 'MyAlt#1234',
      isPrimary: true,
      hpQmMMR: null,
      hpSlMMR: null,
      hpArMMR: null,
      hpQmGames: null,
      hpSlGames: null,
      hpArGames: null,
    }

    const activeSubs: AccountSubstitution[] = [
      {
        id: 1,
        guildId: 'guild_1',
        hotsBattleTag: 'MyAlt#1234',
        originalDiscordId: 'user_lender',
        substituteDiscordId: 'user_borrower',
        replayId: null,
        date: '2026-01-01',
        isActive: true,
      },
    ]

    const label = getAccountLoanStatusTag(account, 'guild_1', 'user_lender', activeSubs)
    expect(label).toBe(' (loaned to <@user_borrower>)')
  })

  it('getAccountLoanStatusTag returns empty string when account has no loan status', () => {
    const account: HotsAccount = {
      id: 3,
      hotsBattleTag: 'Normal#1234',
      isPrimary: true,
      hpQmMMR: null,
      hpSlMMR: null,
      hpArMMR: null,
      hpQmGames: null,
      hpSlGames: null,
      hpArGames: null,
    }

    const label = getAccountLoanStatusTag(account, 'guild_1', 'user_normal', [])
    expect(label).toBe('')
  })
})
