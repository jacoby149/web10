import React from "react";
import { flattenJSON, unFlattenJSON } from "./flattenJSON.js";

var wapi = window.wapi;

/* Service Change Component */
function ServiceTerms({ services, selectedService, SMRHook, SMRIncrement }) {
  const currentService = services[selectedService][0];
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
      {currentService["service"] === "*" ? "" : 
      <div>
        <EditApproval
          flattenedService={flattenedService}
          type={services[selectedService][1]}
          SMRIncrement={SMRIncrement}
        ></EditApproval>
        <div style={{ marginLeft: "5px" }}>
          <Deletor service={currentService["service"]}></Deletor>
        </div>
        <div
          style={{ marginLeft: "5px", marginTop: "10px", marginBottom: "10px" }}
        >
          <Wiper service={currentService["service"]}></Wiper>
        </div>
      </div>
      }
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

function Deletor({ service }) {
  return (
    <div style={{ marginTop: "4px", marginLeft: "4px", marginRight: "4px" }}>
      Delete Service Terms Record : <br></br>
      Type Service Name To Confirm :{" "}
      <input
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={service}
      ></input>
      <br></br>
      <button
        className="button is-small is-danger"
        style={{ marginTop: "4px" }}
      >
        Delete
      </button>
    </div>
  );
}

function Wiper({ service }) {
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
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={service}
      ></input>
      <br></br>
      <button className="button is-small is-black" style={{ marginTop: "4px" }}>
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

function SMR(flattenedService, type, SMRIncrement) {
  //retrieve the updates for the SMR
  const updates = {};
  Object.keys(flattenedService).map(function (key) {
    return (updates[key] = flattenedService[key]["update"]);
  });
  if (type === "new") {
    const obj = unFlattenJSON(updates);
    console.log(obj);
    wapi.create("services", obj).then(SMRIncrement).catch(console.log);
  }
}

function clear() {
  //clear the service change form.
  return;
}

function EditApproval({ flattenedService, type, SMRIncrement }) {
  return (
    <div>
      <button
        onClick={() => SMR(flattenedService, type, SMRIncrement)}
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
      <div>
        <button className="button is-primary" style={{ margin: "5px 5px" }}>
          Export Service
        </button>{" "}
        <button className="button is-info" style={{ margin: "5px 5px" }}>
          {" "}
          Import Service
        </button>
      </div>
    </div>
  );
}

export default ServiceTerms;
