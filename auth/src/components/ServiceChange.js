import React from "react";
import flattenJSON from "./flattenJSON.js";

/* Service Change Component */
function ServiceChange({ services, selectedService }) {
  const currentService = services[selectedService][0];
  const flattenedService = flattenJSON(currentService);
  const final = Object.keys(flattenedService).map((field, idx) => {
    return (
      <EditableField
        key={[currentService["body"]["service"],idx]}
        type={"input"}
        field={field}
        value={flattenedService[field]}
      ></EditableField>
    );
  });

  return (
    <div>
      <div
        className="box warning"
        style={{ marginTop: "4px", marginLeft: "4px", marginRight: "4px" }}
      >
        {final}
        <br></br>
        <NewField></NewField>
      </div>
      <EditApproval></EditApproval>
    </div>
  );
}

function EditableField({ type,field,value }) {
  switch (type) {
    case "input": {
      return <EditableInput field={field}value={value}/>;
    }
    //TODO add dropdown types and more
  }
}

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

//TO BE IMPLEMENTED
const EditableInput = ({ field, value }) => {
  var [updated, setUpdated] = React.useState(value);
  return (
    <div style={{ marginLeft: "4px", marginTop: "4px" }}>
      {field} :{" "}
      {value === updated ? (
        ""
      ) : (
        <span style={{ color: "firebrick", textDecoration: "line-through" }}>
          {value}
        </span>
      )}
      <input
        style={{ color: "#2ECC40" }}
        size={String(value).length}
        defaultValue={value}
        onChange={(event) => setUpdated(event.target.value)}
      ></input>
    </div>
  );
};

function SCR() {
  //execute the service change req.
  return;
}

function clear() {
  //clear the service change form.
  return;
}

function EditApproval() {
  return (
    <div>
      <button
        onClick={SCR()}
        style={{ margin: "0px 5px" }}
        className="button is-warning"
      >
        Approve Service Changes
      </button>
      <button
        onClick={clear()}
        style={{ margin: "0px 5px" }}
        className="button is-warning"
      >
        Deny Service Changes
      </button>
    </div>
  );
}

export default ServiceChange;
