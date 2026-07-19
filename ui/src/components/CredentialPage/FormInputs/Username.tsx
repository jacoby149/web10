function Username({ I }: { I: Record<string, any> }) {
  return (
    <div className="mb-2">
      <div className="relative">
        <input
          id="username"
          className="w-full pl-9 pr-3 py-2 rounded-lg border text-base"
          style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
          placeholder="Username"
        />
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <i className="fas fa-user"></i>
        </span>
      </div>
    </div>
  );
}

export default Username;