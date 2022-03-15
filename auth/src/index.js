import React from "react";
import ReactDOM from "react-dom";
import { pass, R, C, T } from "./components/Rectangles.js";
import ServiceChange from "./components/ServiceChange.js"
import SignIn from "./components/SignIn.js"

var wapi = window.wapi;
var wapiAuth = window.wapiAuth;
var telescope = window.telescope;

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

  function displayBasedOnMode() {
    switch (mode) {
      case "auth":
        return <OAuth />;
      case "services":
        return <ServiceChange services={services} selectedService={selectedService} />;
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

  React.useEffect(() => telescope.start(window.root));
  React.useEffect(() => setAuthStatus(wapi.isSignedIn()), []);
  React.useEffect(
    function () {
      if (authStatus) {
        const token = wapi.readToken();
        wapi
          .get("services", token.username, token.provider)
          .then(function (response) {
            console.log(response.data);
            //TODO changes and additions here
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
    if (theme === "dark") {
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
        <R l ns s={"300px"}>
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
              wapiAuth={wapiAuth}
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

//authorization
function OAuth(props) {
  const serviceString = "Add name of service here";
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
            Log In
          </button>
          <br />

          <div
            style={{ margin: "5px" }}
            className="notification is-danger is-light"
          >
            <a>{document.referrer}</a> would like to make service changes.{" "}
            <strong>approve or deny the changes in the left pane.</strong>
          </div>
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
      <C l p="0px 0px 0px 22px" s={"70px"}>
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

ReactDOM.render(<App />, document.getElementById("root"));
