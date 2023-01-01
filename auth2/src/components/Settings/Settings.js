/**********************************************
 * Settings.js
 * Houses the <Settings> component that allows 
 * users to modify their web10 acct. settings. 
 **********************************************/

import React from "react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";

var wapiAuth = window.wapiAuth;

/************************* */
/* Settings Component */
/************************* */
function Settings({I}) {
  return (
    <div style={{ marginLeft: "5px", marginBottom: "10px" }}>
      <Capacity setStatus={setStatus} verified={verified}></Capacity>
      {verified ? (
        <Payment setStatus={setStatus} servicesLoad={servicesLoad}></Payment>
      ) : (
        <Verify setStatus={setStatus} callBack={servicesLoad}></Verify>
      )}
      <br></br>
      <Unlink setStatus={setStatus} callBack={servicesLoad}></Unlink>
      {mode === "services-disabled" ? (
        ""
      ) : (
        <div>
          <br></br>
          <ChangePass
            setStatus={setStatus}
            callBack={servicesLoad}
          ></ChangePass>
          <br></br>
          <DevPay setStatus={setStatus}></DevPay>
        </div>
      )}
    </div>
  );
}

/*************************************** 
 *** payment/plan related components *** 
 ***************************************/ 
function Payment() {
  return (
    <div style={{ marginTop: "5px", marginLeft: "5px" }}>
      <button
        className="button is-primary is-light is-small"
        onClick={() => {
          wapiAuth.manageSpace().then((response) => {
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
          wapiAuth.manageCredits().then((response) => {
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
        onClick={() => {
          wapiAuth.manageSubscriptions().then((response) => {
            window.location.href = response.data;
          });
        }}

>
        {" "}
        Subscriptions
      </button>
    </div>
  );
}

function DevPay() {
  return (
    <div style={{marginLeft:"5px"}}>
      <div style={{marginBottom:"5px"}}><u >web10 devPay</u></div>
      <button
        className="button is-success is-light is-small"
        onClick={() => {
          wapiAuth.manageBusiness().then((response) => {
            window.location.href = response.data;
          });
        }}
      >
        {" "}
        Bank
      </button>
      <button
        style={{ marginLeft: "5px" }}
        className="button is-success is-light is-small"
        onClick={() => {
          wapiAuth.businessLogin().then((response) => {
            window.location.href = response.data;
          });
        }}
      >
        {" "}
        Stats
      </button>
    </div>
  );
}

function Capacity({ verified,setStatus }) {
  const [plan, setPlan] = React.useState(`MB/mo. 0 , Credits/mo. 0`);
  const [util, setUtil] = React.useState(`Storage Utilization : _ / 0 MB`);
  wapiAuth
    .getPlan()
    .then((response) => {
      const data = response.data;
      const [space, credit, used] = [
        parseFloat(data["space"]).toFixed(2),
        parseFloat(data["credits"]).toFixed(2),
        parseFloat(data["used_space"]).toFixed(4),
      ];
      setPlan(`MB/mo. ${space} , Credits/mo. ${credit}`);
      setUtil(`Storage Utilization : ${used}/${space} MB`);
    })
    .catch((e) => verified?setStatus("Failed to get plan info..."):"");
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


/************************************************** 
 *** verification / password related components *** 
 **************************************************/ 
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

function Unlink({ setStatus, callBack }) {
  const [phone, setPhone] = React.useState("");
  return (
    <div style={{ marginLeft: "4px" }}>
      <u>Change Linked Devices / Accounts</u>
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
