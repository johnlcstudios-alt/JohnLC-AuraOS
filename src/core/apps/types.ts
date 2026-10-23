import type { ComponentType, LazyExoticComponent } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface AppProps {
  windowId: string
  args: Record<string, unknown>
}

export type AppCategory = 'system' | 'productivity' | 'utilities' | 'media'

/**
 * A quick action offered in the app's Dock/Taskbar jump list (the equivalent of
 * a Windows jump-list task or a macOS Dock menu entry).
 */
export interface AppTask {
  id: string
  label: string
  icon?: LucideIcon
  /** arguments handed to `launchApp` when the task just opens a window */
  args?: Record<string, unknown>
  /** custom behaviour; when omitted the task launches the app with `args` */
  run?: () => void | Promise<void>
}

export interface AppDef {
  id: string
  name: string
  subtitle: string
  icon: LucideIcon
  /** gradient tint pair used by the registry-rendered app icon tile */
  tint: [string, string]
  keywords: string[]
  defaultSize: { w: number; h: number }
  minSize?: { w: number; h: number }
  singleton?: boolean
  pinned?: boolean
  searchable?: boolean
  category: AppCategory
  /** quick actions shown in the Dock/Taskbar jump list */
  tasks?: AppTask[]
  component: LazyExoticComponent<ComponentType<AppProps>>
}
