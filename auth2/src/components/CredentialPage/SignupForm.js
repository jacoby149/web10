import "react-phone-input-2/lib/bootstrap.css";
import Provider from "./FormInputs/Provider";
import Username from "./FormInputs/Username";
import Password from "./FormInputs/Password";
import ReTypePass from "./FormInputs/ReTypePass";
import Phone from "./FormInputs/Phone";
import BetaCode from "./FormInputs/BetaCode";

function SignupForm({ I }) {
    return (

        <div className="center-container credential-form">
            <Provider I={I} />
            <Username I={I} />
            <Password I={I} />
            <div>
                <ReTypePass I={I}></ReTypePass>
                <Phone I={I}></Phone>
                <BetaCode I={I}></BetaCode>

            </div>

            <div className="field">
                <div className="control">
                    <button
                        onClick={() => {
                            I.setMode("appstore")
                            const [provider, username, password, betacode, retype] = [
                                document.getElementById("provider").value,
                                document.getElementById("username").value,
                                document.getElementById("password").value,
                                document.getElementById("betacode").value,
                                document.getElementById("retypepass").value,
                            ];
                            I.signup(provider, username, password, retype, betacode)
                        }}
                        style={{ margin: "0px 10px" }}
                        className="button is-primary"
                    >
                        Signup
                    </button>
                    <div style={{ margin: "20px" }}><a onClick={()=>I.setMode("login")}><u>Already have an account?</u></a></div>
                </div>
            </div>
        </div>
    );

}

export default SignupForm;