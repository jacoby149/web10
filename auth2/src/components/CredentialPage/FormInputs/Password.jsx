function Password({ I }) {
    return (
        <div className="field">
            {/* <p style={{marginLeft:"10px"}}>Password:{" "}</p> */}

            <p style={{ margin: "5px 10px" }} className="control has-icons-left">
                <input
                    id="password"
                    className="input has-background-white"
                    type="password"
                    placeholder="Password"
                />
                <span className="icon is-small is-left">
                    <i className="fas fa-lock"></i>
                </span>
            </p>
        </div>
    )
}

export default Password;