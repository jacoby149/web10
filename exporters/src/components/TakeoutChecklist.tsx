import { useState } from 'react'
import type { Platform } from '../types'

type ChecklistStep = {
  title: string
  description: string
}

const CHECKLISTS: Record<Platform, ChecklistStep[]> = {
  instagram: [
    {
      title: 'Open Instagram',
      description: 'Go to instagram.com and log in to your account.',
    },
    {
      title: 'Go to Settings',
      description: 'Click your profile picture > Settings and privacy > Your information and permissions > Download your information.',
    },
    {
      title: 'Request Export',
      description: 'Click "Request Download". Choose "Complete copy" for everything.',
    },
    {
      title: 'Choose JSON Format',
      description: 'Select "JSON" format (required for import). Choose "Highest" quality. Optionally send to Google Drive or Dropbox instead of downloading.',
    },
    {
      title: 'Wait for Meta (1-3 days)',
      description: 'Meta will prepare your archive. You\'ll get a notification when it\'s ready.',
    },
    {
      title: 'Download the ZIP',
      description: 'When ready, download the ZIP file. If you chose Drive/Dropbox, it will appear there directly.',
    },
  ],
  facebook: [
    {
      title: 'Open Facebook',
      description: 'Go to facebook.com and log in to your account.',
    },
    {
      title: 'Go to Settings',
      description: 'Settings & Privacy > Settings > Your information and permissions > Download your information.',
    },
    {
      title: 'Create a File',
      description: 'Click "Create File". Select the date range (all time recommended). Choose "JSON" format and "Highest" quality.',
    },
    {
      title: 'Select Data Types',
      description: 'Select Posts, Photos, and Friends. Click "Next" and enter your password to confirm.',
    },
    {
      title: 'Wait for Meta (1-3 days)',
      description: 'Facebook will prepare your archive. You\'ll get a notification and email when it\'s ready.',
    },
    {
      title: 'Download the ZIP',
      description: 'When ready, click "Download" at the top of the page. Optionally send to Google Drive or Dropbox.',
    },
  ],
  youtube: [
    {
      title: 'Open Google Takeout',
      description: 'Go to takeout.google.com and sign in with your Google account.',
    },
    {
      title: 'Select YouTube Only',
      description: 'Click "Deselect all", then find and check "YouTube and YouTube Music". Click "All YouTube data included" to choose specific data types.',
    },
    {
      title: 'Choose Data Types',
      description: 'Select Videos, Comments, and Channels. Click OK, then "Next step".',
    },
    {
      title: 'Choose Export Settings',
      description: 'Select "JSON" format if available. Choose file size (smaller = split into multiple files). Pick export destination: download link, Google Drive, Dropbox, etc.',
    },
    {
      title: 'Create Export',
      description: 'Choose "Export once" and click "Create export". Google will prepare your data.',
    },
    {
      title: 'Download the ZIP',
      description: 'Google will email you when ready. Download the ZIP file(s) from the link in the email or from your chosen destination.',
    },
  ],
}

interface TakeoutChecklistProps {
  platform: Platform
  onDone: () => void
}

export function TakeoutChecklist({ platform, onDone }: TakeoutChecklistProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const steps = CHECKLISTS[platform]
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1)

  const toggleStep = (idx: number) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const allDone = checked.size === steps.length

  return (
    <div style={{ marginBottom: '32px' }}>
      <div className="box">
        <h2 className="title is-size-5">
          Getting Your {platformLabel} Data
        </h2>
        <p style={{ color: '#7a7a7a', marginBottom: '16px' }}>
          {platform === 'youtube'
            ? 'Google requires you to request your data export through Google Takeout.'
            : `${platformLabel} requires you to request your data export through their app or website.`}
          {' '}Follow these steps, then come back here with the ZIP file.
        </p>

        {steps.map((step, idx) => (
          <div
            key={idx}
            onClick={() => toggleStep(idx)}
            style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'flex-start',
              padding: '12px 16px',
              marginBottom: idx < steps.length - 1 ? '8px' : 0,
              borderRadius: '6px',
              cursor: 'pointer',
              background: checked.has(idx) ? '#f0faf0' : 'transparent',
              borderLeft: checked.has(idx) ? '3px solid #48c78e' : '3px solid transparent',
            }}
          >
            <span
              style={{
                width: '24px',
                height: '24px',
                minWidth: '24px',
                borderRadius: '50%',
                border: checked.has(idx) ? '2px solid #48c78e' : '2px solid #dbdbdb',
                background: checked.has(idx) ? '#48c78e' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: checked.has(idx) ? 'white' : 'transparent',
                fontSize: '12px',
                marginTop: '2px',
              }}
            >
              {checked.has(idx) ? '✓' : ''}
            </span>
            <div>
              <strong style={{ fontSize: '15px' }}>
                {idx + 1}. {step.title}
              </strong>
              <p style={{ margin: '4px 0 0', color: '#7a7a7a', fontSize: '14px' }}>
                {step.description}
              </p>
            </div>
          </div>
        ))}

        {allDone && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button className="button is-primary is-medium" onClick={onDone}>
              I Have My ZIP File — Continue to Import
            </button>
          </div>
        )}

        {!allDone && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <span style={{ color: '#7a7a7a', fontSize: '14px' }}>
              Check off each step as you complete it ({checked.size}/{steps.length})
            </span>
            <br />
            <button
              onClick={onDone}
              style={{
                background: 'none',
                border: 'none',
                color: '#485fc7',
                cursor: 'pointer',
                fontSize: '14px',
                marginTop: '8px',
                textDecoration: 'underline',
              }}
            >
              Skip checklist — I already have my ZIP
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
