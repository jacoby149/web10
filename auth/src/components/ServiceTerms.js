import React from "react";
import flattenJSON from "./flattenJSON.js";

/* Service Change Component */
function ServiceTerms({ services, selectedService, SCRS }) {
  const currentService = services[selectedService][0];
  const flattenedService = flattenJSON(currentService);
  const updates = {...flattenedService};
  const final = Object.keys(flattenedService).map((field, idx) => {
    return (
      <EditableField
        key={[currentService["body"]["service"], idx]}
        type={"input"}
        field={field}
        value={flattenedService[field]}
        updates={updates}
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

function EditableField({ type, field, value, updates }) {
  switch (type) {
    case "input": {
      return (
        <EditableInput field={field} value={value} updates={updates} />
      );
    }
    //TODO add dropdown types and more
  }
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

//TO BE IMPLEMENTED
const EditableInput = ({ field, value, updates }) => {
  console.log(updates);
  const [update, setUpdate] = React.useState(updates[field]);
  return (
    <div style={{ marginLeft: "4px", marginTop: "4px" }}>
      {field} :{" "}
      {value === update ? (
        ""
      ) : (
        <span style={{ color: "firebrick", textDecoration: "line-through" }}>
          {value}
        </span>
      )}
      <input
        style={{ color: "#2ECC40" }}
        size={String(update).length}
        defaultValue={update}
        onChange={function (event) {
          var newUpdate = event.target.value;
          updates[field] = newUpdate;
          setUpdate(newUpdate);
        }}
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
        Approve Service Addition
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

export default ServiceTerms;
