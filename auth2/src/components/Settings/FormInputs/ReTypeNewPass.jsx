function ReTypeNewPass({ I }) {
    return (
        <div className="field">
            <p
                style={{ margin: "5px 10px" }}
                className="control has-icons-left">
                <input
                    id="retypepass"
                    className="input has-background-white"
                    type="password"
                    placeholder="Retype New Password"
                />
                <span className="icon is-small is-left">
                    <i className="fas fa-lock"></i>
                </span>
            </p>
        </div>
    )
}

export default ReTypeNewPass;
