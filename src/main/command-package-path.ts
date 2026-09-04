const COMMAND_PACKAGE_SUFFIX = '.quickcmd.json'

export function isCommandPackagePath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && !value.startsWith('-')
    && value.toLocaleLowerCase().endsWith(COMMAND_PACKAGE_SUFFIX)
}

export function findCommandPackagePath(argumentsList: readonly unknown[]): string | undefined {
  return argumentsList.find(isCommandPackagePath)
}
