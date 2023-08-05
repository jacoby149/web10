import { env } from './env'

const config = {
    REACT_APP_DEFAULT_API: "api.localhost",
    REACT_APP_BETA_REQUIRED: false,
    REACT_APP_VERIFY_REQUIRED: true,
    REACT_APP_PAY_REQUIRED: false,
    REACT_APP_LOGO_DARK:"/YourOrgsLogo/key_white.png",
    REACT_APP_LOGO_LIGHT:"/YourOrgsLogo/key_black.png",
    REACT_APP_BRAND_TEXT:"app store"
}

// prioritizes the env vars if they exist
for (let key in config) {
    config[key] = env[key]?env[key]:config[key] 
  }

export {config}