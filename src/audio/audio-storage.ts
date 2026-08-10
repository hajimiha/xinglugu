import Dexie, { type Table } from 'dexie'

export interface StoredBgm {
  id: 'active-bgm'
  name: string
  type: string
  blob: Blob
  updatedAt: number
}

export interface AudioStorage {
  load(): Promise<StoredBgm | undefined>
  save(asset: StoredBgm): Promise<void>
  clear(): Promise<void>
}

class MistvaleAudioDatabase extends Dexie {
  assets!: Table<StoredBgm, string>

  constructor() {
    super('mistvale-local-audio')
    this.version(1).stores({ assets: 'id' })
  }
}

export function createAudioStorage(): AudioStorage {
  const database = new MistvaleAudioDatabase()
  return {
    load: () => database.assets.get('active-bgm'),
    save: async (asset) => { await database.assets.put(asset) },
    clear: async () => { await database.assets.delete('active-bgm') },
  }
}

