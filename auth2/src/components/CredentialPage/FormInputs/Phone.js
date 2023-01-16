import PhoneInput from "react-phone-input-2";

function Phone({ I }) {
    return (
        <div style={I.config.REACT_APP_VERIFY_REQUIRED ? { margin: "0 10px" } : { display: "None" }}>
            <div style={{ width: "calc(100% - 40px)", float: "left" }}>
                <PhoneInput
                    country={"us"}
                    enableSearch={true}
                    inputClass={"input"}
                    dropdownStyle={{ color: "black" }}
                    preferredCountries={['us', 'il', 'jp']}
                    value={I.phone}
                    onChange={(val) => {
                        I.setPhone(val);
                    }}
                />
            </div>
            <div className="icon" title="web10 uses Twilio to authenticate users" style={{ marginLeft: "10px", marginTop: "6px" }}>
                <i className="fas fa-lg fa-info-circle"></i>
            </div>
            <br></br><br></br>
        </div>
    )
}

export default Phone;
