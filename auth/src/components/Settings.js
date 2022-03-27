import React from "react";

function Settings() {
  return (
    <div style={{ marginLeft: "5px" }}>
      <Payment></Payment>
      <EmailVerify></EmailVerify>
      <EmailUnlink></EmailUnlink>
      <ChangeUser></ChangeUser>
      <br></br>
      <ChangePass></ChangePass>
    </div>
  );
}

// Payment component
function Payment() {
  return <div style={{marginTop:"10px"}}>
    <button style={{marginRight:"5px"}} className="button is-small is-primary"> Purchase Credits</button>
    <button className="button is-small is-primary">Credit Plan</button>

  </div>;
}

// Payment component
function EmailUnlink() {
  return <div style={{marginTop:"10px"}}>
    <input           style={{
            color: "gold",
            fontSize: "20px",
            width: "165px",
            marginTop: "2px",
          }}
placeholder={"name@email.com"}></input><button style={{marginRight:"5px"}} className="button is-small is-danger"> Unlink Email</button>
  </div>;
}


// Phone number linking/unlinking component
function EmailVerify() {
  return (
    <div>
      <div style={{ marginTop: "10px" }}>
        <input
          style={{
            color: "gold",
            fontSize: "20px",
            width: "165px",
            marginTop: "2px",
          }}
          placeholder={"name@email.com"}
        ></input>
        <button className="button is-small is-warning">Send Verification Email</button>
      </div>
      <div style={{ marginTop: "10px" }}>
        <span style={{marginLeft:"2px",color:"lightgray",fontSize:"20px"}}>verification code :</span> <input
          style={{
            color: "gold",
            fontSize: "20px",
            width: "90px",
            marginTop: "2px",
            marginLeft: "5px",
          }}
          placeholder={"123-456"}
        ></input>
        <button className="button is-small is-warning">Link Email </button>
      </div>
    </div>
  );
}

// Changing username and/or password component
function ChangeUser() {
  return (
    <div style={{ marginTop: "4px", marginLeft: "4px", marginRight: "4px" }}>
      Change Username : <br></br>
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
function ChangePass() {
  return (
    <div style={{ marginTop: "4px", marginLeft: "4px", marginRight: "4px" }}>
      Change Password : <br></br>
      Type New Password :{" "}
      <input
        id="deleteConfirmation"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"new-password"}
      ></input>
      <br></br>
      Retype New Password :{" "}
      <input
        id="deleteConfirmation"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"new-password"}
      ></input>
      <br></br>
      Type Current Password To Confirm :{" "}
      <input
        id="deleteConfirmation"
        style={{ backgroundColor: "black", color: "lightgreen" }}
        placeholder={"current-password"}
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
        className="button is-small is-info"
        style={{ marginTop: "4px" }}
      >
        Change Password
      </button>
    </div>
  );
}

export { Settings };
