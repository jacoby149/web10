import React, { useState, useEffect } from 'react';
import { R } from 'rectangles-npm';
import type { AppInterface, CrmContact, CrmColor } from '../../types';
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';

const colorDot: Record<CrmColor, string> = { green: '#4caf50', yellow: '#ffc107', red: '#f44336' };

function Crm({ I }: { I: AppInterface }) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [web10, setWeb10] = useState('');
  const [noteText, setNoteText] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);

  const filteredContacts = I.crmContacts.filter((c) => {
    if (I.crmSearch) {
      const q = I.crmSearch.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.web10 ?? '').toLowerCase().includes(q)
      );
    }
    return (
      (c.color === 'green' && I.crmColorFilter.green) ||
      (c.color === 'yellow' && I.crmColorFilter.yellow) ||
      (c.color === 'red' && I.crmColorFilter.red)
    );
  });

  useEffect(() => {
    if (showModal && selectedContact?._id) {
      I.crmLoadNotes(selectedContact._id);
    }
  }, [showModal]);

  const handleAddContact = () => {
    if (!name.trim()) return;
    I.crmAddContact({ name: name.trim(), company, phone, email, web10, color: 'green' });
    setName(''); setCompany(''); setPhone(''); setEmail(''); setWeb10('');
  };

  const handleSelectContact = (contact: CrmContact) => {
    setSelectedContact(contact);
    I.setCrmSelectedContact(contact);
    setShowModal(true);
  };

  const handleUpdateContact = () => {
    if (!selectedContact) return;
    I.crmUpdateContact({
      ...selectedContact,
      name: selectedContact.name,
      company,
      phone,
      email,
      web10,
    });
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    I.crmAddNote(noteText.trim());
    setNoteText('');
  };

  const handleDeleteContact = () => {
    if (selectedContact) {
      I.crmDeleteContact(selectedContact);
      setShowModal(false);
    }
  };

  return (
    <R root t bt bb br bl onClick={I.toggleTheme} theme={I.theme}>
      <TopBar I={I} />
      <R l tel>
        <SideBar I={I} />
        <R t tel style={{ padding: '20px', overflow: 'auto' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ color: I.theme === 'dark' ? '#fff' : '#222', marginBottom: '20px' }}>
              Rolodex
            </h2>

            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 300px' }}>
                <input
                  type="text"
                  placeholder="search contacts..."
                  value={I.crmSearch}
                  onChange={(e) => I.setCrmSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    marginBottom: '12px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    background: I.theme === 'dark' ? '#333' : '#fff',
                    color: I.theme === 'dark' ? '#fff' : '#222',
                  }}
                />

                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  {(['green', 'yellow', 'red'] as CrmColor[]).map((color) => (
                    <label key={color} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={I.crmColorFilter[color]}
                        onChange={() => I.setCrmColorFilter((prev) => ({ ...prev, [color]: !prev[color] }))}
                      />
                      <span style={{ color: colorDot[color], textTransform: 'capitalize' }}>{color}</span>
                    </label>
                  ))}
                </div>

                <h4 style={{ color: I.theme === 'dark' ? '#fff' : '#222' }}>Add Contact</h4>
                <input placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle(I.theme)} />
                <input placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle(I.theme)} />
                <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle(I.theme)} />
                <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle(I.theme)} />
                <input placeholder="Web10" value={web10} onChange={(e) => setWeb10(e.target.value)} style={inputStyle(I.theme)} />
                <button onClick={handleAddContact} style={{ ...btnStyle, background: '#4caf50', width: '100%', marginTop: '8px' }}>
                  Add Contact
                </button>
              </div>

              <div style={{ flex: 1, minWidth: '400px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #555' }}>
                      <th style={thStyle(I.theme)}>Name</th>
                      <th style={thStyle(I.theme)}>Co.</th>
                      <th style={thStyle(I.theme)}>Phone</th>
                      <th style={thStyle(I.theme)}>Email</th>
                      <th style={thStyle(I.theme)}>Web10</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.map((c) => (
                      <tr
                        key={c._id}
                        onClick={() => handleSelectContact(c)}
                        style={{
                          cursor: 'pointer',
                          borderBottom: '1px solid #444',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ ...tdStyle(I.theme), color: colorDot[c.color] }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: colorDot[c.color], marginRight: '8px' }} />
                          {c.name}
                        </td>
                        <td style={tdStyle(I.theme)}>{c.company || '-'}</td>
                        <td style={tdStyle(I.theme)}>{c.phone || '-'}</td>
                        <td style={tdStyle(I.theme)}>{c.email || '-'}</td>
                        <td style={tdStyle(I.theme)}>{c.web10 || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {showModal && selectedContact && (
              <div style={modalOverlayStyle} onClick={() => setShowModal(false)}>
                <div style={modalStyle(I.theme)} onClick={(e) => e.stopPropagation()}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px', borderBottom: '1px solid #555',
                  }}>
                    <h3 style={{ margin: 0, color: I.theme === 'dark' ? '#fff' : '#222' }}>
                      {selectedContact.name}
                      <span
                        onClick={() => {
                          const updated = { ...selectedContact, color: selectedContact.color === 'green' ? 'yellow' : selectedContact.color === 'yellow' ? 'red' : 'green' };
                          setSelectedContact(updated);
                          I.crmIncrementColor(updated);
                        }}
                        style={{
                          display: 'inline-block',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: colorDot[selectedContact.color],
                          marginLeft: '8px',
                          cursor: 'pointer',
                          verticalAlign: 'middle',
                        }}
                        title="Click to cycle priority"
                      />
                    </h3>
                    <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>
                      &times;
                    </button>
                  </div>

                  <div style={{ padding: '16px' }}>
                    <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
                      <input value={selectedContact.name} readOnly style={{ ...inputStyle(I.theme), opacity: 0.7 }} />
                      <input value={selectedContact.company || ''} onChange={(e) => setCompany(e.target.value)} style={inputStyle(I.theme)} placeholder="Company" />
                      <input value={selectedContact.phone || ''} onChange={(e) => setPhone(e.target.value)} style={inputStyle(I.theme)} placeholder="Phone" />
                      <input value={selectedContact.email || ''} onChange={(e) => setEmail(e.target.value)} style={inputStyle(I.theme)} placeholder="Email" />
                      <input value={selectedContact.web10 || ''} onChange={(e) => setWeb10(e.target.value)} style={inputStyle(I.theme)} placeholder="Web10" />
                    </div>
                    <button onClick={handleUpdateContact} style={{ ...btnStyle, background: '#2196f3', marginBottom: '16px' }}>
                      Update
                    </button>

                    <h4 style={{ color: I.theme === 'dark' ? '#fff' : '#222' }}>Notes</h4>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add a note..."
                      rows={3}
                      style={{
                        ...inputStyle(I.theme),
                        resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                    <button onClick={handleAddNote} style={{ ...btnStyle, background: '#ff9800', marginTop: '8px' }}>
                      Add Note
                    </button>

                    <div style={{ marginTop: '16px', maxHeight: '200px', overflowY: 'auto' }}>
                      {I.crmNotes
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((n) => (
                          <div key={n._id} style={{ marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <small style={{ color: '#999' }}>{new Date(n.date).toLocaleString()}</small>
                              <button
                                onClick={() => I.crmDeleteNote(n._id!)}
                                style={{ ...btnStyle, background: '#f44336', padding: '2px 8px', fontSize: '12px' }}
                              >
                                delete
                              </button>
                            </div>
                            <p style={{ margin: '4px 0 0', color: I.theme === 'dark' ? '#ddd' : '#333' }}>{n.note}</p>
                          </div>
                        ))}
                    </div>

                    <button onClick={handleDeleteContact} style={{ ...btnStyle, background: '#f44336', marginTop: '16px', width: '100%' }}>
                      Delete Contact
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </R>
      </R>
    </R>
  );
}

const inputStyle = (theme: string) => ({
  width: '100%',
  padding: '8px 12px',
  marginBottom: '8px',
  borderRadius: '6px',
  border: '1px solid #555',
  background: theme === 'dark' ? '#333' : '#fff',
  color: theme === 'dark' ? '#fff' : '#222',
  boxSizing: 'border-box' as const,
});

const btnStyle = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 'bold' as const,
};

const thStyle = (theme: string) => ({
  padding: '12px 8px',
  textAlign: 'left' as const,
  color: theme === 'dark' ? '#fff' : '#222',
  fontWeight: 'bold' as const,
});

const tdStyle = (theme: string) => ({
  padding: '10px 8px',
  color: theme === 'dark' ? '#ddd' : '#333',
});

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle = (theme: string) => ({
  background: theme === 'dark' ? '#23282c' : '#fff',
  borderRadius: '12px',
  width: '500px',
  maxWidth: '90vw',
  maxHeight: '80vh',
  overflowY: 'auto' as const,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
});

export default Crm;
