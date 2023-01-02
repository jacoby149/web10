import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";
import Password from "./FormInputs/Password";
import Provider from "./FormInputs/Provider";
import Username from "./FormInputs/Username";

function LoginForm({ I }) {
    return (
        <div className="center-container credential-form">
            <Provider I={I} />
            <Username I={I} />
            <Password I={I} />
            <div className="field">
                <div className="control">
                    <div>
                        <button
                            onClick={() => {
                                I.login(
                                    document.getElementById("provider").value,
                                    document.getElementById("username").value,
                                    document.getElementById("password").value,
                                );
                            }}
                            style={{ margin: "0px 10px" }}
                            className="button is-success"
                        >
                            Login
                        </button>
                        <div style={{ margin: "20px" }}><a onClick={()=>I.setMode("forgot")}><u>Forgot Username or Password?</u></a></div>

                        <button
                            onClick={() => I.setMode("signup")}
                            style={{ margin: "10px 10px" }}
                            className="button is-warning">
                            Create A New Account
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

}

export default LoginForm;