import React from "react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";

var wapiAuth = window.wapiAuth;

function Settings({ verified, setStatus, servicesLoad }) {
  return (
    <div style={{ marginLeft: "5px" }}>
      <Capacity setStatus={setStatus}></Capacity>
      {verified ? (
        <Payment setStatus={setStatus} servicesLoad={servicesLoad}></Payment>
      ) : (
        <Verify setStatus={setStatus} callBack={servicesLoad}></Verify>
      )}
      <br></br>
      <Unlink setStatus={setStatus} callBack={servicesLoad}></Unlink>
      <br></br>
      <ChangePass setStatus={setStatus} callBack={servicesLoad}></ChangePass>
    </div>
  );
}

function Unlink({ setStatus, callBack }) {
  const [phone, setPhone] = React.useState("");
  return (
    <div style={{ marginLeft: "4px" }}>
      <u>Linked Devices / Accounts</u>
      <br></br>
      Type Password to confirm :{" "}
      <input
        type="password"
        id="phonechange"
        style={{
          backgroundColor: "black",
          color: "lightgreen",
          marginBottom: "4px",
        }}
        placeholder={"password"}
      ></input>
      <PhoneInput
        country={"us"}
        enableSearch={true}
        inputClass={"input"}
        dropdownStyle={{ color: "black" }}
        value={phone}
        onChange={(val) => {
          setPhone(val);
        }}
      />
      <button
        style={{ marginTop: "4px" }}
        className="button is-warning is-light is-small"
        onClick={() => {
          wapiAuth
            .changePhone(document.getElementById("phonechange").value, phone)
            .then(() => {
              setStatus("Successfully changed phone number. reloading...");
              setTimeout(() => callBack(), 1000);
            })
            .catch((e) => {
              if (e.response) setStatus(String(e.response.data.detail));
              else {
                setStatus(String(e));
              }
            });
        }}
      >
        {" "}
        Change Linked Number
      </button>
    </div>
  );
}

// Payment component
function Payment({ setStatus, servicesLoad }) {
  return (
    <div style={{ marginTop: "5px", marginLeft: "5px" }}>
      <button
        className="button is-primary is-light is-small"
        onClick={() => {
          wapiAuth.manage_space().then((response) => {
            window.location.href = response.data;
          });
        }}
      >
        {" "}
        Space Plan
      </button>
      <button
        style={{ marginLeft: "5px" }}
        className="button is-success is-light is-small"
        onClick={() => {
          wapiAuth.manage_credits().then((response) => {
            window.location.href = response.data;
          });
        }}
      >
        {" "}
        Credit Plan
      </button>
      <button
        style={{ marginLeft: "5px" }}
        className="button is-secondary is-light is-small"
        disabled={true}
      >
        {" "}
        Wires
      </button>
      <button
        style={{ marginLeft: "5px" }}
        className="button is-secondary is-light is-small"
        disabled={true}
      >
        {" "}
        DevPay
      </button>
    </div>
  );
}

function Capacity({ setStatus }) {
  var cap = "x";
  var total = 64;
  const [plan, setPlan] = React.useState(`Plan : Megabytes/mo. .. , Credits/mo. ..`);
  const [util,setUtil] = React.useState(`storage capacity utilization .. / .. MB`)
  wapiAuth
    .getPlan()
    .then((response) => {
      const data = response.data;
      const [space,credit,used] = [parseFloat(data["space"]/1024).toFixed(2),data["credits"],parseFloat(data["used_space"]/1024).toFixed(2)]
      setPlan(`Plan : Megabytes/mo. ${space} , Credits/mo. ${credit}`);
      setUtil(`storage capacity utilization ${used}/${space} MB`)
    })
    .catch((e) => setStatus("Failed to get plan info..."));
  return (
    <div style={{ marginLeft: "3px" }}>
      <input size={plan.length} placeholder={plan} readOnly></input>
      <br></br>
      <p
        style={{
          marginLeft: "2px",
          color: "gray",
          fontFamily: "monospace",
        }}
      >
        {util}
      </p>
    </div>
  );
}

// Payment component
function Verify({ setStatus, callBack }) {
  return (
    <div style={{ marginTop: "10px" }}>
      <p style={{ marginLeft: "2px" }}>
        verification code :{" "}
        <input
          id="code"
          style={{
            color: "lightgreen",
            width: "100px",
            marginTop: "2px",
            backgroundColor: "black",
          }}
          placeholder={"012345"}
        ></input>
      </p>
      <div style={{ marginTop: "5px" }}>
        <button
          style={{ marginRight: "5px" }}
          className="button is-small is-light is-warning"
          onClick={() =>
            wapiAuth
              .sendCode()
              .then(() => setStatus("Sent Code!!!"))
              .catch(() => setStatus("Failed to send code."))
          }
        >
          {" "}
          Send Code{" "}
        </button>
        <button
          onClick={() =>
            wapiAuth
              .verifyCode(document.getElementById("code").value)
              .then(() => {
                setStatus("success! reloading ...");
                setTimeout(() => callBack(), 1000);
              })
              .catch(() => setStatus("wrong code.."))
          }
          style={{ marginRight: "5px" }}
          className="button is-small is-light is-warning"
        >
          {" "}
          Verify Code{" "}
        </button>
        <p style={{ color: "orange", marginLeft: "2px", marginTop: "2px" }}>
          verify your phone number and recieve free web10 credits
        </p>
      </div>
    </div>
  );
}

// Changing username and/or password component
// function ChangeUser() {
//   return (
//     <div style={{ marginLeft: "4px", marginRight: "4px" }}>
//       <u>Change Username</u> <br></br>
//       Type New Username :{" "}
//       <input
//         id="deleteConfirmation"
//         style={{ backgroundColor: "black", color: "lightgreen" }}
//         placeholder={"new-username"}
//       ></input>
//       <br></br>
//       Retype New Username :{" "}
//       <input
//         id="deleteConfirmation"
//         style={{ backgroundColor: "black", color: "lightgreen" }}
//         placeholder={"new-username"}
//       ></input>
//       <br></br>
//       Type Password To Confirm :{" "}
//       <input
//         id="deleteConfirmation"
//         style={{ backgroundColor: "black", color: "lightgreen" }}
//         placeholder={"password"}
//       ></input>
//       <br></br>
//       <button
//         className="button is-small is-danger"
//         style={{ marginTop: "4px" }}
//       >
//         Change Username
//       </button>
//     </div>
//   );
// }

// Changing username and/or password component
function ChangePass({ setStatus, callBack }) {
  return (
    <div style={{ marginTop: "4px", marginLeft: "4px", marginRight: "4px" }}>
      <u>Change Password</u>
      <br></br>
      Type New Password :{" "}
      <input
        type="password"
        id="newpass1"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"new-password"}
      ></input>
      <br></br>
      Retype New Password :{" "}
      <input
        type="password"
        id="newpass2"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"new-password"}
      ></input>
      <br></br>
      Type Current Password To Confirm :{" "}
      <input
        type="password"
        id="regpass"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"current-password"}
      ></input>
      <br></br>
      <button
        onClick={() => {
          const pass = document.getElementById("regpass").value;
          const np1 = document.getElementById("newpass1").value;
          const np2 = document.getElementById("newpass2").value;
          if (np1 === np2)
            wapiAuth
              .changePass(pass, np1)
              .then(() => {
                setStatus("successful password change. reloading...");
                setTimeout(() => callBack(), 1000);
              })
              .catch((e) => setStatus("Failed... : " + e.response.data.detail));
          else setStatus("retype is different.");
        }}
        className="button is-small is-info"
        style={{ marginTop: "4px" }}
      >
        Change Password
      </button>
    </div>
  );
}

export { Settings };
