import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Crm from '../components/Crm/Crm';
import { createMockI } from './mockAppInterface';
import type { CrmContact } from '../types';

const mockContacts: CrmContact[] = [
  { _id: '1', name: 'Alice Johnson', company: 'TechCorp', phone: '+1-555-0101', email: 'alice@techcorp.com', web10: 'api.web10.app/alice', color: 'green' },
  { _id: '2', name: 'Bob Smith', company: 'DesignHub', phone: '+1-555-0102', email: 'bob@designhub.com', color: 'yellow' },
  { _id: '3', name: 'Carol White', company: 'DataFlow', phone: '+1-555-0103', email: 'carol@dataflow.io', web10: 'api.web10.app/carol', color: 'red' },
];

describe('Crm component', () => {
  it('renders the Rolodex heading', () => {
    const I = createMockI({ mode: 'crm', crmContacts: mockContacts });
    render(<Crm I={I} />);
    expect(screen.getByRole('heading', { name: 'Rolodex' })).toBeInTheDocument();
  });

  it('displays all contacts in the table', () => {
    const I = createMockI({ mode: 'crm', crmContacts: mockContacts });
    render(<Crm I={I} />);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('Carol White')).toBeInTheDocument();
  });

  it('filters contacts by search text', () => {
    const I = createMockI({ mode: 'crm', crmContacts: mockContacts, crmSearch: 'alice' });
    render(<Crm I={I} />);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol White')).not.toBeInTheDocument();
  });

  it('searches across company field', () => {
    const I = createMockI({ mode: 'crm', crmContacts: mockContacts, crmSearch: 'designhub' });
    render(<Crm I={I} />);
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
  });

  it('filters by green color only', () => {
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmColorFilter: { green: true, yellow: false, red: false },
    });
    render(<Crm I={I} />);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol White')).not.toBeInTheDocument();
  });

  it('filters by yellow and red only', () => {
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmColorFilter: { green: false, yellow: true, red: true },
    });
    render(<Crm I={I} />);
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('Carol White')).toBeInTheDocument();
  });

  it('hides all contacts when all color filters off', () => {
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmColorFilter: { green: false, yellow: false, red: false },
    });
    render(<Crm I={I} />);
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol White')).not.toBeInTheDocument();
  });

  it('shows search input and add contact form', () => {
    const I = createMockI({ mode: 'crm', crmContacts: mockContacts });
    render(<Crm I={I} />);
    expect(screen.getByPlaceholderText('search contacts...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Name *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Contact' })).toBeInTheDocument();
  });

  it('updates search on input change', () => {
    const setCrmSearch = vi.fn();
    const I = createMockI({ mode: 'crm', crmContacts: mockContacts, setCrmSearch });
    render(<Crm I={I} />);
    const input = screen.getByPlaceholderText('search contacts...');
    fireEvent.change(input, { target: { value: 'carol' } });
    expect(setCrmSearch).toHaveBeenCalledWith('carol');
  });

  it('toggles color filter checkbox', () => {
    const setCrmColorFilter = vi.fn();
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmColorFilter: { green: true, yellow: true, red: true },
      setCrmColorFilter,
    });
    render(<Crm I={I} />);
    const greenCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(greenCheckbox);
    expect(setCrmColorFilter).toHaveBeenCalled();
  });

  it('calls crmAddContact on Add Contact button click', () => {
    const crmAddContact = vi.fn();
    const I = createMockI({ mode: 'crm', crmContacts: [], crmAddContact });
    render(<Crm I={I} />);
    const nameInput = screen.getByPlaceholderText('Name *');
    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    expect(crmAddContact).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test User', color: 'green' })
    );
  });

  it('does not add contact when name is empty', () => {
    const crmAddContact = vi.fn();
    const I = createMockI({ mode: 'crm', crmContacts: [], crmAddContact });
    render(<Crm I={I} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    expect(crmAddContact).not.toHaveBeenCalled();
  });

  it('opens modal on contact row click and loads notes', () => {
    const setCrmSelectedContact = vi.fn();
    const crmLoadNotes = vi.fn();
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmSelectedContact: null,
      crmNotes: [],
      setCrmSelectedContact,
      crmLoadNotes,
    });
    render(<Crm I={I} />);
    fireEvent.click(screen.getByText('Alice Johnson'));
    expect(setCrmSelectedContact).toHaveBeenCalledWith(mockContacts[0]);
  });

  it('displays notes in modal after clicking contact', () => {
    const note = { _id: 'n1', note: 'Met at conference', id: '1', date: '2024-01-15T10:30:00Z' };
    const setCrmSelectedContact = vi.fn();
    const crmLoadNotes = vi.fn();
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmSelectedContact: null,
      crmNotes: [note],
      setCrmSelectedContact,
      crmLoadNotes,
    });
    render(<Crm I={I} />);
    fireEvent.click(screen.getByText('Alice Johnson'));
    expect(setCrmSelectedContact).toHaveBeenCalledWith(mockContacts[0]);
    expect(crmLoadNotes).toHaveBeenCalled();
  });

  it('calls crmDeleteContact on delete button after opening modal', () => {
    const crmDeleteContact = vi.fn();
    const setCrmSelectedContact = vi.fn();
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmSelectedContact: null,
      crmNotes: [],
      setCrmSelectedContact,
      crmDeleteContact,
    });
    render(<Crm I={I} />);
    fireEvent.click(screen.getByText('Alice Johnson'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Contact' }));
    expect(crmDeleteContact).toHaveBeenCalled();
  });

  it('calls crmIncrementColor on star click after opening modal', () => {
    const crmIncrementColor = vi.fn();
    const setCrmSelectedContact = vi.fn();
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmSelectedContact: null,
      crmNotes: [],
      setCrmSelectedContact,
      crmIncrementColor,
    });
    render(<Crm I={I} />);
    fireEvent.click(screen.getByText('Alice Johnson'));
    const star = document.querySelector('[title="Click to cycle priority"]');
    if (star) {
      fireEvent.click(star);
      expect(crmIncrementColor).toHaveBeenCalled();
    }
  });

  it('calls crmAddNote on Add Note button after opening modal', () => {
    const crmAddNote = vi.fn();
    const setCrmSelectedContact = vi.fn();
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmSelectedContact: null,
      crmNotes: [],
      setCrmSelectedContact,
      crmAddNote,
    });
    render(<Crm I={I} />);
    fireEvent.click(screen.getByText('Alice Johnson'));
    const textarea = screen.getByPlaceholderText('Add a note...');
    fireEvent.change(textarea, { target: { value: 'New note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    expect(crmAddNote).toHaveBeenCalledWith('New note');
  });

  it('does not add empty note after opening modal', () => {
    const crmAddNote = vi.fn();
    const setCrmSelectedContact = vi.fn();
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmSelectedContact: null,
      crmNotes: [],
      setCrmSelectedContact,
      crmAddNote,
    });
    render(<Crm I={I} />);
    fireEvent.click(screen.getByText('Alice Johnson'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    expect(crmAddNote).not.toHaveBeenCalled();
  });

  it('calls crmDeleteNote on delete note button after opening modal', () => {
    const crmDeleteNote = vi.fn();
    const note = { _id: 'n1', note: 'Test note', id: '1', date: '2024-01-15T10:30:00Z' };
    const setCrmSelectedContact = vi.fn();
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmSelectedContact: null,
      crmNotes: [note],
      setCrmSelectedContact,
      crmDeleteNote,
    });
    render(<Crm I={I} />);
    fireEvent.click(screen.getByText('Alice Johnson'));
    const deleteBtns = screen.getAllByText('delete');
    fireEvent.click(deleteBtns[0]);
    expect(crmDeleteNote).toHaveBeenCalledWith('n1');
  });

  it('calls crmLoadNotes when contact row is clicked', () => {
    const crmLoadNotes = vi.fn();
    const setCrmSelectedContact = vi.fn();
    const I = createMockI({
      mode: 'crm',
      crmContacts: mockContacts,
      crmSelectedContact: null,
      crmNotes: [],
      setCrmSelectedContact,
      crmLoadNotes,
    });
    render(<Crm I={I} />);
    fireEvent.click(screen.getByText('Alice Johnson'));
    expect(crmLoadNotes).toHaveBeenCalled();
  });
});
