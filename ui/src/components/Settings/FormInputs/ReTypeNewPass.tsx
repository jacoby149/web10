function ReTypeNewPass({ I, value, onChange }: { I: Record<string, any>, value?: string, onChange?: (val: string) => void }) {
  return (
    <div className="mb-2">
      <div className="relative">
        <input
          id="retypepass"
          className="w-full pl-9 pr-3 py-2 rounded-lg border text-base"
          style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
          type="password"
          placeholder="Retype New Password"
          value={value || ""}
          onChange={(e) => onChange?.(e.target.value)}
        />
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <i className="fas fa-lock"></i>
        </span>
      </div>
    </div>
  );
}

export default ReTypeNewPass;