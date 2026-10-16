import { ipcMain as electronIpc, type WebContents } from 'electron'

const renderers = new Map<number, string>()
export function trustRenderer(contents: WebContents, url: string): void {
  renderers.set(contents.id, url)
  contents.once('destroyed', () => renderers.delete(contents.id))
}

function trusted(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): void {
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame)
    throw new Error('IPC is restricted to the application main frame.')
  const url = event.senderFrame.url
  const allowed = renderers.get(event.sender.id)
  if (!allowed || new URL(url).href !== new URL(allowed).href)
    throw new Error('Untrusted IPC sender.')
}
export const ipcMain = {
  handle(
    channel: string,
    listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown
  ): void {
    electronIpc.handle(channel, (event, ...args: unknown[]) => {
      trusted(event)
      return listener(event, ...args)
    })
  },
  on(channel: string, listener: (event: Electron.IpcMainEvent, ...args: unknown[]) => void): void {
    electronIpc.on(channel, (event, ...args: unknown[]) => {
      try {
        trusted(event)
        listener(event, ...args)
      } catch {
        /* reject untrusted messages */
      }
    })
  }
}
