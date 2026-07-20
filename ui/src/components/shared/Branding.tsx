interface BrandingProps {
  I: Record<string, any>;
}

function Branding({ I }: BrandingProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3">
        {I.logo && (
          <img
            className="h-12 w-12 object-contain"
            src={I.logo}
            alt="web10"
            data-testid="brand-logo"
          />
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          web10
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Own your data. Own your audience.
      </p>
    </div>
  );
}

export default Branding;