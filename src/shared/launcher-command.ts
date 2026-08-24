export type UserCommandType = 'open-url' | 'web-search'

export type UserCommand = {
  id: string
  keyword: string
  title: string
  type: UserCommandType
  target: string
  enabled: boolean
}

export type UserCommandDraft = Omit<UserCommand, 'enabled'> & { enabled?: boolean }
export type UserCommandPatch = Partial<Pick<UserCommand, 'keyword' | 'title' | 'type' | 'target' | 'enabled'>>

export type PersistedUserCommands = {
  schemaVersion: 1
  version: number
  commands: UserCommand[]
}
