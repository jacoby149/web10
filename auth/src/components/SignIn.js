import React from "react";

//web10 sign in boxes and buttons
function SignIn({ setAuthStatus, statusHook, wapiAuth }) {
  const [status, setStatus] = statusHook;
  return (
    <div style={{ width: "300px", height: "210px" }}>
      <div className="field">
        <p style={{ margin: "5px 10px" }} className="control has-icons-left">
          web10provider:{" "}
          <input
            id="provider"
            className="input has-background-white"
            defaultValue={
              window.location.hostname == "auth.localhost"
                ? "http://api.localhost"
                : window.location.hostname == "crm.web10.dev"
                ? "https://api.web10.dev"
                : "https://api.web10.app"
            }
            placeholder="https://api.web10.app"
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
      <div className="field">
        <p style={{ margin: "5px 10px" }} className="control has-icons-left">
          betacode :{" "}
          <input
            id="betacode"
            className="input has-background-white"
            type="password"
            placeholder="only needed on signup"
          />
        </p>
      </div>
      {/* <div className="field">
                  <p style = {{"margin":"5px"}} className="control has-icons-left">
                      <input id = "confirmPassword" className="input has-background-white" type="password" placeholder="Confirm Password"/>
                  </p>
          </div> */}
      <div
        style={{ margin: "5px" }}
        className="notification is-danger is-light"
      >
        {status}
      </div>

      <div className="field">
        <p className="control">
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
          <button
            onClick={() =>
              wapiAuth.signUp(
                document.getElementById("provider").value,
                document.getElementById("username").value,
                document.getElementById("password").value,
                document.getElementById("betacode").value
              )
            }
            style={{ margin: "0px 5px" }}
            className="button is-info"
          >
            Signup
          </button>
        </p>
      </div>
    </div>
  );
}

export default SignIn;
