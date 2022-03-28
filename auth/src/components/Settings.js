import React from "react";

var wapiAuth = window.wapiAuth;

function Settings({ verified, setStatus }) {
  console.log(verified)
  return (
    <div style={{ marginLeft: "5px" }}>
      <Capacity></Capacity>
      {/* {verified ? <Payment></Payment> : <EmailVerify setStatus={setStatus}></EmailVerify>} */}
      {/* <ChangeUser></ChangeUser> */}
      <br></br>
      <ChangePass setStatus={setStatus}></ChangePass>
    </div>
  );
}

function Capacity() {
  var cap = "X";
  return (
    <div>
      <input
        style={{ width: "230px" }}
        placeholder={`storage capacity used : ${cap} MB`}
        readOnly
      ></input>
    </div>
  );
}

// Payment component
function Payment() {
  return (
    <div style={{ marginTop: "10px" }}>
      <button style={{ marginRight: "5px" }} className="button  is-primary">
        {" "}
        Purchase Credits
      </button>
      <button className="button is-primary">Credit Plan</button>
    </div>
  );
}

// Payment component
function EmailVerify({setStatus}) {
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
          className="button is-warning"
          onClick={() => wapiAuth.sendCode()}
        >
          {" "}
          Send Code{" "}
        </button>
        <button
          onClick={() =>
            wapiAuth.verifyCode(document.getElementById("code").value).then(setStatus("success")).catch(setStatus("wrong code.."))
          }
          style={{ marginRight: "5px" }}
          className="button is-warning"
        >
          {" "}
          Verify Code{" "}
        </button>
        <p style={{ color: "orange", marginLeft: "2px", marginTop: "2px" }}>
          verify your email and recieve free web10 credits
        </p>
      </div>
    </div>
  );
}

// Changing username and/or password component
function ChangeUser() {
  return (
    <div style={{ marginTop: "10px", marginLeft: "4px", marginRight: "4px" }}>
      <u>Change Username</u> <br></br>
      Type New Username :{" "}
      <input
        id="deleteConfirmation"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"new-username"}
      ></input>
      <br></br>
      Retype New Username :{" "}
      <input
        id="deleteConfirmation"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"new-username"}
      ></input>
      <br></br>
      Type Password To Confirm :{" "}
      <input
        id="deleteConfirmation"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"password"}
      ></input>
      <br></br>
      <button
        // onClick={() => {
        //   if (document.getElementById("deleteConfirmation").value === service) {
        //     wapi
        //       .delete("services", { service: service })
        //       .then((response) => {
        //         setStatus("service deletion successful! reloading...");
        //         setTimeout(() => callback(), 1000);
        //       })
        //       .catch((e) => {
        //         setStatus(e.response.data.detail);
        //       });
        //   } else
        //     setStatus(
        //       "type the name of the service in the delete confirmation box to delete this service"
        //     );
        // }}
        className="button is-small is-danger"
        style={{ marginTop: "4px" }}
      >
        Change Username
      </button>
    </div>
  );
}

// Changing username and/or password component
function ChangePass({setStatus}) {
  return (
    <div style={{ marginTop: "4px", marginLeft: "4px", marginRight: "4px" }}>
      <u>Change Password</u>
      <br></br>
      Type New Password :{" "}
      <input
        id="newpass1"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"new-password"}
      ></input>
      <br></br>
      Retype New Password :{" "}
      <input
        id="newpass2"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"new-password"}
      ></input>
      <br></br>
      Type Current Password To Confirm :{" "}
      <input
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
          if (np1 == np2) wapiAuth.changePass(pass, np1).then(setStatus("successful password change"));
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
