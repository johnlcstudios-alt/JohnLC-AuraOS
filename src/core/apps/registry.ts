import { lazy } from 'react'
import {
  Activity,
  AlarmClock,
  BellRing,
  Calculator,
  CalendarDays,
  Check,
  Clock,
  Download,
  Files,
  FileText,
  Film,
  Flag,
  FolderOpen,
  Globe,
  Heart,
  Home,
  Image,
  Info,
  ListChecks,
  Music,
  Play,
  Plus,
  Radio,
  Settings,
  Sigma,
  StickyNote,
  TerminalSquare,
  Users,
} from 'lucide-react'
import type { AppDef } from './types'
import { appPins } from './pins'
import { SETTINGS_SECTIONS } from '../../apps/settings/sections'
import { wm } from '../wm/WindowManager'
import { bus, EVT, type AppArgsEvent } from '../bus'

/**
 * The JohnLC AuraOS app registry.
 *
 * Every built-in app is code-split: the shell only pulls an app's bundle the
 * first time it is launched. Adding an app means adding one entry here.
 */
export const APPS: Record<string, AppDef> = {
  files: {
    id: 'files',
    name: 'Files',
    subtitle: 'Browse and organise your files',
    icon: Files,
    tint: ['#f5c542', '#ff9f43'],
    keywords: ['finder', 'explorer', 'browse', 'documents', 'folder'],
    defaultSize: { w: 1040, h: 660 },
    minSize: { w: 720, h: 420 },
    pinned: true,
    category: 'system',
    tasks: [
      { id: 'home', label: 'Home', icon: Home, args: { path: '~' } },
      { id: 'documents', label: 'Documents', icon: FileText, args: { path: '~/Documents' } },
      { id: 'downloads', label: 'Downloads', icon: Download, args: { path: '~/Downloads' } },
      { id: 'desktop', label: 'Desktop', icon: FolderOpen, args: { path: '~/Desktop' } },
    ],
    component: lazy(() => import('../../apps/files/FilesApp')),
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    subtitle: 'Shell access with tabs',
    icon: TerminalSquare,
    tint: ['#2ecf7f', '#22c9c9'],
    keywords: ['console', 'shell', 'command', 'bash', 'pwsh', 'cli'],
    defaultSize: { w: 800, h: 500 },
    minSize: { w: 480, h: 280 },
    pinned: true,
    category: 'system',
    component: lazy(() => import('../../apps/terminal/TerminalApp')),
  },
  settings: {
    id: 'settings',
    name: 'Settings',
    subtitle: 'Appearance, display, audio, network',
    icon: Settings,
    tint: ['#8a93a6', '#5b6472'],
    keywords: ['preferences', 'appearance', 'theme', 'display', 'network', 'audio', 'about'],
    defaultSize: { w: 940, h: 640 },
    minSize: { w: 720, h: 460 },
    singleton: true,
    pinned: true,
    category: 'system',
    tasks: SETTINGS_SECTIONS.map((section) => ({
      id: section.id,
      label: section.name,
      icon: section.icon,
      args: { section: section.id },
    })),
    component: lazy(() => import('../../apps/settings/SettingsApp')),
  },
  taskmanager: {
    id: 'taskmanager',
    name: 'Task Manager',
    subtitle: 'Processes, CPU and memory',
    icon: Activity,
    tint: ['#4f8cff', '#a06bff'],
    keywords: ['activity monitor', 'processes', 'cpu', 'memory', 'performance', 'kill'],
    defaultSize: { w: 900, h: 620 },
    minSize: { w: 640, h: 420 },
    singleton: true,
    pinned: true,
    category: 'utilities',
    component: lazy(() => import('../../apps/taskmgr/TaskManagerApp')),
  },
  about: {
    id: 'about',
    name: 'About JohnLC AuraOS',
    subtitle: 'Version and system details',
    icon: Info,
    tint: ['#6aa8ff', '#a06bff'],
    keywords: ['about', 'version', 'credits', 'system'],
    defaultSize: { w: 460, h: 420 },
    minSize: { w: 420, h: 360 },
    singleton: true,
    searchable: true,
    category: 'system',
    component: lazy(() => import('../../apps/about/AboutApp')),
  },
  calculator: {
    id: 'calculator',
    name: 'Calculator',
    subtitle: 'Standard and scientific arithmetic',
    icon: Calculator,
    tint: ['#8b93ff', '#6a5bff'],
    keywords: ['calc', 'calculator', 'maths', 'math', 'arithmetic', 'sum', 'convert'],
    defaultSize: { w: 324, h: 528 },
    minSize: { w: 300, h: 456 },
    singleton: true,
    searchable: true,
    category: 'utilities',
    tasks: [
      { id: 'standard', label: 'Standard', icon: Calculator, args: { mode: 'standard' } },
      { id: 'scientific', label: 'Scientific', icon: Sigma, args: { mode: 'scientific' } },
    ],
    component: lazy(() => import('../../apps/calculator/CalculatorApp')),
  },
  notes: {
    id: 'notes',
    name: 'Notes',
    subtitle: 'Notes that save themselves',
    icon: StickyNote,
    tint: ['#ffe27a', '#ffb703'],
    keywords: ['notes', 'note', 'memo', 'notepad', 'write', 'journal', 'scratch'],
    defaultSize: { w: 900, h: 590 },
    minSize: { w: 620, h: 400 },
    singleton: true,
    searchable: true,
    category: 'productivity',
    tasks: [
      {
        id: 'new-note',
        label: 'New Note',
        icon: Plus,
        run: () => {
          launchApp('notes', { intent: 'new-note' })
        },
      },
    ],
    component: lazy(() => import('../../apps/notes/NotesApp')),
  },
  clock: {
    id: 'clock',
    name: 'Clock',
    subtitle: 'World clock, alarms, timer and stopwatch',
    icon: Clock,
    tint: ['#7dd3fc', '#4f8cff'],
    keywords: ['clock', 'time', 'alarm', 'timer', 'stopwatch', 'world', 'zone', 'timezone'],
    defaultSize: { w: 760, h: 560 },
    minSize: { w: 560, h: 430 },
    singleton: true,
    searchable: true,
    category: 'utilities',
    tasks: [
      { id: 'world', label: 'World Clock', icon: Globe, args: { tab: 'world' } },
      { id: 'alarms', label: 'Alarms', icon: AlarmClock, args: { tab: 'alarms' } },
      { id: 'timer', label: 'Timer', icon: BellRing, args: { tab: 'timer' } },
      { id: 'stopwatch', label: 'Stopwatch', icon: Flag, args: { tab: 'stopwatch' } },
    ],
    component: lazy(() => import('../../apps/clock/ClockApp')),
  },
  textedit: {
    id: 'textedit',
    name: 'TextEdit',
    subtitle: 'Plain text and Markdown',
    icon: FileText,
    tint: ['#8a93a6', '#5b6472'],
    keywords: ['textedit', 'notepad', 'text', 'editor', 'markdown', 'txt', 'md'],
    defaultSize: { w: 820, h: 600 },
    minSize: { w: 520, h: 360 },
    searchable: true,
    category: 'productivity',
    tasks: [
      {
        id: 'new',
        label: 'New Document',
        icon: Plus,
        run: () => {
          launchApp('textedit', { intent: 'new' })
        },
      },
    ],
    component: lazy(() => import('../../apps/textedit/TextEditApp')),
  },
  reminders: {
    id: 'reminders',
    name: 'Reminders',
    subtitle: 'To-do lists and alerts',
    icon: ListChecks,
    tint: ['#2ecf7f', '#22c9c9'],
    keywords: ['reminders', 'todo', 'tasks', 'checklist', 'due', 'notify'],
    defaultSize: { w: 900, h: 600 },
    minSize: { w: 680, h: 440 },
    singleton: true,
    searchable: true,
    category: 'productivity',
    tasks: [
      {
        id: 'new',
        label: 'New Reminder',
        icon: Plus,
        run: () => {
          launchApp('reminders', { intent: 'new-reminder' })
        },
      },
      { id: 'today', label: 'Show Today', icon: CalendarDays, args: { filter: 'today' } },
      { id: 'completed', label: 'Show Completed', icon: Check, args: { filter: 'completed' } },
    ],
    component: lazy(() => import('../../apps/reminders/RemindersApp')),
  },
  calendar: {
    id: 'calendar',
    name: 'Calendar',
    subtitle: 'Month planner and .ics',
    icon: CalendarDays,
    tint: ['#4f8cff', '#6a5bff'],
    keywords: ['calendar', 'events', 'agenda', 'ics', 'schedule'],
    defaultSize: { w: 980, h: 660 },
    minSize: { w: 760, h: 500 },
    singleton: true,
    searchable: true,
    category: 'productivity',
    tasks: [
      {
        id: 'new',
        label: 'New Event',
        icon: Plus,
        run: () => {
          launchApp('calendar', { intent: 'new-event' })
        },
      },
      { id: 'today', label: 'Go to Today', icon: CalendarDays, args: { intent: 'today' } },
    ],
    component: lazy(() => import('../../apps/calendar/CalendarApp')),
  },
  contacts: {
    id: 'contacts',
    name: 'Contacts',
    subtitle: 'Local address book and vCard',
    icon: Users,
    tint: ['#f4b942', '#f77f50'],
    keywords: ['contacts', 'people', 'address', 'vcf', 'vcard'],
    defaultSize: { w: 880, h: 580 },
    minSize: { w: 700, h: 440 },
    singleton: true,
    searchable: true,
    category: 'productivity',
    tasks: [
      {
        id: 'new',
        label: 'New Contact',
        icon: Plus,
        run: () => {
          launchApp('contacts', { intent: 'new-contact' })
        },
      },
    ],
    component: lazy(() => import('../../apps/contacts/ContactsApp')),
  },
  photos: {
    id: 'photos',
    name: 'Photos',
    subtitle: 'Gallery, viewer and wallpaper',
    icon: Image,
    tint: ['#38bdf8', '#8b5cf6'],
    keywords: ['photos', 'pictures', 'images', 'gallery', 'album', 'wallpaper', 'viewer'],
    defaultSize: { w: 1020, h: 680 },
    minSize: { w: 720, h: 460 },
    searchable: true,
    category: 'media',
    tasks: [
      { id: 'favourites', label: 'Favourites', icon: Heart, args: { intent: 'favourites' } },
    ],
    component: lazy(() => import('../../apps/photos/PhotosApp')),
  },
  music: {
    id: 'music',
    name: 'Music',
    subtitle: 'Generated stations and your library',
    icon: Music,
    tint: ['#f472b6', '#a855f7'],
    keywords: ['music', 'audio', 'player', 'songs', 'radio', 'playlist', 'sound', 'mp3'],
    defaultSize: { w: 940, h: 620 },
    minSize: { w: 660, h: 440 },
    singleton: true,
    searchable: true,
    category: 'media',
    tasks: [
      {
        id: 'radio',
        label: 'Play AuraOS Radio',
        icon: Radio,
        run: () => {
          launchApp('music', { intent: 'radio' })
        },
      },
    ],
    component: lazy(() => import('../../apps/music/MusicApp')),
  },
  videos: {
    id: 'videos',
    name: 'Videos',
    subtitle: 'Play video from your library',
    icon: Film,
    tint: ['#fb923c', '#ef4444'],
    keywords: ['videos', 'video', 'player', 'movies', 'film', 'mp4', 'webm', 'play'],
    defaultSize: { w: 980, h: 640 },
    minSize: { w: 680, h: 460 },
    searchable: true,
    category: 'media',
    tasks: [
      {
        id: 'open',
        label: 'Open Video…',
        icon: Film,
        run: () => {
          launchApp('videos', { intent: 'open' })
        },
      },
    ],
    component: lazy(() => import('../../apps/videos/VideosApp')),
  },
}

export const appList = (): AppDef[] => Object.values(APPS)

/**
 * Apps shown on the Dock/Taskbar. The registry `pinned` flag is the default;
 * anything the user changed through a jump list wins (see `core/apps/pins.ts`).
 */
export const pinnedApps = (): AppDef[] => appList().filter((a) => appPins.isPinned(a.id, !!a.pinned))

export function getApp(id: string): AppDef | undefined {
  return APPS[id]
}

/**
 * Launch (or re-focus) an app.
 * Singleton apps with an open window are re-focused and notified of the new
 * arguments so they can navigate (used by Spotlight and the terminal `open` cmd).
 */
export function launchApp(appId: string, args: Record<string, unknown> = {}): string | null {
  const def = getApp(appId)
  if (!def) return null

  if (def.singleton) {
    const existing = wm.topOfApp(appId)
    if (existing) {
      wm.activateApp(appId)
      bus.emit<AppArgsEvent>(EVT.APP_ARGS, { windowId: existing.id, args })
      return existing.id
    }
  }

  return wm.open(appId, def.name, def.defaultSize, def.minSize, args)
}
