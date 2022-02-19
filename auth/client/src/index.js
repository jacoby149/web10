import React from 'react';
import ReactDOM from 'react-dom';
import wapi from './wapi'
import wapiAuth from './wapiAuth'
import { pass, R, C, T } from "./Rectangles.js";
/* Plain Pad app made of entirely rectangles.js components */
function App() {
  const [authStatus, setAuthStatus] = React.useState(false);
  const [services, setServices] = React.useState([
    { body: { service: "log in to manage services" } },
  ]);
  const [status, setStatus] = React.useState(
    "log in to authorize apps and manage services"
  );

  /* display mode of the UI, can be auth or services, */
  const [mode, setMode] = React.useState("auth");

  /* index of the selected service to display in the UI */
  const [selectedService, setSelectedService] = React.useState(0);

  /* Service Change Component */
  function ServiceChange() {
    const currentService = services[selectedService];
    return (
      <div>
        <p>{JSON.stringify(currentService)}</p>
        <div
          class="box warning"
          style={{ marginTop: "4px", marginLeft: "4px", marginRight: "4px" }}
        >
          <EditableField field={{ type: "input", data: "Harry" }} />
        </div>
        <EditApproval></EditApproval>
      </div>
    );
  }

  function displayBasedOnMode() {
    switch (mode) {
      case "auth":
        return <OAuth />;
      case "services":
        return <ServiceChange />;
      default:
    }
  }

  function Services(props) {
    const final = props.services.map((service, idx) => {
      return (
        <Service
          key={idx}
          onClick={() => {
            setMode("services");
            setSelectedService(idx);
          }}
        >
          {service.body.service}
        </Service>
      );
    });
    return (
      <R tel bb bt t {...pass(props)}>
        {final}
      </R>
    );
  }
  React.useEffect(()=>eval("startTelescope()"))
  React.useEffect(() => setAuthStatus(wapi.isSignedIn()), []);
  React.useEffect(
    function () {
      if (authStatus) {
        const token = wapi.readToken();
        wapi
          .get("services", token.username, token.provider)
          .then(function (response) {
            console.log(response.data);
            setServices(response.data);
          })
          .catch(console.log);
      } else {
        setServices([{ body: { service: "log in to manage services" } }]);
      }
    },
    [authStatus]
  );

  /* Menu Collapsed State */
  const [collapse, setCollapse] = React.useState(false);
  function toggleCollapse() {
    setCollapse(!collapse);
  }

  /* Theme Color State */
  const [theme, setTheme] = React.useState("dark");
  function toggleTheme() {
    if (theme == "dark") {
      setTheme("light");
    } else {
      setTheme("dark");
    }
  }

  /* The App Component */
  return (
    <R root t bt bb br bl theme={theme}>
      {/* This is the root rectangle ^^^ */}

      {/* Top Pane */}
      <R l bb s={"70px"}>
        <Branding />
        <Icon l ns onClick={toggleCollapse}>
          bars
        </Icon>
        <R tel />
        <R l ns s={"240px"}>
          <Auth hook={[authStatus, setAuthStatus]}></Auth>
          <Icon>user-circle</Icon>
          <Icon onClick={toggleTheme}>moon</Icon>
          <Icon>cog</Icon>
        </R>
      </R>

      {/*Everything Under Top Pane */}
      <R tel l>
        {/* Left Side Pane */}
        <R t ns br c={collapse} s={"240px"}>
          <C
            bb
            ha={"center"}
            s={"50px"}
            h
            onClick={() => {
              setMode("auth");
            }}
          >
            <h4>Authorize User</h4>
          </C>
          <R l s={"50px"}>
            <C s={"100px"}>
              <h4>Services: </h4>
            </C>
            <T tel ns>
              Search...
            </T>
          </R>

          <Services services={services}></Services>

          <Credits />
        </R>

        {/* Writing Pane */}
        <R t tel>
          {!authStatus ? (
            <SignIn
              authHook={[authStatus, setAuthStatus]}
              statusHook={[status, setStatus]}
            ></SignIn>
          ) : (
            <R bt t>
              {displayBasedOnMode()}
            </R>
          )}
        </R>
      </R>
    </R>
  );
}

/* The credit/link to the original Plain Pad project */
function Credits(props) {
  return (
    <R t {...pass(props)}>
      <C s={"70px"}>
        <div style={{ fontFamily: "monospace" }}>
          Made by Sato and <a href="https://jacobhoffman.tk">Suzuki</a>
        </div>
      </C>
    </R>
  );
}

function SignIn(props) {
  const [authStatus, setAuthStatus] = props.authHook;
  const [status, setStatus] = props.statusHook;
  return (
    <div style={{ width: "300px", height: "210px" }}>
      <div className="field">
        <p style={{ margin: "5px 10px" }} className="control has-icons-left">
          web10provider:{" "}
          <input
            id="provider"
            className="input has-background-white"
            defaultValue="http://api.localhost"
            placeholder="http://api.localhost"
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
                document.getElementById('provider').value,
                document.getElementById('username').value,
                document.getElementById('password').value,
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
              wapiAuth.signUp(document.getElementById('provider').value,
              document.getElementById('username').value,
              document.getElementById('password').value)
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

function Auth(props) {
  const [authStatus, setAuthStatus] = props.hook;

  const login = <a>please log in</a>;

  const logout = (
    <a
      onClick={() => {
        wapi.signOut();
        setAuthStatus(wapi.isSignedIn());
      }}
    >
      log out
    </a>
  );

  return (
    <C s={"80px"} {...pass(props)}>
      <div style={{ fontFamily: "monospace" }}>
        {authStatus ? logout : login}
      </div>
    </C>
  );
}
function OAuth(props) {
  const serviceString = "this dont make fucking sense anymore";
  return (
    <div style={{ width: "250px" }}>
      <div style={{ margin: "5px" }} className="box is-danger is-light">
        &#123; Log in to continue. &#125;
      </div>
      <div
        style={{ margin: "5px" }}
        className="notification is-danger is-light"
      >
        <a>{document.referrer}</a> would like to login.
      </div>
      <div className="field">
        <div className="control">
          <button
            onClick={wapiAuth.sendToken}
            style={{ margin: "0px 5px" }}
            className="button is-warning"
          >
            Authorize
          </button>
          <br />

          <div
            style={{ margin: "5px" }}
            className="notification is-danger is-light"
          >
            <a>{document.referrer}</a> would like to add services{" "}
            <strong>{serviceString}.</strong>
          </div>

          <button
            onClick={wapiAuth.sendToken}
            style={{ margin: "0px 5px" }}
            className="button is-warning"
          >
            Approve
          </button>
          <button
            onClick={wapiAuth.sendToken}
            style={{ margin: "0px 5px" }}
            className="button is-warning"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
/* A custom sub class of Content(C). (Which makes it a subclass of (R))
/* For Custom Rectangle subclasses, make sure to pass props.ps through. */
function Service(props) {
  return (
    <C bb h s={"40px"} {...pass(props)}>
      {props.children}
    </C>
  );
}

/* Custom Rectangles.js Icon Component */
function Icon(props) {
  const iconClass = "fa-" + props.children;
  return (
    <C s={"50px"} {...pass(props)}>
      <i className={"fa " + iconClass + " fa-2x font-weight-bold"}></i>
    </C>
  );
}

/* Top Pane Site Branding Component */
function Branding(props) {
  return (
    <R l {...pass(props)}>
      <C l p="0 0 0 22" s={"70px"}>
        {/* Plain Pad Logo */}
        <img src={"key_white.png"} style={{ height: "60%" }} />
      </C>

      <C l ns mc s={"120px"}>
        <div style={{ fontFamily: "monospace" }}>
          <h3>
            Web 10
            <br /> Auth
          </h3>
        </div>
      </C>
    </R>
  );
}

function EditableField({ field }) {
  switch (field.type) {
    case "switch": {
      return EditableSwitch(field)
    }
    case "input": {
      return EditableInput(field)
    }
    case "select": {
      return EditableDropDown(field)
    }
  }
}

const EditableSwitch = ({data}) => {
  return (
    <div>
      <h1>{data.title}</h1>
      
    </div>
  )
}

const EditableInput = ({ data }) => {
  var [updated, setUpdated] = React.useState(data);
  return (
    <div style={{ marginLeft: "4px", marginTop: "4px" }}>
      field : {data == updated ? (
        ""
      ) : (
        <span style={{ color: "firebrick", textDecoration: "line-through" }}>
          {data}
        </span>
      )}
      <input
        style={{ color: "#2ECC40" }}
        defaultValue={data}
        onChange={(event) => setUpdated(event.target.value)}
      ></input>
    </div>
  );
}

const EditableDropDown = () => {
  return (
    <div>

    </div>
  )
}

function EditApproval() {
  return (
    <div>
      <button
        onClick={wapiAuth.sendToken}
        style={{ margin: "0px 5px" }}
        className="button is-warning"
      >
        Approve Service Changes
      </button>
      <button
        onClick={wapiAuth.sendToken}
        style={{ margin: "0px 5px" }}
        className="button is-warning"
      >
        Deny Service Changes
      </button>
    </div>
  );
}


ReactDOM.render(
  <App/>,
  document.getElementById('root')
)