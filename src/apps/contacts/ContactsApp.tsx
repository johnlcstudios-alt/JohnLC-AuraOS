import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mail, Phone, Plus, Search, Star, Trash2, Upload, Download, Users } from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import { bridge } from '../../core/ipc/bridge'
import { bus, EVT, type AppArgsEvent } from '../../core/bus'
import { notify } from '../../core/notifications'
import { EmptyState } from '../../ui/controls'
import { emptyCard, fullName, parseVcards, serializeVcard, type VCardData } from '../../core/vcard'

const CONFIG_KEY = 'contacts.data'
const SAVE_DEBOUNCE = 400

export interface ContactRecord extends VCardData {
  favourite: boolean
  created: number
  updated: number
}

interface ContactsFile {
  version: 1
  contacts: ContactRecord[]
}

/** Deterministic avatar tint from the name, so a person keeps their colour. */
const AVATAR_COLORS = ['#4f8cff', '#a06bff', '#2ecf7f', '#febc2e', '#ff5f57', '#22c9c9']
function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function initials(contact: VCardData): string {
  const first = contact.firstName.trim()[0] ?? ''
  const last = contact.lastName.trim()[0] ?? ''
  const fallback = (contact.org.trim() || '?')[0]
  return `${first}${last}`.toUpperCase() || fallback.toUpperCase()
}

function displayName(contact: VCardData): string {
  return fullName(contact) || contact.org || 'Unnamed contact'
}

function newUid(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function makeContact(partial: Partial<VCardData> = {}): ContactRecord {
  return { ...emptyCard(newUid()), favourite: false, created: Date.now(), updated: Date.now(), ...partial }
}

type SortKey = 'first' | 'last'

/**
 * Contacts — a local address book.
 *
 * Entries are stored through the config bridge, searchable by name, company,
 * phone or email, and import/export as vCard 3.0 through `core/vcard`, so the
 * data is portable to any other address book.
 */
export function ContactsApp({ windowId, args }: AppProps) {
  const [contacts, setContacts] = useState<ContactRecord[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<ContactRecord | null>(null)
  const [phoneDraft, setPhoneDraft] = useState('')
  const [emailDraft, setEmailDraft] = useState('')

  const contactsRef = useRef<ContactRecord[]>([])
  contactsRef.current = contacts
  const loadedRef = useRef(false)
  const saveTimer = useRef<number | null>(null)

  // ---- load / save -----------------------------------------------------
  useEffect(() => {
    let cancelled = false
    void bridge.config
      .get<ContactsFile | null>(CONFIG_KEY, null)
      .then((stored) => {
        if (cancelled) return
        if (stored && Array.isArray(stored.contacts)) {
          const list = stored.contacts.filter((c) => c && typeof c.uid === 'string')
          setContacts(list)
          setActiveId(list[0]?.uid ?? null)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          loadedRef.current = true
          setLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const flush = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (!loadedRef.current) return
    const payload: ContactsFile = { version: 1, contacts: contactsRef.current }
    void bridge.config.set(CONFIG_KEY, payload).catch(() => undefined)
  }, [])

  const mutate = useCallback(
    (next: ContactRecord[]) => {
      setContacts(next)
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null
        flush()
      }, SAVE_DEBOUNCE)
    },
    [flush],
  )

  useEffect(() => () => flush(), [flush])

  // ---- jump-list / Spotlight intents -----------------------------------
  const startNew = useCallback(() => {
    setDraft(makeContact())
    setPhoneDraft('')
    setEmailDraft('')
  }, [])

  const applyIntent = useCallback(
    (incoming: Record<string, unknown>) => {
      if (incoming.intent === 'new-contact') startNew()
    },
    [startNew],
  )

  useEffect(() => {
    return bus.on<AppArgsEvent>(EVT.APP_ARGS, (event) => {
      if (event.windowId !== windowId) return
      applyIntent(event.args)
    })
  }, [windowId, applyIntent])

  useEffect(() => {
    if (loaded) applyIntent(args)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // ---- actions ---------------------------------------------------------
  const saveDraft = () => {
    if (!draft) return
    if (!fullName(draft) && !draft.org && !draft.phones.length && !draft.emails.length) {
      notify({ title: 'Give the contact a name', body: 'A name, company, phone or email is required', kind: 'warn', appId: 'contacts' })
      return
    }
    const record: ContactRecord = { ...draft, updated: Date.now() }
    const exists = contacts.some((c) => c.uid === record.uid)
    mutate(exists ? contacts.map((c) => (c.uid === record.uid ? record : c)) : [...contacts, record])
    setActiveId(record.uid)
    setDraft(null)
    setPhoneDraft('')
    setEmailDraft('')
  }

  const removeContact = (uid: string) => {
    mutate(contacts.filter((c) => c.uid !== uid))
    setActiveId((current) => (current === uid ? contacts.find((c) => c.uid !== uid)?.uid ?? null : current))
    setDraft(null)
  }

  const toggleFavourite = (uid: string) => {
    mutate(contacts.map((c) => (c.uid === uid ? { ...c, favourite: !c.favourite, updated: Date.now() } : c)))
  }

  // ---- vCard -----------------------------------------------------------
  const exportVcard = async () => {
    if (!contacts.length) {
      notify({ title: 'Nothing to export', body: 'Add a contact first', kind: 'warn', appId: 'contacts' })
      return
    }
    const target = await bridge.dialog
      .saveFile({
        title: 'Export contacts',
        defaultPath: '~/Documents/auraos-contacts.vcf',
        filters: [{ name: 'vCard', extensions: ['vcf'] }],
      })
      .catch(() => null)
    if (!target) return
    try {
      const payload = contacts.map((c) => serializeVcard(c)).join('')
      await bridge.fs.writeText(target, payload)
      notify({ title: 'Contacts exported', body: `${contacts.length} entr(ies) → ${target}`, kind: 'success', appId: 'contacts' })
    } catch (err) {
      notify({ title: 'Export failed', body: err instanceof Error ? err.message : String(err), kind: 'error', appId: 'contacts' })
    }
  }

  const importVcard = async () => {
    const picked = await bridge.dialog
      .openFile({ title: 'Import contacts', filters: [{ name: 'vCard', extensions: ['vcf', 'vcard'] }], defaultPath: '~/Documents' })
      .catch(() => null)
    const target = picked?.[0]
    if (!target) return
    try {
      const text = await bridge.fs.readText(target)
      const parsed = parseVcards(text, newUid)
      if (!parsed.length) {
        notify({ title: 'No contacts found', body: `${target} contained no vCards`, kind: 'warn', appId: 'contacts' })
        return
      }
      const known = new Set(contacts.map((c) => c.uid))
      const additions: ContactRecord[] = parsed
        .filter((card) => !known.has(card.uid))
        .map((card) => ({ ...card, favourite: false, created: Date.now(), updated: Date.now() }))
      mutate([...contacts, ...additions])
      notify({
        title: 'Contacts imported',
        body: additions.length ? `${additions.length} entr(ies) added` : 'Everything was already there',
        kind: 'success',
        appId: 'contacts',
      })
    } catch (err) {
      notify({ title: 'Import failed', body: err instanceof Error ? err.message : String(err), kind: 'error', appId: 'contacts' })
    }
  }

  // ---- derived ---------------------------------------------------------
  const sortKey: SortKey = 'last'

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sortValue = (c: ContactRecord): string =>
      sortKey === 'last' ? `${c.lastName} ${c.firstName}`.trim() || c.org : `${c.firstName} ${c.lastName}`.trim() || c.org
    const sorted = [...contacts].sort((a, b) => sortValue(a).localeCompare(sortValue(b)) || a.uid.localeCompare(b.uid))
    if (!q) return sorted
    return sorted.filter((c) =>
      [
        c.firstName,
        c.lastName,
        c.org,
        c.jobTitle,
        c.address,
        c.notes,
        ...c.phones.map((p) => p.value),
        ...c.emails.map((e) => e.value),
      ]
        .join('\n')
        .toLowerCase()
        .includes(q),
    )
  }, [contacts, query, sortKey])

  const active = contacts.find((c) => c.uid === activeId) ?? null

  return (
    <div className="relative flex h-full w-full min-h-0" data-contacts-count={contacts.length} data-contacts-selected={activeId ?? ''}>
      <div className="flex w-[268px] flex-[0_0_268px] flex-col border-r" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-2 px-3 pt-3">
          <div className="relative flex-1">
            <input
              className="field !h-[28px] !pl-7 text-[12px]"
              placeholder="Search contacts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-contacts-search
            />
          </div>
          <button type="button" className="icon-btn" title="New Contact" aria-label="New contact" data-contacts-action="new" onClick={startNew}>
            <Plus size={15} />
          </button>
        </div>
        <div className="flex items-center gap-1.5 px-3 pb-2 pt-2">
          <button type="button" className="btn !h-[24px] !px-2 text-[11.5px]" onClick={() => void importVcard()}>
            <Upload size={12} /> Import
          </button>
          <button type="button" className="btn !h-[24px] !px-2 text-[12px]" data-contacts-action="export" onClick={() => void exportVcard()}>
            <Download size={12} />
            Export
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {filtered.map((contact) => {
            return (
              <button
                key={contact.uid}
                type="button"
                className="mb-[2px] flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition-colors"
                data-contacts-row={contact.uid}
                data-selected={contact.uid === activeId ? 'true' : 'false'}
                style={contact.uid === activeId ? { background: 'rgb(var(--accent-rgb) / 0.24)' } : undefined}
                onClick={() => setActiveId(contact.uid)}
              >
                <span
                  className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                  style={{ background: avatarColor(displayName(contact)) }}
                >
                  {initials(contact)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[12.5px] font-medium">{displayName(contact)}</span>
                  <span className="truncate text-[11px] text-faint">
                    {contact.jobTitle || contact.org || contact.emails[0]?.value || contact.phones[0]?.value || 'No details'}
                  </span>
                </span>
                {contact.favourite ? <Star size={12} className="ml-auto shrink-0" style={{ color: 'var(--warn)' }} fill="currentColor" /> : null}
              </button>
            )
          })}
          {loaded && !filtered.length ? (
            <p className="px-2.5 py-6 text-center text-[11.5px] text-faint">
              {contacts.length ? 'No contacts match that search' : 'No contacts yet'}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <div className="flex items-center gap-3 px-5 pt-4">
              <span
                className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full text-[16px] font-semibold text-white"
                style={{ background: avatarColor(displayName(active)) }}
              >
                {initials(active)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-semibold" data-contacts-name>
                  {displayName(active)}
                </div>
                <div className="truncate text-[12px] text-muted">
                  {[active.jobTitle, active.org].filter(Boolean).join(' · ') || 'No company'}
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                title="Favourite"
                aria-label="Favourite"
                data-contacts-action="favourite"
                data-active={active.favourite ? 'true' : 'false'}
                onClick={() => toggleFavourite(active.uid)}
              >
                <Star size={15} style={active.favourite ? { color: 'var(--warn)' } : undefined} />
              </button>
              <button type="button" className="btn text-[12px]" data-contacts-action="edit" onClick={() => setDraft({ ...active })}>
                Edit
              </button>
              <button
                type="button"
                className="icon-btn hover:!text-[var(--danger)]"
                title="Delete contact"
                aria-label="Delete contact"
                data-contacts-action="delete"
                onClick={() => removeContact(active.uid)}
              >
                <Trash2 size={15} />
              </button>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <div className="card !bg-transparent">
                <div className="section-title">Phone</div>
                {active.phones.length ? (
                  active.phones.map((phone, i) => (
                    <div key={`${phone.value}-${i}`} className="row py-1 text-[12.5px]">
                      <span className="w-[64px] shrink-0 text-[11.5px] text-faint">{phone.label}</span>
                      <span className="flex items-center gap-1.5">
                        <Phone size={12} className="text-faint" />
                        {phone.value}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-[12px] text-faint">No phone numbers</div>
                )}
              </div>

              <div className="card mt-3">
                <div className="section-title">Email</div>
                {active.emails.map((email) => (
                  <button
                    key={email.value}
                    type="button"
                    className="row w-full text-left text-[12.5px]"
                    onClick={() => void bridge.app.openExternal(`mailto:${email.value}`).catch(() => {})}
                  >
                    <Mail size={13} className="text-faint" />
                    <span className="truncate">{email.value}</span>
                    <span className="ml-auto text-[11px] text-faint">{email.label}</span>
                  </button>
                ))}
                {active.emails.length ? null : <span className="text-[12px] text-faint">No email addresses</span>}
              </div>

              {active.address || active.birthday || active.notes ? (
                <div className="card mt-3 flex flex-col gap-1.5 text-[12.5px]">
                  {active.address ? <div>{active.address}</div> : null}
                  {active.birthday ? <div className="text-muted">Birthday: {active.birthday}</div> : null}
                  {active.notes ? <div className="whitespace-pre-wrap text-muted">{active.notes}</div> : null}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex-1">
            <EmptyState
              icon={Users}
              title={loaded ? 'No contact selected' : 'Loading contacts…'}
              hint="Create a contact, or import a .vcf file"
            />
          </div>
        )}
      </div>

      {draft ? (
        <div className="absolute inset-0 z-20 grid place-items-center p-4" style={{ background: 'rgba(0,0,0,0.34)' }} data-contacts-form>
          <div className="glass-strong max-h-full w-[460px] max-w-full overflow-y-auto rounded-[14px] p-4">
            <div className="mb-3 text-[13.5px] font-semibold">{contacts.some((c) => c.uid === draft.uid) ? 'Edit contact' : 'New contact'}</div>
            <div className="flex flex-col gap-2.5">
              <div className="flex gap-2">
                <input
                  className="field"
                  placeholder="First name"
                  autoFocus
                  value={draft.firstName}
                  onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                  data-contacts-field="firstName"
                />
                <input
                  className="field"
                  placeholder="Last name"
                  value={draft.lastName}
                  onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                  data-contacts-field="lastName"
                />
              </div>
              <input
                className="field"
                placeholder="Company"
                value={draft.org}
                onChange={(e) => setDraft({ ...draft, org: e.target.value })}
                data-contacts-field="org"
              />
              <input
                className="field"
                placeholder="Job title"
                value={draft.jobTitle}
                onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })}
                data-contacts-field="jobTitle"
              />

              <div className="section-title !mb-0">Phones</div>
              {draft.phones.map((phone, index) => (
                <div key={`${phone.value}-${index}`} className="flex items-center gap-2">
                  <span className="w-[64px] shrink-0 text-[11.5px] text-faint">{phone.label}</span>
                  <input
                    className="field flex-1"
                    value={phone.value}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        phones: draft.phones.map((p, i) => (i === index ? { ...p, value: e.target.value } : p)),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn hover:!text-[var(--danger)]"
                    aria-label="Remove phone"
                    onClick={() => setDraft({ ...draft, phones: draft.phones.filter((_, i) => i !== index) })}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  className="field flex-1"
                  placeholder="Add a phone number"
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && phoneDraft.trim()) {
                      setDraft({ ...draft, phones: [...draft.phones, { label: 'Mobile', value: phoneDraft.trim() }] })
                      setPhoneDraft('')
                    }
                  }}
                  data-contacts-field="phone-add"
                />
                <button
                  type="button"
                  className="btn text-[12px]"
                  data-contacts-action="add-phone"
                  onClick={() => {
                    if (!phoneDraft.trim()) return
                    setDraft({ ...draft, phones: [...draft.phones, { label: 'Mobile', value: phoneDraft.trim() }] })
                    setPhoneDraft('')
                  }}
                >
                  <Plus size={13} />
                </button>
              </div>

              <div className="section-title !mb-0">Emails</div>
              {draft.emails.map((email, index) => (
                <div key={`${email.value}-${index}`} className="flex items-center gap-2">
                  <span className="w-[64px] shrink-0 text-[11.5px] text-faint">{email.label}</span>
                  <input
                    className="field flex-1"
                    value={email.value}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        emails: draft.emails.map((m, i) => (i === index ? { ...m, value: e.target.value } : m)),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn hover:!text-[var(--danger)]"
                    aria-label="Remove email"
                    onClick={() => setDraft({ ...draft, emails: draft.emails.filter((_, i) => i !== index) })}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  className="field flex-1"
                  placeholder="Add an email address"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && emailDraft.trim()) {
                      setDraft({ ...draft, emails: [...draft.emails, { label: 'Home', value: emailDraft.trim() }] })
                      setEmailDraft('')
                    }
                  }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Add email"
                  onClick={() => {
                    if (!emailDraft.trim()) return
                    setDraft({ ...draft, emails: [...draft.emails, { label: 'Home', value: emailDraft.trim() }] })
                    setEmailDraft('')
                  }}
                >
                  <Plus size={13} />
                </button>
              </div>

              <input
                className="field"
                placeholder="Address"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                data-contacts-field="address"
              />
              <div className="flex items-center gap-2">
                <span className="w-[64px] shrink-0 text-[11.5px] text-faint">Birthday</span>
                <input
                  type="date"
                  className="field flex-1"
                  value={draft.birthday}
                  onChange={(e) => setDraft({ ...draft, birthday: e.target.value })}
                  data-contacts-field="birthday"
                />
              </div>
              <textarea
                className="field min-h-[64px] resize-none py-1.5 text-[12px]"
                placeholder="Notes"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                data-contacts-field="notes"
              />
            </div>
            <div className="mt-4 flex items-center gap-2">
              {contacts.some((c) => c.uid === draft.uid) ? (
                <button
                  type="button"
                  className="btn text-[12.5px] hover:!text-[var(--danger)]"
                  data-variant="ghost"
                  data-contacts-action="delete"
                  onClick={() => removeContact(draft.uid)}
                >
                  <Trash2 size={13} /> Delete
                </button>
              ) : null}
              <span className="ml-auto flex items-center gap-2">
                <button type="button" className="btn text-[12.5px]" data-contacts-action="cancel" onClick={() => setDraft(null)}>
                  Cancel
                </button>
                <button type="button" className="btn text-[12.5px]" data-variant="accent" data-contacts-action="save" onClick={saveDraft}>
                  Save
                </button>
              </span>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}

export default ContactsApp
