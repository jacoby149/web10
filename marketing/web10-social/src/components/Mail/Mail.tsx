import { useState, useEffect } from 'react';
import { R } from 'rectangles-npm';
import type { AppInterface } from '../../types';
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';

function Mail({ I }: { I: AppInterface }) {
  const [recipient, setRecipient] = useState('');
  const [server, setServer] = useState('api.web10.app');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    I.mailLoad();
  }, []);

  const handleSend = () => {
    if (!recipient.trim() || !message.trim()) {
      setStatus('Recipient and message required');
      return;
    }
    I.mailSend(recipient, server, message.trim());
    setMessage('');
    setStatus('Message sent');
    setTimeout(() => setStatus(''), 3000);
  };

  const sortedMessages = [...I.mailMessages].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <R root t bt bb br bl onClick={I.toggleTheme} theme={I.theme}>
      <TopBar I={I} />
      <R l tel>
        <SideBar I={I} />
        <R t tel style={{ padding: '20px', overflow: 'auto' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{ color: I.theme === 'dark' ? '#fff' : '#222', marginBottom: '20px' }}>
              Mail
            </h2>

            <div style={{
              background: I.theme === 'dark' ? '#2a2a2a' : '#f5f5f5',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
            }}>
              <h4 style={{ color: I.theme === 'dark' ? '#fff' : '#222', margin: '0 0 12px' }}>Compose</h4>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Recipient (username)"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  style={{
                    ...inputStyle(I.theme),
                    flex: 1,
                  }}
                />
                <input
                  type="text"
                  placeholder="Server"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  style={{
                    ...inputStyle(I.theme),
                    flex: 1,
                  }}
                />
              </div>
              <textarea
                placeholder="Write message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                style={{
                  ...inputStyle(I.theme),
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  marginBottom: '12px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={handleSend}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2196f3',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '14px',
                  }}
                >
                  Send
                </button>
                {status && (
                  <span style={{ color: status === 'Message sent' ? '#4caf50' : '#f44336', fontSize: '14px' }}>
                    {status}
                  </span>
                )}
              </div>
            </div>

            <h4 style={{ color: I.theme === 'dark' ? '#fff' : '#222' }}>Inbox</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sortedMessages.length === 0 && (
                <p style={{ color: '#888', fontStyle: 'italic' }}>No messages yet</p>
              )}
              {sortedMessages.map((m) => (
                <div
                  key={m._id}
                  style={{
                    background: I.theme === 'dark' ? '#2a2a2a' : '#f5f5f5',
                    borderRadius: '12px',
                    padding: '16px',
                    borderLeft: '4px solid #2196f3',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <strong style={{ color: I.theme === 'dark' ? '#fff' : '#222' }}>
                        {m.provider}/{m.username}
                      </strong>
                      <span style={{ color: '#888', fontSize: '12px', marginLeft: '12px' }}>
                        {new Date(m.date).toLocaleString()}
                      </span>
                    </div>
                    <button
                      onClick={() => I.mailDelete(m._id!)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#f44336',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  <p style={{
                    margin: 0,
                    color: I.theme === 'dark' ? '#ddd' : '#333',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.5',
                  }}>
                    {m.mail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </R>
      </R>
    </R>
  );
}

const inputStyle = (theme: string) => ({
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid #555',
  background: theme === 'dark' ? '#333' : '#fff',
  color: theme === 'dark' ? '#fff' : '#222',
  fontSize: '14px',
  outline: 'none',
});

export default Mail;
