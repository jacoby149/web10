function Username({I}) {
    return (
        <div className="field">
            <p
                style={{ margin: "5px 10px" }}
                className="control has-icons-left has-icons-right"
            >
                <input
                    id="username"
                    className="input has-background-white"
                    placeholder="Username"
                />
                <span className="icon is-small is-left">
                    <i className="fas fa-user"></i>
                </span>
            </p>
        </div>
    )
}

export default Username;