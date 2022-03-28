import React from "react";

//web10 sign in boxes and buttons
function SignIn({ setAuthStatus, statusHook, wapiAuth }) {
  const setStatus = statusHook[1];
  const [loginMode, setLoginMode] = React.useState(true);
  return (
    <div style={{ width: "300px", marginBottom: "10px" }}>
      <div className="field">
        <p style={{ margin: "5px 10px" }} className="control has-icons-left">
          web10provider:{" "}
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
            placeholder="api.web10.app"
          />
        </p>
      </div>
      <div className="field">
        <p
          style={{ margin: "5px 10px" }}
          className="control has-icons-left has-icons-right"
        >
          username:
          <input
            id="username"
            className="input has-background-white"
            placeholder="Username"
          />
        </p>
      </div>
      <div className="field">
        <p style={{ margin: "5px 10px" }} className="control has-icons-left">
          password:{" "}
          <input
            id="password"
            className="input has-background-white"
            type="password"
            placeholder="Password"
          />
        </p>
      </div>
      {loginMode ? (
        ""
      ) : (
        <div style={{margin:"0 10px"}}>
          <div className="field">
            <p
              style={{ margin: "5px 0px" }}
              className="control has-icons-left"
            >
              email:{" "}
              <input
                id="email"
                className="input has-background-white"
                type="email"
                placeholder="Email - only for signup"
              />
            </p>
          </div>
          <div className="field">
            <p
              style={{ margin: "10px 0px" }}
              className="control has-icons-left"
            >
              betacode :{" "}
              <input
                id="betacode"
                className="input has-background-white"
                type="password"
                placeholder="only needed on signup"
              />
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
                    document.getElementById("email").value,
                    document.getElementById("betacode").value
                  )
                  .then(() => setStatus("Successfully Made An Account"))
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

export default SignIn;
