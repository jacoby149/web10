import React from "react";

function Settings() {
  return (
    <div style={{ marginLeft: "5px" }}>
      {/* <Payment></Payment> */}
      <EmailVerify></EmailVerify>
      <ChangeUser></ChangeUser>
      <br></br>
      <ChangePass></ChangePass>
    </div>
  );
}

// Payment component
function Payment() {
  return <div style={{marginTop:"10px"}}>
    <button style={{marginRight:"5px"}} className="button  is-primary"> Purchase Credits</button>
    <button className="button is-primary">Credit Plan</button>

  </div>;
}

// Payment component
function EmailVerify() {
  return <div style={{marginTop:"10px"}}>
    <p style={{marginLeft:"2px"}}>verification code : <input           style={{
            color: "lightgreen",
            width: "100px",
            marginTop: "2px",
            backgroundColor:"black"
          }}
placeholder={"012-345"}></input></p> 
<div style={{marginTop:"5px"}}><button style={{marginRight:"5px"}} className="button is-warning"> Send Code </button><button style={{marginRight:"5px"}} className="button is-warning"> Verify Code </button><p style={{color:"orange",marginLeft:"2px",marginTop:"2px"}}>verify your email and recieve free web10 credits</p>
</div>
  </div>;
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
function ChangePass() {
  return (
    <div style={{ marginTop: "4px", marginLeft: "4px", marginRight: "4px" }}>
      <u>Change Password</u><br></br>
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
