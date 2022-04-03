import React from "react";
import { flattenJSON, unFlattenJSON } from "./flattenJSON.js";
import { downloadObjJSON } from "./importExportJSON.js";
import { Settings } from "./Settings.js";
var wapi = window.wapi;

/************************* */
/* Service Terms Component */
/************************* */
function ServiceTerms({
  services,
  selectedServiceHook,
  SMRHook,
  servicesLoad,
  setStatus,
}) {
  //dictionary of field value pairs to add to the service.
  const [additions, setAdditions] = React.useState({});
  //quick check to make sure we dont have a selected service issue
  const [_selectedService, setSelectedService] = selectedServiceHook;
  var selectedService = _selectedService;
  if (selectedService >= services.length) {
    selectedService = 0;
    setSelectedService(0);
  }

  React.useEffect(() => {setAdditions({});}, [services]);

  const currentService = services[selectedService][0];
  const type = services[selectedService][1];
  const flattenedService = flattenJSON(currentService);
  //store updates adjacently
  Object.keys(flattenedService).map(function (key, index) {
    return (flattenedService[key] = {
      value: flattenedService[key],
      update: flattenedService[key],
    });
  });
  const final = Object.keys(flattenedService).map((field, idx) => {
    return (
      <Field
        key={[currentService["service"], field]}
        record={flattenedService[field]}
        field={field}
        isStar={currentService["service"] === "*"}
      ></Field>
    );
  });
  return (
    <div>
      <div
        className="box warning"
        style={{
          marginTop: "4px",
          marginLeft: "4px",
          marginRight: "4px",
          marginBottom: "4px",
        }}
      >
        <h1
          style={{
            fontFamily: "courier new",
            fontSize: "16px",
            marginLeft: "15px",
            color: "orange",
          }}
        >
          {currentService["service"] === "*"?<p style={{color:"hotpink"}}>web 10 settings</p>:currentService["service"]}
        </h1>

        {final}
        <br></br>
        <ToAdd additionsHook={[additions, setAdditions]}></ToAdd>
        {currentService["service"] === "*" ? (
          ""
        ) : (
          <NewField additionsHook={[additions, setAdditions]}></NewField>
        )}
      </div>
      {currentService["service"] === "*" ? (
        <Settings
          verified={flattenedService["verified"]["value"]}
          setStatus={setStatus}
          servicesLoad={servicesLoad}
        ></Settings>
      ) : (
        <div>
          <EditApproval
            flattenedService={flattenedService}
            additions={additions}
            type={services[selectedService][1]}
            servicesLoad={servicesLoad}
            SMRHook={SMRHook}
            setStatus={setStatus}
          />
          {type !== null ? (
            ""
          ) : (
            <div>
              <ImportExport service={currentService["service"]} />
              <div style={{ marginLeft: "5px" }}>
                <Deletor
                  service={currentService["service"]}
                  setStatus={setStatus}
                  callback={servicesLoad}
                ></Deletor>
              </div>
              <div
                style={{
                  marginLeft: "5px",
                  marginTop: "10px",
                  marginBottom: "10px",
                }}
              >
                <Wiper
                  service={currentService["service"]}
                  setStatus={setStatus}
                  callback={servicesLoad}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/***********************
 * Helper Components
 ***********************/

function Field({ record, field,isStar }) {
  var type = null;
  if (record["update"].constructor === Object) {
    if (record["update"]["type"] === "delete") type = "delete";
    else type = "obj";
  }
  
  if (isStar) {
    return <UneditableInput record={record} field={field}></UneditableInput>
  }

  switch (type) {
    case "obj": {
      return <StructInput record={record} field={field} />;
    }
    default: {
      //if type ==null or delete
      return <EditableInput record={record} field={field} />;
    }
  }
  //TODO add dropdown types and more
}

const StructInput = ({ record, field }) => {
  const [type, size] = [record["update"]["type"], record["update"]["size"]];
  return (
    <div style={{ marginLeft: "4px", marginTop: "4px" }}>
      {field} :{" "}
      <i style={{ color: "blue" }}>
        {type === "list" ? `[${size}]↴` : `{${size}}↴`}
      </i>
    </div>
  );
};

const UneditableInput = ({record,field})=>{
    const update=record["update"];
    return (
      <div style={{ marginLeft: "4px", marginTop: "4px" }}>
        {field} :{" "}
        <input
          style={{ color: "#2ECC40" }}
          size={String(update).length}
          value={update}
          readOnly
        ></input>      
        </div>
    );
}

//TO BE IMPLEMENTED
const EditableInput = ({ record, field }) => {
  //hide the id field
  if (field === "_id") return <div></div>;
  const [update, setUpdate] = React.useState(record["update"]);
  React.useEffect(()=>setUpdate(record["update"]), [record])
  const value = record["value"];
  function setRecord(v) {
    record["update"] = v;
    setUpdate(v);
  }
  function undo() {
    return (
      <i
        style={{ color: "blue" }}
        className="fas fa-undo"
        onClick={() => setRecord(value)}
      ></i>
    );
  }
  function deleteMode() {
    return (
      <div style={{ marginLeft: "4px", marginTop: "4px", color: "red" }}>
        {field} &nbsp; {undo()}
      </div>
    );
  }
  function updateMode() {
    return (
      <div style={{ marginLeft: "4px", marginTop: "4px" }}>
        {field} :{" "}
        <span style={{ color: "firebrick", textDecoration: "line-through" }}>
          {value === update ? "" : value}
        </span>
        <input
          style={{ color: "#2ECC40" }}
          size={String(update).length}
          value={update}
          onChange={(event) => setRecord(event.target.value)}
        ></input>{" "}
        {value === update ? (
          <i
            style={{ color: "firebrick" }}
            className="fa fa-trash"
            onClick={() => setRecord({ type: "delete" })}
          ></i>
        ) : (
          undo()
        )}
      </div>
    );
  }
  if (record["update"].constructor === Object) {
    return deleteMode();
  }
  return updateMode();
};

function submitSMR(flattenedService, additions, type, servicesLoad, setStatus) {
  console.log(type);
  if (type === "new")
    submitSIR(flattenedService, additions, servicesLoad, setStatus);
  if (type === null)
    submitUserSCR(flattenedService, additions, servicesLoad, setStatus);
  if (type === "change") return; //TODO handle SCR
}

function submitUserSCR(flattenedService, additions, servicesLoad, setStatus) {
  console.log("in");
  const SCR = { $unset: {}, $set: {}};

  // Update and Delete
  Object.keys(flattenedService).map(function (key) {
    //makes sure deletions arent passed in
    if (key === "_id") return;
    const update = flattenedService[key]["update"];
    if (update.constructor === Object) {
      if (update["type"] === "delete") return (SCR["$unset"][key] = "");
    } else return (SCR["$set"][key] = update);
  });

  // Create
  Object.keys(additions).map(function (key) {
    if (key === "_id") return;
    return (SCR["$set"][key] = additions[key]);
  });

  const q = { service: flattenedService["service"]["value"] };
  wapi
    .update("services", q, SCR)
    .then(servicesLoad)
    .catch((e) => setStatus(e.response.data.detail));
}

function submitSIR(flattenedService, additions, servicesLoad, setStatus) {
  const updates = {};
  Object.keys(flattenedService).map(function (key) {
    //makes sure deletions arent passed in
    const update = flattenedService[key]["update"];
    if (update.constructor === Object) {
      if (update["type"] === "delete") return;
    }
    return (updates[key] = update);
  });

  // User Created
  Object.keys(additions).map(function (key) {
    if (key === "_id") return;
    return (updates[key] = additions[key]);
  });

  const obj = unFlattenJSON(updates);
  console.log(additions);
  console.log(obj);
  wapi
    .create("services", obj)
    .then(servicesLoad)
    .catch((e) => setStatus(e.response.data.detail));
}

function purgeSMR(type, SMRHook, service) {
  const [SMR, setSMR] = SMRHook;
  if (type === null) {
    return;
  } else if (type === "new" || type === "change") {
    setSMR({
      //TODO clear the bad SCRs
      scrs: [...SMR["scrs"]],
      sirs: [...SMR["sirs"]].filter((sir) => sir["service"] !== service),
    });
  } else {
    console.error("unspecified behavior clearing SMR");
  }
  //clear the service change form.
  return;
}

//allows CRUDstyle creation of fields
function NewField({ additionsHook }) {
  const [additions, setAdditions] = additionsHook;
  return (
    <div style={{ marginTop: "4px", marginLeft: "4px", marginRight: "4px" }}>
      Add a field : <br></br>
      flattenedKey :{" "}
      <input
        id="adder-key"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"examplekey.0.red.1"}
      ></input>
      <br></br>
      value :{" "}
      <input
        id="adder-value"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"value"}
      ></input>
      <br></br>
      <button
        onClick={() => {
          const updated = { ...additions };
          updated[document.getElementById("adder-key").value] =
            document.getElementById("adder-value").value;
          setAdditions(updated);
        }}
        className="button is-small is-primary"
        style={{ marginTop: "4px" }}
      >
        Add
      </button>
    </div>
  );
}

function EditApproval({
  flattenedService,
  additions,
  type,
  servicesLoad,
  SMRHook,
  setStatus,
}) {
  return (
    <div>
      <button
        onClick={() =>
          submitSMR(flattenedService, additions, type, servicesLoad, setStatus)
        }
        style={{ margin: "5px 5px" }}
        className="button is-warning "
      >
        Approve{" "}
        {type === "new"
          ? "Service Addition"
          : type === "change"
          ? "Service Change"
          : "Your Changes"}
      </button>
      <button
        onClick={() => purgeSMR(type, SMRHook, flattenedService["service"])}
        style={{ margin: "5px 5px" }}
        className="button is-warning "
      >
        Deny{" "}
        {type === "new"
          ? "Service Addition"
          : type === "change"
          ? "Service Change"
          : "Your Changes"}
      </button>
    </div>
  );
}

function ImportExport({ service }) {
  return (
    <div>
      <button
        title="Import coming soon"
        className="button is-primary  is-small"
        style={{ margin: "5px 5px" }}
        disabled
      >
        {" "}
        Import Service
      </button>
      <button
        id={"exporter"}
        className="button is-info  is-small"
        style={{ margin: "5px 5px" }}
        onClick={() => {
          wapi
            .read(service, {})
            .then((response) =>
              downloadObjJSON(response.data, `${service}Data`)
            );
          wapi
            .read("services", { service: service })
            .then((response) =>
              downloadObjJSON(response.data, `${service}Terms`)
            );
          //export js files with
          //downloadObjectAsJson
          return;
        }}
      >
        Export Service
      </button>{" "}
    </div>
  );
}

function ToAdd({ additionsHook }) {
  const [additions, setAdditions] = additionsHook;
  function loadAdditions() {
    return Object.keys(additions).map((field, idx) => {
      return (
        <p key={["addy", idx]} style={{ color: "#2ECC40" }}>
          <i style={{ color: "black" }}>{field}</i> : {additions[field]} &nbsp;{" "}
          <i
            onClick={() => {
              const updated = { ...additions };
              delete updated[field];
              setAdditions(updated);
            }}
            style={{ color: "firebrick" }}
            className="fa fa-trash"
          ></i>
        </p>
      );
    });
  }
  var disp = loadAdditions();
  React.useEffect(() => {
    disp = loadAdditions();
  }, [additions]);

  return Object.keys(additions).length === 0 ? (
    ""
  ) : (
    <div style={{ marginLeft: "5px" }}>
      <u>will be added :</u> <br></br>
      {disp}
    </div>
  );
}

function Deletor({ service, setStatus, callback }) {
  return (
    <div style={{ marginTop: "4px", marginLeft: "4px", marginRight: "4px" }}>
      Delete Service Terms Record : <br></br>
      Type Service Name To Confirm :{" "}
      <input
        id="deleteConfirmation"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={service}
      ></input>
      <br></br>
      <button
        onClick={() => {
          if (document.getElementById("deleteConfirmation").value === service) {
            wapi
              .delete("services", { service: service })
              .then((response) => {
                setStatus("service deletion successful! reloading...");
                setTimeout(() => callback(), 1000);
              })
              .catch((e) => {
                setStatus(e.response.data.detail);
              });
          } else
            setStatus(
              "type the name of the service in the delete confirmation box to delete this service"
            );
        }}
        className="button is-small is-danger"
        style={{ marginTop: "4px" }}
      >
        Delete
      </button>
    </div>
  );
}

function Wiper({ service, setStatus, callback }) {
  return (
    <div
      style={{
        marginTop: "4px",
        marginLeft: "4px",
        marginRight: "4px",
        color: "crimson",
      }}
    >
      Wipe All Service Data : <br></br>
      Type Service Name To Confirm :{" "}
      <input
        id="wipeConfirmation"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={service}
      ></input>
      <br></br>
      <button
        onClick={() => {
          if (document.getElementById("wipeConfirmation").value === service) {
            wapi
              .delete(service, {}) //empty query means, delete everything
              .then((response) => {
                setStatus("wipe successful! reloading...");
                setTimeout(() => callback(), 1000);
              })
              .catch((e) => {
                setStatus(e.response.data.detail);
              });
          } else
            setStatus(
              "type the name of the service in the delete confirmation box to delete this service"
            );
        }}
        className="button is-small is-black"
        style={{ marginTop: "4px" }}
      >
        Wipe
      </button>
    </div>
  );
}

export default ServiceTerms;
