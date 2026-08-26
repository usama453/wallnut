import type { CallSessionRecord, SessionListItem } from '../../../shared/types'

export interface SessionRepository {
  save(record: CallSessionRecord): Promise<void>
  list(): Promise<SessionListItem[]>
  get(id: string): Promise<CallSessionRecord | null>
  remove(id: string): Promise<void>
}
