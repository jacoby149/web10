import React from "react";
import ReactDOM from "react-dom";
import { pass, R, C, T } from "./components/Rectangles.js";
import ServiceTerms from "./components/ServiceTerms.js";
import SignIn from "./components/SignIn.js";

var wapi = window.wapiInit('https://auth.web10.app');
var wapiAuth = window.wapiAuthInit();
var telescope = window.telescope;

/* Plain Pad app made of entirely rectangles.js components */
function App() {
  const [authStatus, setAuthStatus] = React.useState(false);

  //list of all services, and desired to initialize services
  const [services, setServices] = React.useState([
    [{ body: { service: "log in to manage services" } }, null],
  ]);

  //for service changes, NOT initializations
  const [SMR, setSMR] = React.useState({
    scrs: [],
    sirs: [],//[{ body: { service: "addy" } }],
  });

  //provides an effect update every time an smr is submitted.
  //also provides a convenient count of SMRs
  const [SMRCount, setSMRCount] = React.useState(0);
  const SMRIncrement = function(){
    setSMRCount(SMRCount+1);
  }

  React.useEffect(function(){
    wapiAuth.SMRListen((inSMR)=>setSMR(inSMR))
  },[])

  //status message
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
        return (
          <ServiceTerms
            services={services}
            selectedService={selectedService}
            SMRHook={[SMR, setSMR]}
            SMRIncrement={SMRIncrement}
          />
        );
      default:
    }
  }

  function Services(props) {
    const final = props.services.map((service, idx) => {
      const type = service[1];
      const style =
        type === "new"
          ? { color: "#2ECC40" }
          : type === "change"
          ? { color: "yellow" }
          : {};
      return (
        <C
          bb
          h
          s={"40px"}
          key={idx}
          onClick={() => {
            setMode("services");
            setSelectedService(idx);
          }}
        >
          <p style={style}>{service[0].body.service}</p>
        </C>
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

  //web10 read for the services
  React.useEffect(
    function () {
      if (authStatus) {
        wapi
          .read("services")
          .then(function (response) {
            //label service change requests on existing services.
            const updatedServices = response.data.map((service) => [
              service,
              service["body"]["service"] in SMR["scrs"] ? "change" : null,
            ]);
            //add service initialization requests.
            const currServices = response.data.map(
              (service) => service["body"]["service"]
            );
            console.log(currServices);
            //makes a list of sirs not in the current services, and formats them for the UI correctly
            const SIRS = SMR["sirs"]
              .filter(
                (service) => !(currServices.includes(service["body"]["service"]))
              )
              .map((service) => [service, "new"]);
            //add sirs into the updatedservices
            updatedServices.push.apply(updatedServices, SIRS);
            //set the services in the UI
            setServices(updatedServices);
          })
          .catch(console.log);
      } else {
        setServices([
          [{ body: { service: "log in to manage services" } }, null],
        ]);
      }
    },
    [authStatus,SMRCount]
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
              setAuthStatus={setAuthStatus}
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
          Made by <a href="https://jacobhoffman.tk">Jacob Hoffman</a>
        </div>
      </C>
    </R>
  );
}

function Auth(props) {
  const [authStatus, setAuthStatus] = props.hook;

  const login = <p>please log in</p>;

  const logout = (
    <button style={{backgroundColor:"RGBA(0,0,0,0)",color:"orange",fontFamily:"monospace"}}
      onClick={() => {
        wapi.signOut();
        setAuthStatus(wapi.isSignedIn());
      }}
    >
      log out
    </button>
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
  return (
    <div style={{ width: "250px" }}>
      <div
        style={{ margin: "5px" }}
        className="notification is-warning is-light"
      >
        <u>{document.referrer}</u> would like to make service changes.{" "}
        <strong>approve or deny the changes in the left pane.</strong>
      </div>

      <div
        style={{ margin: "5px" }}
        className="notification is-danger is-light"
      >
        <u>{document.referrer}</u> would like to login.
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
        </div>
      </div>
    </div>
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
        <img src={"key_white.png"} alt="web10logo" style={{ height: "60%" }} />
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
