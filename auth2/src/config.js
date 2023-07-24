import { env } from './env'

const config = {
    DEFAULT_API: "api.localhost",
    BETA_REQUIRED: false,
    VERIFY_REQUIRED: false,
    PAY_REQUIRED: false,
    LOGO_LIGHT:"/YourOrgsLogo/generic_school_logo_black.png",
    LOGO_DARK:"/YourOrgsLogo/generic_school_logo_white.png",
    BRAND_TEXT:"app store"
}

// prioritizes the env vars if they exist
for (let key in config) {
    config[key] = env[key]?env[key]:config[key] 
  }

export {config}