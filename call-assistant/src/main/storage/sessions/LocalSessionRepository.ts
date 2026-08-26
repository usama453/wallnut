import { app } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { CallSessionRecord, SessionListItem } from '../../../shared/types'
import type { SessionRepository } from './SessionRepository'

export class LocalSessionRepository implements SessionRepository {
  private dir: string

  constructor(baseDir?: string) {
    this.dir = baseDir ?? path.join(app.getPath('userData'), 'sessions')
    fs.mkdirSync(this.dir, { recursive: true })
  }

  private fileFor(id: string): string {
    return path.join(this.dir, `${id}.json`)
  }

  async save(record: CallSessionRecord): Promise<void> {
    const file = this.fileFor(record.id)
    const tmp = `${file}.tmp`
    await fsp.writeFile(tmp, JSON.stringify(record, null, 2), 'utf8')
    await fsp.rename(tmp, file)
  }

  async list(): Promise<SessionListItem[]> {
    let names: string[] = []
    try {
      names = await fsp.readdir(this.dir)
    } catch {
      return []
    }
    const items: SessionListItem[] = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      try {
        const raw = await fsp.readFile(path.join(this.dir, name), 'utf8')
        const rec = JSON.parse(raw) as CallSessionRecord
        items.push({
          id: rec.id,
          name: rec.name,
          createdAt: rec.createdAt,
          durationSeconds: rec.durationSeconds,
          summary: rec.summary,
          transcriptLength: Array.isArray(rec.transcript) ? rec.transcript.length : 0
        })
      } catch {
        // skip corrupt files
      }
    }
    items.sort((a, b) => b.createdAt - a.createdAt)
    return items
  }

  async get(id: string): Promise<CallSessionRecord | null> {
    try {
      const raw = await fsp.readFile(this.fileFor(id), 'utf8')
      return JSON.parse(raw) as CallSessionRecord
    } catch {
      return null
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await fsp.unlink(this.fileFor(id))
    } catch {
      // already gone
    }
  }
}
