import React from "react";
import ReactDOM from "react-dom";
import { pass, R, C, T, startRectangles } from "rectangles-npm";
import 'rectangles-npm/src/Rectangles.css'
import ServiceTerms from "./components/ServiceTerms.js";
import SignIn from "./components/SignIn.js";
import {env} from "./env"

var wapi = window.wapi;
var wapiAuth = window.wapiAuth;

/* Plain Pad app made of entirely rectangles.js components */
function App() {
  const [width, setWidth] = React.useState(window.innerWidth);

  function handleWindowSizeChange() {
    setWidth(window.innerWidth);
  }
  React.useEffect(() => {
    window.addEventListener("resize", handleWindowSizeChange);
    return () => {
      window.removeEventListener("resize", handleWindowSizeChange);
    };
  }, []);

  const [authStatus, setAuthStatus] = React.useState(false);

  //list of all services, and desired to initialize services
  const [services, setServices] = React.useState([
    [{ service: "log in to manage services" }, null],
  ]);

  //for service changes, NOT initializations
  const [SMR, setSMR] = React.useState({
    scrs: [],
    sirs: [],
  });

  React.useEffect(function () {
    wapiAuth.SMRListen((inSMR) => {
      setSMR(inSMR);
    });
  }, []);

  /* display mode of the UI, can be auth or services, */
  const [mode, setMode] = React.useState("auth");

  /* Menu Collapsed State */
  const [collapse, setCollapse] = React.useState(width < 768);
  function toggleCollapse() {
    setCollapse(!collapse);
  }

  //status message
  const [status, setStatus] = React.useState(null);
  React.useEffect(() => {
    //check if services need to be disabled
    if (
      authStatus &&
      services[0][0]["service"] !== "log in to manage services" &&
      env.REACT_APP_VERIFY_REQUIRED && !services[0][0]["verified"]
    ) {
      setMode("services-disabled");
      setCollapse(true);
    }

    //check if services need to be re enabled
    if (services[0][0]["verified"] === true && mode === "services-disabled") {
      setMode("services");
    }

    setStatus(null);
  }, [authStatus, mode, services]);

  /* index of the selected service to display in the UI */
  const [selectedService, setSelectedService] = React.useState(0);

  function displayBasedOnMode() {
    switch (mode) {
      case "auth":
        return (
          <div>
            <StatusLog />
            <OAuth services={services} setSelectedService={setSelectedService} setMode={setMode} />
          </div>
        );
      case "services":
      case "services-disabled":
        return (
          <div>
            <ServiceTerms
              services={services}
              selectedServiceHook={[selectedService, setSelectedService]}
              SMRHook={[SMR, setSMR]}
              servicesLoad={servicesLoad}
              setStatus={setStatus}
              mode={mode}
              setMode={setMode}
            />
            <StatusLog />
          </div>
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
            if (props.width < 768) props.toggleCollapse();
          }}
        >
          <p style={style}>{service[0].service}</p>
        </C>
      );
    });
    return (
      <R tel bb bt t {...pass(props)}>
        {final}
      </R>
    );
  }

  function Auth(props) {
    const login = <p>please log in</p>;

    const logout = (
      <button
        style={{
          backgroundColor: "RGBA(0,0,0,0)",
          color: "orange",
          fontFamily: "monospace",
        }}
        onClick={() => {
          wapi.signOut();
          setAuthStatus(wapi.isSignedIn());
          setMode("auth");
        }}
      >
        log out
      </button>
    );

    return (
      <C s={"70px"} {...pass(props)}>
        <div style={{ fontFamily: "monospace" }}>
          {authStatus ? logout : login}
        </div>
      </C>
    );
  }
  React.useEffect(() => {
    setAuthStatus(wapi.isSignedIn());
  }, []);

  //web10 read for the services
  const servicesLoad = function () {
    if (authStatus) {
      wapi
        .read("services")
        .then(function (response) {
          response.data.sort((a, b) => a["_id"].localeCompare(b["_id"]));

          //add service initialization requests.
          const currServices = response.data.map(
            (service) => service["service"]
          );
          //makes a list of sirs not in the current services, and formats them for the UI correctly
          const SIRS = SMR["sirs"]
            .filter(
              (service) =>
                !currServices.includes(service["service"]) &&
                service["service"] !== "*"
            )
            .map((service) => [service, "new"]);
          //add sirs into the updatedservices


          //label service change requests on existing services.
          const updatedServices = response.data.map((service) => {
            const curr = service["service"];
            var serviceType = null
            const _SIRS = SMR["sirs"].map((s)=>s["service"])
            if (curr === "*") serviceType = null
            else if (curr in SMR["scrs"]) serviceType = "change"
            
            //SIR cross origin convenience SCR
            else if (_SIRS.includes(curr)) {
              const currOrigins = service["cross_origins"]
              const SIROrigins = SMR["sirs"].filter((service) => service["service"] === curr)[0]["cross_origins"]
              if (SIROrigins.filter(s=>!new Set(currOrigins).has(s)).length>0) serviceType = "change"
            }

            return [
              service, serviceType
            ]
          });

          updatedServices.push.apply(updatedServices, SIRS);
          //set the services in the UI
          setServices(updatedServices);
          //let the menu button click if verify phone number...
        })
        .catch(console.error);
    } else {
      setServices([[{ service: "log in to manage services" }, null]]);
    }
  };
  React.useEffect(servicesLoad, [authStatus, SMR]);

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
  function StatusLog() {
    return (
      <div>
        {status === null ? (
          <div></div>
        ) : (
          <div
            style={{ marginLeft: "5px", marginTop: "5px", width: "280px" }}
            className="notification is-warning is-light"
          >
            {status}
          </div>
        )}
      </div>
    );
  }
  var referrer = window.location.hostname;
  if (window.document.referrer !== "")
    referrer = new URL(window.document.referrer).hostname;
  return (
    <R root t bt bb br bl theme={theme}>
      {/* This is the root rectangle ^^^ */}

      {/* Top Pane */}
      <R ns l bb s={"70px"}>
        <Icon
          l
          ns
          onClick={() => {
            return mode === "services-disabled"
              ? setStatus("you must verify phone number to access the menu")
              : toggleCollapse();
          }}
        >
          bars
        </Icon>

        <Branding />
        <R tel />
        <R l ns s={"240px"}>
          <Auth></Auth>
          <Icon onClick={toggleTheme}>moon</Icon>
          <Icon
            onClick={() => {
              setMode("auth");
            }}
          >
            user-circle
          </Icon>
          <Icon
            onClick={() => {
              setSelectedService(0);
              setMode("services");
            }}
          >
            cog
          </Icon>
        </R>
      </R>

      {/*Everything Under Top Pane */}
      <R tel l>
        {/* Left Side Pane */}
        <R t ns br c={collapse} s={width > 768 ? "240px" : "100%"}>
          {referrer === window.location.hostname ? (
            <div></div>
          ) : (
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
          )}
          <R l s={"50px"}>
            <C s={"100px"}>
              <h4>Services: </h4>
            </C>
            {/* <T tel ns>
               Search...
            </T> */}
          </R>

          <Services
            services={services}
            width={width}
            toggleCollapse={toggleCollapse}
          ></Services>

          <Credits />
        </R>

        {/* Writing Pane */}
        <R t tel>
          {!authStatus ? (
            <div>
              <SignIn
                setAuthStatus={setAuthStatus}
                statusHook={[status, setStatus]}
                wapiAuth={wapiAuth}
              ></SignIn>
              <StatusLog />
            </div>
          ) : (
            <div>{displayBasedOnMode()}</div>
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
          Invented by Jacob Hoffman<br></br>
          <a href="https://docs.web10.app">the web10 SDK docs page</a>
        </div>
      </C>
    </R>
  );
}

//authorization
function OAuth({ services, setSelectedService, setMode }) {
  const SMRs = services
    .map((service, idx) => service.concat([idx]))
    .filter((service) => service[1] === "new" || service[1] === "change")
    .map((service) => {
      return (
        <button
          style={{ marginTop: "5px" }}
          className="button is-light is-warning is-small"
          onClick={() => {
            setSelectedService(service[2]);
            setMode("services");
          }}
        >
          {" "}
          {service[0]["service"]} service request &#9888;
        </button>
      );
    });
  return (
    <div style={{ width: "250px" }}>
      <div style={{ margin: "5px" }}>
        <i><u>From {document.referrer} : </u></i><br></br>
        status : {
          SMRs.length === 0 ?
            <i style={{ color: "lightgreen" }}> ready</i> :
            <i style={{ color: "yellow" }}> requests need approval</i>
        }

      </div>
      {SMRs.length === 0 ? (
        ""
      ) : (
        <div style={{ marginLeft: "5px" }}>
          {SMRs}
        </div>
      )}
      {document.referrer === "" ||
        new URL(document.referrer).origin === window.location.origin ? (
        ""
      ) : (
        <div style={{ marginLeft: "5px" }}>
          <div className="field">
            <div className="control">
              <button
                style={{ marginTop: "5px" }}
                onClick={wapiAuth.sendToken}
                className="button is-warning is-small"
                disabled={SMRs.length !== 0}
              >
                Log In
              </button>
            </div>
          </div>
        </div>
      )}
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
      <C l s={"60px"}>
        {/* Plain Pad Logo */}
        <img
          src={props.theme === "dark" ? "key_white.png" : "key_black.png"}
          alt="web10logo"
          style={{ height: "60%" }}
        />
      </C>

      <C l ns mc s={"120px"}>
        <div style={{ fontFamily: "monospace" }}>
          <h3>
            web10
            <br /> auth
          </h3>
        </div>
      </C>
    </R>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
startRectangles(document.getElementById("root"));