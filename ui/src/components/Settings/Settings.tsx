import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import MobileNav from '../shared/MobileNav';
import ChangePhone from './ChangePhone';
import ChangePass from './ChangePassword';
import VerifyPhone from './VerifyPhone';
import Subscription from './Subscription';
import DevPay from './DevPay';

function Settings({ I }: { I: Record<string, any> }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar I={I} />
      <div className="flex flex-1 overflow-auto">
        <SideBar I={I} />
        <div className="flex-1 overflow-auto pb-16 md:pb-0">
          <div className="mx-auto max-w-2xl p-4 sm:p-6" data-testid="settings-page">
            <div className="mb-6">
              <h1 className="font-display text-2xl font-bold text-foreground">Settings</h1>
            </div>
            <div className="space-y-4">
              <Subscription I={I} />
              {I.isVerified() ? <ChangePhone I={I} /> : <VerifyPhone I={I} />}
              <ChangePass I={I} />
              <DevPay I={I} />
            </div>
          </div>
        </div>
      </div>
      <MobileNav I={I} />
    </div>
  );
}

export default Settings;