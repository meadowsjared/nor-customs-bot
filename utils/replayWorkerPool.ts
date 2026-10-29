import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { Worker } from 'node:worker_threads'
import type { ReplayData } from '../types/replay'
import { parseReplaySync } from './replayParser'

export interface ProcessReplayResult {
  file: string
  data: ReplayData | null
  processedCount: number
  totalCount: number
}

export interface ProcessReplaysOptions {
  concurrency?: number
  onResult: (result: ProcessReplayResult) => Promise<void> | void
  shouldStop?: () => boolean
}

interface WorkerMessagePayload {
  id: number
  file: string
  data: ReplayData | null
  error?: string
}

function resolveWorkerScriptPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const cjsCandidate = path.join(currentDir, 'replayWorker.cjs')
  if (fs.existsSync(cjsCandidate)) {
    return cjsCandidate
  }
  return path.resolve('utils/replayWorker.cjs')
}

/**
 * Runs replay parsing in parallel using a pool of background worker threads.
 * Falls back to in-thread parsing if worker thread creation fails.
 */
export async function processReplaysInPool(
  files: string[],
  options: ProcessReplaysOptions
): Promise<void> {
  const totalCount = files.length
  if (totalCount === 0) return

  const defaultConcurrency = Math.min(Math.max(os.cpus().length - 1, 1), 6)
  const concurrency = Math.min(options.concurrency ?? defaultConcurrency, totalCount)

  const workerScript = resolveWorkerScriptPath()

  let nextIndex = 0
  let processedCount = 0
  let isStopped = false

  const checkShouldStop = (): boolean => {
    if (isStopped) return true
    if (options.shouldStop && options.shouldStop()) {
      isStopped = true
      return true
    }
    return false
  }

  try {
    const workers: Worker[] = []
    for (let w = 0; w < concurrency; w++) {
      workers.push(new Worker(workerScript))
    }

    const runWorkerTask = (worker: Worker): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const dispatchNext = () => {
          if (checkShouldStop() || nextIndex >= files.length) {
            resolve()
            return
          }

          const fileIndex = nextIndex++
          const fileToParse = files[fileIndex]

          const onMessage = async (msg: WorkerMessagePayload) => {
            if (msg.id !== fileIndex) return
            worker.off('message', onMessage)
            worker.off('error', onError)

            processedCount++
            try {
              await options.onResult({
                file: fileToParse,
                data: msg.data,
                processedCount,
                totalCount,
              })
            } catch (err) {
              console.error(`Error processing replay result for ${fileToParse}:`, err)
            }

            dispatchNext()
          }

          const onError = (err: Error) => {
            worker.off('message', onMessage)
            worker.off('error', onError)
            console.error(`Worker error while parsing ${fileToParse}:`, err)

            processedCount++
            dispatchNext()
          }

          worker.on('message', onMessage)
          worker.on('error', onError)
          worker.postMessage({ id: fileIndex, file: fileToParse })
        }

        dispatchNext()
      })
    }

    await Promise.all(workers.map(w => runWorkerTask(w)))

    for (const w of workers) {
      w.terminate().catch(() => {})
    }
  } catch (poolError) {
    console.warn('Worker pool execution encountered an error, falling back to synchronous parsing:', poolError)
    while (nextIndex < files.length && !checkShouldStop()) {
      const fileToParse = files[nextIndex++]
      const data = parseReplaySync(fileToParse)
      processedCount++
      await options.onResult({
        file: fileToParse,
        data,
        processedCount,
        totalCount,
      })
    }
  }
}

