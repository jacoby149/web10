function Provider({I}) {
    return (
        <div className="field" >
            <p style={{ margin: "10px 10px" }} className="control has-icons-left">
                <input
                    id="provider"
                    className="input has-background-white"
                    defaultValue={I.config.DEFAULT_API
                    }
                    placeholder="Web10 Provider"
                />
                <span className="icon is-small is-left">
                    <i className="fas fa-globe"></i>
                </span>
            </p>
        </div>
    )
}

export default Provider;