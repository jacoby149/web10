function BetaCode({ I }) {
    return (
        <div style={I.config.BETA_REQUIRED ? {} : { display: "None" }} className="field">
            <p
                style={{ margin: "0px 10px 10px 10px" }}
                className="control has-icons-left"
            >
                <input
                    id="betacode"
                    className="input has-background-white"
                    type="password"
                    placeholder="Beta Code"
                />
                <span className="icon is-small is-left">
                    <i className="fas fa-key"></i>
                </span>
            </p>
        </div>
    )
}

export default BetaCode;