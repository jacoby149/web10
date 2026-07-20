import AppShell from '../shared/AppShell';
import ChangePhone from './ChangePhone';
import ChangePass from './ChangePassword';
import VerifyPhone from './VerifyPhone';
import Subscription from './Subscription';
import DevPay from './DevPay';

function Settings({ I }: { I: Record<string, any> }) {
  return (
    <AppShell I={I} maxWidth="max-w-2xl" testid="settings-page">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Settings</h1>
      </div>
      <div className="space-y-4">
        <Subscription I={I} />
        {I.isVerified() ? <ChangePhone I={I} /> : <VerifyPhone I={I} />}
        <ChangePass I={I} />
        <DevPay I={I} />
      </div>
    </AppShell>
  );
}

export default Settings;