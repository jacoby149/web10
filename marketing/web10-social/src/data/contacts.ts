import { getV3Client } from './v3';
import { followersGroupId, getMyGroups } from './groups';
import { extractUsername } from './types';

// ── Contacts data layer (v3) ─────────────────────────────────────────────────
// In v3, contacts are derived from group membership + DM groups.
// The `contacts` collection still exists for CRM-style notes, but the
// follow graph IS group membership (see follows.ts).

export interface ContactRecord {
  _id?: string;
  username: string;
  provider: string;
  display_name?: string;
  labels?: string[];
  added_at?: string;
  note?: string;
  spam_flagged?: boolean;
  crm_status?: 'green' | 'yellow' | 'red';
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  links?: string;
  custom_fields?: Record<string, string>;
}

export type CrmStatus = 'green' | 'yellow' | 'red';

/**
 * Read all contacts for the current user.
 */
export async function readContacts(): Promise<ContactRecord[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return [];

  try {
    const docs = await w.read('contacts', {
      groups: [`web10.app/groups/${token.username}/followers`],
    });
    return docs.map((d) => {
      const body = d.body as Record<string, unknown>;
      return {
        _id: d.doc_id,
        username: (body.username as string) || extractUsername(d.author_key),
        provider: (body.provider as string) || extractProvider(d.author_key),
        display_name: (body.display_name as string) || undefined,
        labels: (body.labels as string[]) || undefined,
        added_at: d.created_at,
        note: (body.note as string) || undefined,
        spam_flagged: body.spam_flagged as boolean,
        crm_status: (body.crm_status as CrmStatus) || undefined,
        email: (body.email as string) || undefined,
        phone: (body.phone as string) || undefined,
        company: (body.company as string) || undefined,
        role: (body.role as string) || undefined,
        links: (body.links as string) || undefined,
        custom_fields: (body.custom_fields as Record<string, string>) || undefined,
      };
    });
  } catch {
    return [];
  }
}

function extractProvider(authorKey: string): string {
  const parts = authorKey.split('/');
  return parts[0] || 'web10';
}

/**
 * Read a single contact by username.
 */
export async function readContact(username: string, _provider?: string): Promise<ContactRecord | null> {
  const contacts = await readContacts();
  return contacts.find((c) => c.username === username) || null;
}

/**
 * Add a new contact.
 */
export async function addContact(contact: Omit<ContactRecord, '_id'>): Promise<ContactRecord> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const body: Record<string, unknown> = {
    username: contact.username,
    provider: contact.provider,
    display_name: contact.display_name,
    labels: contact.labels,
    note: contact.note,
    spam_flagged: contact.spam_flagged,
    crm_status: contact.crm_status,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    role: contact.role,
    links: contact.links,
    custom_fields: contact.custom_fields,
  };

  const doc = await w.create('contacts', body, {
    groups: [`web10.app/groups/${token.username}/followers`],
  });
  const b = doc.body as Record<string, unknown>;
  return {
    _id: doc.doc_id,
    username: (b.username as string) || contact.username,
    provider: (b.provider as string) || contact.provider,
    display_name: (b.display_name as string) || undefined,
    note: (b.note as string) || undefined,
    spam_flagged: b.spam_flagged as boolean,
    crm_status: (b.crm_status as CrmStatus) || undefined,
  };
}

/**
 * Update a contact by ID.
 */
export async function updateContact(id: string, updates: Partial<ContactRecord>): Promise<ContactRecord> {
  const w = getV3Client();
  const body: Record<string, unknown> = {};
  if (updates.display_name !== undefined) body.display_name = updates.display_name;
  if (updates.note !== undefined) body.note = updates.note;
  if (updates.spam_flagged !== undefined) body.spam_flagged = updates.spam_flagged;
  if (updates.crm_status !== undefined) body.crm_status = updates.crm_status;
  if (updates.labels !== undefined) body.labels = updates.labels;

  const doc = await w.update(id, body);
  const b = doc.body as Record<string, unknown>;
  return {
    _id: doc.doc_id,
    username: (b.username as string) || '',
    provider: (b.provider as string) || '',
    display_name: (b.display_name as string) || undefined,
    note: (b.note as string) || undefined,
    spam_flagged: b.spam_flagged as boolean,
    crm_status: (b.crm_status as CrmStatus) || undefined,
  };
}

/**
 * Delete a contact by ID.
 */
export async function deleteContact(id: string): Promise<void> {
  const w = getV3Client();
  await w.delete(id);
}

/**
 * Search contacts by display_name.
 */
export async function searchContacts(query: string): Promise<ContactRecord[]> {
  const all = await readContacts();
  const q = query.toLowerCase();
  return all.filter(
    (c) =>
      c.display_name?.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q),
  );
}

/** @deprecated use updateContact with note */
export async function updateContactNote(id: string, note: string): Promise<ContactRecord> {
  return updateContact(id, { note });
}

/** @deprecated use updateContact with crm_status */
export async function updateContactStatus(id: string, status: CrmStatus | undefined): Promise<ContactRecord> {
  return updateContact(id, { crm_status: status });
}

/** @deprecated use toggleSpamFlag */
export async function toggleSpamFlag(id: string, flagged: boolean): Promise<ContactRecord> {
  return updateContact(id, { spam_flagged: flagged });
}

/** @deprecated use readContacts filtered */
export async function readSpamFlaggedContacts(): Promise<ContactRecord[]> {
  const all = await readContacts();
  return all.filter((c) => c.spam_flagged);
}

/** @deprecated use readContacts */
export async function readContactsForCrm(): Promise<ContactRecord[]> {
  return readContacts();
}

/** @deprecated use readContact + toggleSpamFlag */
export async function spamFlagUser(username: string, _provider: string): Promise<void> {
  const contact = await readContact(username);
  if (contact?._id) {
    await toggleSpamFlag(contact._id, true);
  }
}

/** @deprecated use readContact + toggleSpamFlag */
export async function unspamFlagUser(username: string, _provider: string): Promise<void> {
  const contact = await readContact(username);
  if (contact?._id) {
    await toggleSpamFlag(contact._id, false);
  }
}