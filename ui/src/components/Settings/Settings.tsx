import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import ChangePhone from './ChangePhone';
import ChangePass from './ChangePassword';
import VerifyPhone from './VerifyPhone';
import Subscription from './Subscription';
import DevPay from './DevPay';

function Settings({ I }: { I: Record<string, any> }) {
  return (
    <div className={`min-h-screen flex flex-col ${I.theme === 'dark' ? 'dark' : ''}`} style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
      <TopBar I={I} />
      <div className="flex flex-1 overflow-auto">
        <SideBar I={I} />
        <div className="flex-1 p-6 overflow-auto">
          <div className="text-center py-4">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Settings</h2>
          </div>
          <div className="max-w-[800px] mx-auto space-y-4">
            <Subscription I={I} />
            {I.isVerified() ? <ChangePhone I={I} /> : <VerifyPhone I={I} />}
            <ChangePass I={I} />
            <DevPay I={I} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;