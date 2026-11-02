import { createRTC, setPeer } from './index';
declare global {
    interface Window {
        web10rtc: {
            createRTC: typeof createRTC;
            setPeer: typeof setPeer;
        };
    }
}
//# sourceMappingURL=browser.d.ts.map