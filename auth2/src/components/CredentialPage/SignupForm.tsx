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
                                (document.getElementById("provider") as HTMLInputElement).value,
                                (document.getElementById("username") as HTMLInputElement).value,
                                (document.getElementById("password") as HTMLInputElement).value,
                                (document.getElementById("betacode") as HTMLInputElement).value,
                                (document.getElementById("retypepass") as HTMLInputElement).value,
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