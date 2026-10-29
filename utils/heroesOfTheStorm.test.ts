import { describe, expect, it } from 'bun:test'
import { validateBattleTag } from './heroesOfTheStorm'

describe('validateBattleTag', () => {
  it('should accept valid standard BattleTags', () => {
    expect(validateBattleTag('Arthas#1234')).toEqual({ isValid: true })
    expect(validateBattleTag('Jaina#12345')).toEqual({ isValid: true })
    expect(validateBattleTag('Illidan#999999')).toEqual({ isValid: true })
    expect(validateBattleTag('Valla#1000')).toEqual({ isValid: true })
  })

  it('should reject BattleTags missing the hash symbol', () => {
    const result = validateBattleTag('Arthas1234')
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.errors.some(e => e.includes('Missing # separator'))).toBe(true)
    }
  })

  it('should reject names that are too short or too long', () => {
    const shortResult = validateBattleTag('AB#1234')
    expect(shortResult.isValid).toBe(false)
    if (!shortResult.isValid) {
      expect(shortResult.errors.some(e => e.includes('3-12 characters'))).toBe(true)
    }

    const longResult = validateBattleTag('WayTooLongPlayerName#1234')
    expect(longResult.isValid).toBe(false)
    if (!longResult.isValid) {
      expect(longResult.errors.some(e => e.includes('3-12 characters'))).toBe(true)
    }
  })

  it('should reject names that start with a number', () => {
    const result = validateBattleTag('1Arthas#1234')
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.errors.some(e => e.includes('cannot start with a number'))).toBe(true)
    }
  })

  it('should reject names containing spaces or special characters', () => {
    const spaceResult = validateBattleTag('Art has#1234')
    expect(spaceResult.isValid).toBe(false)
    if (!spaceResult.isValid) {
      expect(spaceResult.errors.some(e => e.includes('spaces or invalid symbols'))).toBe(true)
    }

    const symbolResult = validateBattleTag('Art@has#1234')
    expect(symbolResult.isValid).toBe(false)
    if (!symbolResult.isValid) {
      expect(symbolResult.errors.some(e => e.includes('spaces or invalid symbols'))).toBe(true)
    }
  })

  it('should reject hash numbers with fewer than 4 digits', () => {
    const result = validateBattleTag('Arthas#123')
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.errors.some(e => e.includes('at least 4 digits'))).toBe(true)
    }
  })

  it('should reject non-numeric characters in the tag number', () => {
    const result = validateBattleTag('Arthas#123a')
    expect(result.isValid).toBe(false)
    if (!result.isValid) {
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })
})
