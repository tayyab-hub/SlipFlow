/**
 * Canonical IPC channel names. Never inline a raw channel string anywhere else —
 * main, preload and renderer all import from here so a rename can't half-apply.
 */
export const IpcChannels = {
  appInfo: 'app:info'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
