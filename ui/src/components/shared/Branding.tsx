interface BrandingProps {
  I: Record<string, any>;
}

function Branding({ I }: BrandingProps) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-[5px]" />
      <div className="flex items-center gap-2 w-[100px]">
        <img style={{ width: "40px" }} src={I.logo} alt="logo" />
        <h3 className="m-0 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
          {I.config.REACT_APP_BRAND_TEXT}
        </h3>
      </div>
      <div className="w-[5px]" />
    </div>
  );
}

export default Branding;