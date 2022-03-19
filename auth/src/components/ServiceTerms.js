import React from "react";
import { flattenJSON, unFlattenJSON } from "./flattenJSON.js";

/* Service Change Component */
function ServiceTerms({ services, selectedService, SCRS }) {
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
        key={[currentService["body"]["service"], field]}
        record={flattenedService[field]}
        field={field}
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
      <EditApproval type={services[selectedService][1]}></EditApproval>
    </div>
  );
}

function EditableField({ record,field }) {
  var type=null;
  if(record["update"].constructor === Object) type="obj";
  
  switch (type) {
    case "obj": {
      return <StructInput record ={record} field={field} />;
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

const StructInput = ({record,field}) => {
  const [type,size] = [record["update"]["type"],record["update"]["size"]];
  return (
    <div style={{ marginLeft: "4px", marginTop: "4px",}}>
      {field} :{" "}
      <i style={{color:"blue"}}>{
        type==="list"?`[${size}]↴`:`{${size}}↴`
      }</i>
    </div>
  )
}

//TO BE IMPLEMENTED
const EditableInput = ({ record,field}) => {
  const [update, setUpdate] = React.useState(record["update"]);
  const value = record["value"];
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
          record["update"] = newUpdate;
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

  //execute the service initialization req.
  return;
}

function userSMR() {
  //execute the service modification req.
  return;
}


function clear() {
  //clear the service change form.
  return;
}

function EditApproval({type}) {
  return (
    <div>
      <button
        onClick={type==="new"?SIR():"change"?SCR():userSMR()}
        style={{ margin: "0px 5px" }}
        className="button is-warning"
      >
        Approve {type==="new"?"Service Addition":type==="change"?"Service Change":"Your Changes"}
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
