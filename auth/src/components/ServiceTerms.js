import React from "react";
import { flattenJSON, unFlattenJSON } from "./flattenJSON.js";

var wapi = window.wapi;

/* Service Change Component */
function ServiceTerms({ services, selectedServiceHook, SMRHook, servicesLoad, setStatus }) {
  
  //quick check to make sure we dont have a selected service issue
  const [selectedService,setSelectedService]=selectedServiceHook;
  var i = selectedService;
  if (selectedService >= services.length) {i=0;setSelectedService(0);}


  const currentService = services[i][0];
  const type = services[i][1];
  console.log("TYPE", type);
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
      <EditableField
        key={[currentService["service"], field]}
        record={flattenedService[field]}
        field={field}
      ></EditableField>
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
          {currentService["service"]}
        </h1>

        {final}
        <br></br>
        {currentService["service"] === "*" ? "" : <NewField></NewField>}
      </div>
      {currentService["service"] === "*" ? (
        ""
      ) : (
        <div>
          <EditApproval
            flattenedService={flattenedService}
            type={services[selectedService][1]}
            servicesLoad={servicesLoad}
          />
          {type !== null ? (
            ""
          ) : (
            <div>
              <ImportExport service={currentService["service"]} />
              <div style={{ marginLeft: "5px" }}>
                <Deletor service={currentService["service"]} setStatus={setStatus} callback={servicesLoad}></Deletor>
              </div>
              <div
                style={{
                  marginLeft: "5px",
                  marginTop: "10px",
                  marginBottom: "10px",
                }}
              >
                <Wiper service={currentService["service"]} setStatus={setStatus} callback={servicesLoad} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditableField({ record, field }) {
  var type = null;
  if (record["update"].constructor === Object) type = "obj";

  switch (type) {
    case "obj": {
      return <StructInput record={record} field={field} />;
    }
    default: {
      return <EditableInput record={record} field={field} />;
    }
  }
  //TODO add dropdown types and more
}

//allows CRUDstyle creation of fields
function NewField() {
  return (
    <div style={{ marginTop: "4px", marginLeft: "4px", marginRight: "4px" }}>
      Add a field : <br></br>
      flattenedKey :{" "}
      <input
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"examplekey.0.red.1"}
      ></input>
      <br></br>
      value :{" "}
      <input
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"value"}
      ></input>
      <br></br>
      <button
        className="button is-small is-primary"
        style={{ marginTop: "4px" }}
      >
        Add
      </button>
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
                setTimeout(()=>callback(), 1000);
              })
              .catch((e) => {
                setStatus(e.response.data.detail);
              });
          }
          else setStatus("type the name of the service in the delete confirmation box to delete this service")
        }}
        className="button is-small is-danger"
        style={{ marginTop: "4px" }}
      >
        Delete
      </button>
    </div>
  );
}

function Wiper({ service , setStatus, callback}) {
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
                    .delete(service, {})//empty query means, delete everything
                    .then((response) => {
                      setStatus("wipe successful! reloading...");
                      setTimeout(()=>callback(), 1000);
                    })
                    .catch((e) => {
                      setStatus(e.response.data.detail);
                    });
                }
                else setStatus("type the name of the service in the delete confirmation box to delete this service")
              }}
      
      className="button is-small is-black" style={{ marginTop: "4px" }}>
        Wipe
      </button>
    </div>
  );
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

//TO BE IMPLEMENTED
const EditableInput = ({ record, field }) => {
  const [update, setUpdate] = React.useState(record["update"]);
  const value = record["value"];
  return (
    <div style={{ marginLeft: "4px", marginTop: "4px" }}>
      {field} :{" "}
      <span style={{ color: "firebrick", textDecoration: "line-through" }}>
        {value === update ? "" : value}
      </span>
      <input
        style={{ color: "#2ECC40" }}
        size={String(update).length}
        defaultValue={update}
        onChange={function (event) {
          var newUpdate = event.target.value;
          record["update"] = newUpdate;
          setUpdate(newUpdate);
        }}
      ></input>
    </div>
  );
};

function SMR(flattenedService, type, servicesLoad) {
  //retrieve the updates for the SMR
  const updates = {};
  Object.keys(flattenedService).map(function (key) {
    return (updates[key] = flattenedService[key]["update"]);
  });
  if (type === "new") {
    const obj = unFlattenJSON(updates);
    console.log(obj);
    wapi.create("services", obj).then(servicesLoad).catch(console.log);
  }
}

function clear() {
  //clear the service change form.
  return;
}

function EditApproval({ flattenedService, type, servicesLoad }) {
  return (
    <div>
      <button
        onClick={() => SMR(flattenedService, type, servicesLoad)}
        style={{ margin: "5px 5px" }}
        className="button is-warning"
      >
        Approve{" "}
        {type === "new"
          ? "Service Addition"
          : type === "change"
          ? "Service Change"
          : "Your Changes"}
      </button>
      <button
        onClick={clear()}
        style={{ margin: "5px 5px" }}
        className="button is-warning"
      >
        Deny Service Changes
      </button>
    </div>
  );
}

function ImportExport() {
  return (
    <div>
      <button className="button is-primary" style={{ margin: "5px 5px" }}>
        {" "}
        Import Service
      </button>
      <button
        id={"exporter"}
        className="button is-info"
        style={{ margin: "5px 5px" }}
        onClick={() => {
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

export default ServiceTerms;
