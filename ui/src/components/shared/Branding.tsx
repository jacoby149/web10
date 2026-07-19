interface BrandingProps {
  I: Record<string, any>;
}

function Branding({ I }: BrandingProps) {
  return (
    <div className="flex items-center gap-2">
      {I.logo && <img className="h-9 w-9 object-contain" src={I.logo} alt="" />}
      <h3 className="font-display text-base font-medium text-foreground">
        {I.config.REACT_APP_BRAND_TEXT}
      </h3>
    </div>
  );
}

export default Branding;