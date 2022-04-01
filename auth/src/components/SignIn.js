import React from "react";

//web10 sign in boxes and buttons
function SignIn({ setAuthStatus, statusHook, wapiAuth }) {
  const setStatus = statusHook[1];
  const [loginMode, setLoginMode] = React.useState(true);
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
        <div style={{ margin: "0 10px" }}>
          <PhoneInput></PhoneInput>
          <div className="field">
            <p
              style={{ margin: "10px 0px" }}
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
      {/* <div className="field">
                  <p style = {{"margin":"5px"}} className="control has-icons-left">
                      <input id = "confirmPassword" className="input has-background-white" type="password" placeholder="Confirm Password"/>
                  </p>
          </div> */}

      <div className="field">
        <p className="control">
          {loginMode ? (
            <button
              onClick={() =>
                wapiAuth.logIn(
                  document.getElementById("provider").value,
                  document.getElementById("username").value,
                  document.getElementById("password").value,
                  setAuthStatus,
                  setStatus
                )
              }
              style={{ margin: "0px 10px" }}
              className="button is-success"
            >
              Login
            </button>
          ) : (
            <button
              onClick={() =>
                wapiAuth
                  .signUp(
                    document.getElementById("provider").value,
                    document.getElementById("username").value,
                    document.getElementById("password").value,
                    document.getElementById("phone").value,
                    document.getElementById("betacode").value
                  )
                  .then(() =>
                    wapiAuth.logIn(
                      document.getElementById("provider").value,
                      document.getElementById("username").value,
                      document.getElementById("password").value,
                      setAuthStatus,
                      (m) => setStatus(`Signed up. ${m}`)
                    )
                  )
                  .catch((error) =>
                    setStatus(
                      "Failed to Sign Up : " + error.response.data.detail
                    )
                  )
              }
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

function PhoneInput() {
  const [number, setNumber] = React.useState("+1");
  return (
    <div class="field-body">
      <div class="field is-expanded">
        <div class="field has-addons">
          <p style={{ marginBottom: "2px" }} class="control">
            <div class="select is-fullwidth">
              <select style={{backgroundColor:"#ececec"}}>
                <option>+1</option>
              </select>
            </div>
          </p>
          <p class="control is-expanded">
            <input
              style={{ backgroundColor: "white" }}
              class="input"
              type="tel"
              placeholder="📞 Phone Number"
            />
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
