import { env } from './env'

var config = {
  REACT_APP_DEFAULT_API: "api.localhost",
  REACT_APP_BETA_REQUIRED: false,
  REACT_APP_VERIFY_REQUIRED: false,
  REACT_APP_PAY_REQUIRED: false,
}

// prioritizes the env vars if they exist
for (let key in config) {
  config[key] = env[key] ? env[key] : config[key]
}

export { config }
