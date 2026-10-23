import type { LucideIcon } from 'lucide-react'

export type ActionCategory = 'Window' | 'Desktop' | 'Apps' | 'System' | 'Appearance' | 'View'

export interface ActionDef {
  id: string
  title: string
  subtitle?: string
  category: ActionCategory
  keywords?: string[]
  icon?: LucideIcon
  run: (ctx?: unknown) => void | Promise<void>
}

/**
 * A small registry of named, runnable actions.
 *
 * Everything the shell can do is an action: the keyboard-shortcut layer, the
 * (future) command palette and menus all dispatch through the same ids, so a
 * shortcut is just a binding to an action.
 */
class ActionRegistry {
  private map = new Map<string, ActionDef>()

  register(def: ActionDef): ActionDef {
    this.map.set(def.id, def)
    return def
  }

  registerAll(defs: ActionDef[]): void {
    for (const def of defs) this.register(def)
  }

  get(id: string): ActionDef | undefined {
    return this.map.get(id)
  }

  all(): ActionDef[] {
    return [...this.map.values()]
  }

  run(id: string, ctx?: unknown): void {
    const def = this.map.get(id)
    if (!def) return
    void def.run(ctx)
  }

  search(query: string): ActionDef[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return this.all()
      .map((def) => {
        const hay = [def.title, def.subtitle ?? '', ...(def.keywords ?? [])].join(' ').toLowerCase()
        return { def, hit: hay.includes(q) }
      })
      .filter((r) => r.hit)
      .map((r) => r.def)
  }
}

export const actions = new ActionRegistry()
