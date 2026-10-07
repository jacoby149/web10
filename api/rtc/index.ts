import { createRtcServer } from "./server";

const { server } = createRtcServer({ certifyBaseUrl: process.env.CERTIFY_BASE_URL });
server.listen(Number(process.env.PORT ?? 80), "0.0.0.0", () => {
  console.info("[rtc] listening");
});
