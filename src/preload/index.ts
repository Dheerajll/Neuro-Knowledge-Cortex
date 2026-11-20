import { contextBridge, ipcRenderer } from 'electron'

const api = {
  notes: {
    summaries: () => ipcRenderer.invoke('notes:summaries'),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    create: () => ipcRenderer.invoke('notes:create'),
    update: (id: string, patch: unknown) => ipcRenderer.invoke('notes:update', id, patch),
    remove: (id: string) => ipcRenderer.invoke('notes:delete', id)
  },
  graph: {
    get: () => ipcRenderer.invoke('graph:get')
  },
  search: {
    query: (text: string) => ipcRenderer.invoke('search:query', text),
    ask: (text: string) => ipcRenderer.invoke('search:ask', text)
  },
  attachments: {
    save: (name: string, bytes: ArrayBuffer) => ipcRenderer.invoke('attachments:save', name, bytes)
  },
  clip: (url: string) => ipcRenderer.invoke('clip:url', url),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: unknown) => ipcRenderer.invoke('settings:set', patch)
  },
  app: {
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    revealData: () => ipcRenderer.invoke('app:revealData')
  },
  onGraphChanged: (cb: () => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('graph:changed', handler)
    return () => ipcRenderer.removeListener('graph:changed', handler)
  }
}

contextBridge.exposeInMainWorld('neuron', api)