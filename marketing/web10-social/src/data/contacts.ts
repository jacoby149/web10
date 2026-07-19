import { getWapi } from './wapi';
import type { ContactRecord } from './types';

// ── Contacts data layer ────────────────────────────────────────────────────
// The `contacts` service: unilateral friend graph.

/**
 * Read all contacts for the current user.
 */
export async function readContacts(): Promise<ContactRecord[]> {
  const wapi = getWapi();
  return wapi.read<ContactRecord>('contacts');
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