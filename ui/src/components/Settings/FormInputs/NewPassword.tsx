function NewPassword({ I, value, onChange }: { I: Record<string, any>, value?: string, onChange?: (val: string) => void }) {
    return (
        <div className="field">
            <p style={{ margin: "5px 10px" }} className="control has-icons-left">
                <input
                    id="password"
                    className="input has-background-white"
                    type="password"
                    placeholder="Type New Password"
                    value={value || ""}
                    onChange={(e) => onChange?.(e.target.value)}
                />
                <span className="icon is-small is-left">
                    <i className="fas fa-lock"></i>
                </span>
            </p>
        </div>
    )
}

export default NewPassword;