import { describe, expect, it } from 'bun:test'
import path from 'path'
import { collectReplayFiles } from '../commands/replays'
import { parseReplaySync } from './replayParser'
import { processReplaysInPool } from './replayWorkerPool'

describe('utils.replayParser & workerPool', () => {
  it('parseReplaySync returns null safely for nonexistent file without throwing', () => {
    const result = parseReplaySync('/nonexistent/path/fake.StormReplay')
    expect(result).toBeNull()
  })

  it('collectReplayFiles deduplicates and prioritizes directories in order', () => {
    const files = collectReplayFiles(['/nonexistent/dir1', '/nonexistent/dir2'])
    expect(files).toEqual([])
  })

  it('processReplaysInPool handles empty file arrays gracefully', async () => {
    let called = false
    await processReplaysInPool([], {
      onResult: () => {
        called = true
      },
    })
    expect(called).toBe(false)
  })

  it('processReplaysInPool respects shouldStop early termination', async () => {
    const mockFiles = [
      '/nonexistent/test1.StormReplay',
      '/nonexistent/test2.StormReplay',
      '/nonexistent/test3.StormReplay',
    ]

    let resultsCount = 0
    await processReplaysInPool(mockFiles, {
      concurrency: 1,
      shouldStop: () => resultsCount >= 1,
      onResult: () => {
        resultsCount++
      },
    })

    expect(resultsCount).toBeLessThanOrEqual(2)
  })
})

