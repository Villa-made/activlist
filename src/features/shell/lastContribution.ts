const STORAGE_KEY = 'activlist:lastContributionId'

export function getLastContributionId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setLastContributionId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // ignore quota / private mode
  }
}
