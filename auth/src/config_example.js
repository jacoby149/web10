var config = {
    DEFAULT_API: process.env.REACT_APP_DEFAULT_API || "api.localhost",
    BETA_REQUIRED: process.env.REACT_APP_BETA_REQUIRED || false,
    VERIFY_REQUIRED: process.env.REACT_APP_VERIFY_REQUIRED || false,
    PAY_REQUIRED: process.env.REACT_APP_PAY_REQUIRED || false,
}

export {config}