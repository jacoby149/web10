import * as React from 'react';
import AppShell from '../shared/AppShell';
import ChangePhone from './ChangePhone';
import ChangePass from './ChangePassword';
import VerifyPhone from './VerifyPhone';
import Subscription from './Subscription';
import DevPay from './DevPay';
import Changelog from './Changelog';
import { cn } from '@/lib/utils';

type Tab = 'settings' | 'changes';

function Settings({ I }: { I: Record<string, any> }) {
  const [tab, setTab] = React.useState<Tab>('settings');

  return (
    <AppShell I={I} maxWidth="max-w-2xl" testid="settings-page">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Settings</h1>
      </div>
      <div className="mb-6 flex gap-1 rounded-lg bg-muted/50 p-1">
        {([
          { key: 'settings' as Tab, label: 'Account' },
          { key: 'changes' as Tab, label: 'Changes' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'settings' ? (
        <div className="space-y-4">
          <Subscription I={I} />
          {I.isVerified() ? <ChangePhone I={I} /> : <VerifyPhone I={I} />}
          <ChangePass I={I} />
          <DevPay I={I} />
        </div>
      ) : (
        <Changelog />
      )}
    </AppShell>
  );
}

export default Settings;