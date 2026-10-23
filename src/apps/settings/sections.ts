import {
  Info,
  Keyboard,
  LayoutGrid,
  Monitor,
  Network,
  Palette,
  Sparkles,
  Volume2,
  type LucideIcon,
} from 'lucide-react'

export type SettingsSectionId =
  | 'appearance'
  | 'personalization'
  | 'desktop'
  | 'display'
  | 'sound'
  | 'network'
  | 'shortcuts'
  | 'system'

export interface SettingsSection {
  id: SettingsSectionId
  name: string
  icon: LucideIcon
  keywords: string[]
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'appearance', name: 'Appearance', icon: Palette, keywords: ['theme', 'dark', 'light', 'accent', 'colour', 'color', 'chrome', 'window'] },
  { id: 'personalization', name: 'Personalization', icon: Sparkles, keywords: ['wallpaper', 'background', 'live', 'dock', 'taskbar', 'magnification'] },
  {
    id: 'desktop',
    name: 'Desktop & Dock',
    icon: LayoutGrid,
    keywords: ['workspace', 'spaces', 'mission control', 'hot corners', 'session', 'restore', 'desktops', 'virtual'],
  },
  { id: 'display', name: 'Display', icon: Monitor, keywords: ['resolution', 'scale', 'brightness', 'night light', 'monitor', 'refresh'] },
  { id: 'sound', name: 'Sound', icon: Volume2, keywords: ['audio', 'volume', 'output', 'speakers', 'device'] },
  { id: 'network', name: 'Network', icon: Network, keywords: ['wifi', 'wi-fi', 'ethernet', 'bluetooth', 'internet', 'vpn'] },
  { id: 'shortcuts', name: 'Keyboard', icon: Keyboard, keywords: ['shortcuts', 'keys', 'hotkeys', 'spotlight', 'bindings'] },
  { id: 'system', name: 'System', icon: Info, keywords: ['about', 'cpu', 'memory', 'storage', 'version', 'kernel', 'uptime'] },
]
