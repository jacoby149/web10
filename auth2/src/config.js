import { env } from './env'

const config = {
    DEFAULT_API: "api.localhost",
    BETA_REQUIRED: false,
    VERIFY_REQUIRED: false,
    PAY_REQUIRED: false,
    LOGO_DARK:"/YourOrgsLogo/key_white.png",
    LOGO_LIGHT:"/YourOrgsLogo/key_black.png",
    BRAND_TEXT:"app store"
}

// prioritizes the env vars if they exist
for (let key in config) {
    config[key] = env[key]?env[key]:config[key] 
  }

export {config}