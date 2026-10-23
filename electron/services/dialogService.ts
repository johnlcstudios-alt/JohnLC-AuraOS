import { dialog, BrowserWindow } from 'electron'
import type {
  MessageOptions,
  MessageResult,
  OpenFileOptions,
  SaveFileOptions,
} from '../../shared/bridge'

/** Native open/save/message dialogs, parented to the host window when present. */
export const dialogService = {
  async openFile(opts: OpenFileOptions = {}, parent: BrowserWindow | null): Promise<string[] | null> {
    const properties: Array<'openFile' | 'multiSelections' | 'openDirectory'> = []
    if (opts.directory) properties.push('openDirectory')
    else properties.push('openFile')
    if (opts.multi) properties.push('multiSelections')

    const result = await dialog.showOpenDialog(parent ?? undefined!, {
      title: opts.title,
      defaultPath: opts.defaultPath,
      filters: opts.filters,
      properties,
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths.map((p) => p.replace(/\\/g, '/'))
  },

  async saveFile(opts: SaveFileOptions = {}, parent: BrowserWindow | null): Promise<string | null> {
    const result = await dialog.showSaveDialog(parent ?? undefined!, {
      title: opts.title,
      defaultPath: opts.defaultPath,
      filters: opts.filters,
      buttonLabel: opts.buttonLabel,
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath.replace(/\\/g, '/')
  },

  async message(opts: MessageOptions, parent: BrowserWindow | null): Promise<MessageResult> {
    const result = await dialog.showMessageBox(parent ?? undefined!, {
      type: opts.type ?? 'info',
      title: opts.title,
      message: opts.message,
      detail: opts.detail,
      buttons: opts.buttons ?? ['OK'],
      defaultId: opts.defaultId ?? 0,
      cancelId: opts.cancelId,
      checkboxLabel: opts.checkboxLabel,
    })
    return { response: result.response, checkboxChecked: result.checkboxChecked }
  },
}
