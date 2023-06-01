import { env } from './env'
import key_white from "./assets/images/key_white.png"
import key_black from "./assets/images/key_white.png"

var config = {
    DEFAULT_API: "api.localhost",
    BETA_REQUIRED: false,
    VERIFY_REQUIRED: false,
    PAY_REQUIRED: false,
    LOGO_LIGHT:key_white,
    LOGO_DARK:key_black,
    BRAND_TEXT:"web10"
}

// prioritizes the env vars if they exist
for (let key in config) {
    config[key] = env[key]?env[key]:config[key] 
  }

export {config}