import { env } from './env'

var config = {
    DEFAULT_API: "api.localhost",
    BETA_REQUIRED: false,
    VERIFY_REQUIRED: false,
    PAY_REQUIRED: false,
}

// prioritizes the env vars if they exist
for (let key in config) {
    config[key] = env[key]?env[key]:config[key] 
  }

export {config}
