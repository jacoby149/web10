import PhoneInput from "react-phone-input-2";

function Phone({ I, value, onChange }: { I: Record<string, any>, value?: string, onChange?: (val: string) => void }) {
  return (
    <div style={I.config.REACT_APP_VERIFY_REQUIRED ? { margin: "0 10px" } : { display: "none" }}>
      <div style={{ width: "calc(100% - 40px)", float: "left" }}>
        <PhoneInput
          country={"us"}
          enableSearch={true}
          inputClass={"w-full px-3 py-2 rounded-lg border text-base"}
          dropdownStyle={{ color: "black" }}
          preferredCountries={['us', 'il', 'jp']}
          value={value !== undefined ? value : I.phone}
          onChange={(val) => {
            if (onChange) onChange(val);
            else I.setPhone(val);
          }}
        />
      </div>
      <div
        className="inline-flex items-center justify-center ml-2.5 mt-1.5 cursor-help"
        title="web10 uses Twilio to authenticate users"
      >
        <i className="fas fa-lg fa-info-circle" style={{ color: 'var(--color-text-muted)' }}></i>
      </div>
      <br /><br />
    </div>
  );
}

export default Phone;