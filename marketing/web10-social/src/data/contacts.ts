import { getWapi } from './wapi';
import type { ContactRecord } from './types';

// ── Contacts data layer ────────────────────────────────────────────────────
// The `contacts` service: unilateral friend graph.
// Falls back to legacy `contact-addresses` service for users who haven't migrated.

/**
 * Parse a legacy web10 string into username + provider.
 * Legacy format: "provider/username"
 */
function parseWeb10(web10: string): { username: string; provider: string } {
  const [provider, username] = web10.split('/');
  return { username: username || web10, provider: provider || 'web10' };
}

/**
 * Read all contacts for the current user.
 * Adapts legacy contact-addresses records on first read.
 */
export async function readContacts(): Promise<ContactRecord[]> {
  const wapi = getWapi();
  let records = await wapi.read<ContactRecord>('contacts');

  if (!records.length) {
    // Fallback: check legacy contact-addresses service
    try {
      const legacy = await wapi.read<Record<string, unknown>>('contact-addresses');
      if (legacy.length) {
        // Adapt and migrate legacy records to new format
        const adapted = legacy.map((old) => {
          const { username, provider } = parseWeb10(old.web10 as string);
          return {
            username,
            provider,
            display_name: undefined,
            added_at: old.date_added ? new Date(old.date_added as string).toISOString() : new Date().toISOString(),
          } as ContactRecord;
        });
        // Write adapted records to new contacts service
        for (const record of adapted) {
          await wapi.create<ContactRecord>('contacts', record as unknown as Record<string, unknown>);
        }
        records = await wapi.read<ContactRecord>('contacts');
      }
    } catch {
      // contact-addresses service may not exist, that's fine
    }
  }

  return records;
}

/**
 * Read a single contact by username+provider.
 */
export async function readContact(username: string, provider: string): Promise<ContactRecord | null> {
  const wapi = getWapi();
  const records = await wapi.read<ContactRecord>('contacts', { username, provider });
  return records[0] || null;
}

/**
 * Add a new contact.
 */
export async function addContact(contact: Omit<ContactRecord, '_id'>): Promise<ContactRecord> {
  const wapi = getWapi();
  const record: Omit<ContactRecord, '_id'> = {
    ...contact,
    added_at: new Date().toISOString(),
  };
  return wapi.create<ContactRecord>('contacts', record);
}

/**
 * Update a contact by ID.
 */
export async function updateContact(id: string, updates: Partial<ContactRecord>): Promise<ContactRecord> {
  const wapi = getWapi();
  return wapi.update<ContactRecord>('contacts', { _id: id }, { $set: updates });
}

/**
 * Delete a contact by ID.
 */
export async function deleteContact(id: string): Promise<void> {
  const wapi = getWapi();
  await wapi.delete('contacts', { _id: id });
}

/**
 * Search contacts by display_name.
 */
export async function searchContacts(query: string): Promise<ContactRecord[]> {
  const wapi = getWapi();
  const all = await wapi.read<ContactRecord>('contacts');
  const q = query.toLowerCase();
  return all.filter(
    (c) =>
      c.display_name?.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q),
  );
}

/**
 * Update a contact's note (CRM per-contact notes).
 * Convenience wrapper around updateContact targeting the note field.
 */
export async function updateContactNote(id: string, note: string): Promise<ContactRecord> {
  return updateContact(id, { note });
}

/**
 * Bulk-read all contacts and their notes for the CRM view.
 * Same as readContacts but explicit — the CRM view uses note + full record.
 */
export async function readContactsForCrm(): Promise<ContactRecord[]> {
  return readContacts();
}