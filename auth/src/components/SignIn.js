import React from "react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";

//web10 sign in boxes and buttons
function SignIn({ setAuthStatus, statusHook, wapiAuth }) {
  const setStatus = statusHook[1];
  const [loginMode, setLoginMode] = React.useState(true);
  const [phone, setPhone] = React.useState("");
  return (
    <div style={{ width: "300px", marginBottom: "10px" }}>
      <div className="field">
        <p style={{ margin: "10px 10px" }} className="control has-icons-left">
          <input
            id="provider"
            className="input has-background-white"
            defaultValue={
              window.location.hostname === "auth.localhost"
                ? "api.localhost"
                : window.location.hostname === "auth.web10.dev"
                ? "api.web10.dev"
                : "api.web10.app"
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
      {loginMode ? (
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
          <div style={{ margin: "10px 10px" }}>
            <PhoneInput
              country={"us"}
              enableSearch={true}
              inputClass={"input"}
              dropdownStyle={{ color: "black" }}
              value={phone}
              onChange={(val) => {
                setPhone(val);
              }}
            />
          </div>
          <div style={{ display: "None" }} className="field">
            <p
              style={{ margin: "10px 10px" }}
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
        <p className="control">
          {loginMode ? (
            <button
              onClick={() => {
                setStatus("Logging in ...");
                wapiAuth.logIn(
                  document.getElementById("provider").value,
                  document.getElementById("username").value,
                  document.getElementById("password").value,
                  setAuthStatus,
                  setStatus
                );
              }}
              style={{ margin: "0px 10px" }}
              className="button is-success"
            >
              Login
            </button>
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
                if (password !== retype) {
                  setStatus("Failed to Sign Up : Passwords do not match.");
                  return;
                }
                setStatus("Signing Up ...");
                wapiAuth
                  .signUp(provider, username, password, betacode, phone)
                  .then(() =>
                    wapiAuth.logIn(
                      provider,
                      username,
                      password,
                      setAuthStatus,
                      (m) => setStatus(`Signed up. ${m}`)
                    )
                  )
                  .catch((error) =>
                    setStatus(
                      "Failed to Sign Up : " + error.response.data.detail
                    )
                  );
              }}
              style={{ margin: "0px 5px" }}
              className="button is-info"
            >
              Signup
            </button>
          )}
          <button
            onClick={() => setLoginMode(!loginMode)}
            style={{ margin: "0px 5px" }}
            className="button is-info is-light is-small"
          >
            {loginMode ? "Signup" : "Login"} Mode
          </button>
        </p>
      </div>
    </div>
  );
}

export default SignIn;
