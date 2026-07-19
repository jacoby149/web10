function BetaCode({ I }: { I: Record<string, any> }) {
  return (
    <div style={I.config.REACT_APP_BETA_REQUIRED ? {} : { display: "none" }} className="mb-2">
      <div className="relative">
        <input
          id="betacode"
          className="w-full pl-9 pr-3 py-2 rounded-lg border text-base"
          style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
          type="password"
          placeholder="Beta Code"
        />
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <i className="fas fa-key"></i>
        </span>
      </div>
    </div>
  );
}

export default BetaCode;