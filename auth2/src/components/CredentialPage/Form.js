import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";

function CredentialForm({ I }) {
    return (
        
            <div className="center-container credential-form" style={{width:"300px",margin:"auto",marginTop:"70px"}}>
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
                {I.mode === "login" ? (
                    ""
                ) : (
                    <div>
                        <div className="field">
                            <p
                                style={{ margin: "5px 10px" }}
                                className="control has-icons-left"
                            >
                                <input
                                    id="retypepass"
                                    className="input has-background-white"
                                    type="password"
                                    placeholder="Retype Password"
                                />
                                <span className="icon is-small is-left">
                                    <i className="fas fa-lock"></i>
                                </span>
                            </p>
                        </div>
                        <div style={I.config.VERIFY_REQUIRED ? { margin: "0 10px" } : { display: "None" }}>
                            <div style={{ width: "calc(100% - 40px)", float: "left" }}>
                                <PhoneInput
                                    country={"us"}
                                    enableSearch={true}
                                    inputClass={"input"}
                                    dropdownStyle={{ color: "black" }}
                                    preferredCountries={['us', 'il', 'jp']}
                                    value={I.phone}
                                    onChange={(val) => {
                                        I.setPhone(val);
                                    }}
                                />
                            </div>
                            <div className="icon" title="web10 uses Twilio to authenticate users" style={{ marginLeft: "10px", marginTop: "6px" }}>
                                <i className="fas fa-lg fa-info-circle"></i>
                            </div>
                            <br></br><br></br>
                        </div>
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
                    </div>
                )}

                <div className="field">
                    <div className="control">
                        {I.mode === "login" ? (
                            <div>
                                <button
                                    onClick={() => {
                                        I.logIn(
                                            document.getElementById("provider").value,
                                            document.getElementById("username").value,
                                            document.getElementById("password").value,
                                        );
                                    }}
                                    style={{ margin: "0px 10px" }}
                                    className="button is-success"
                                >
                                    Login
                                </button>
                                <div style={{ margin: "20px" }}><a><u>Forgot Username or Password?</u></a></div>

                                <button
                                    onClick={() => I.setMode("signup")}
                                    style={{ margin: "10px 10px" }}
                                    className="button is-warning">
                                    Create A New Account
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => {
                                    const [provider, username, password, betacode, retype] = [
                                        document.getElementById("provider").value,
                                        document.getElementById("username").value,
                                        document.getElementById("password").value,
                                        document.getElementById("betacode").value,
                                        document.getElementById("retypepass").value,
                                    ];
                                    I.signUp(provider, username, password, retype, betacode)
                                }}
                                style={{ margin: "0px 10px" }}
                                className="button is-primary"
                            >
                                Signup
                            </button>
                        )}
                    </div>
                </div>
            </div>
    );

}

export default CredentialForm;