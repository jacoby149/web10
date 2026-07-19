interface IconProps {
  children: string;
  onClick?: () => void;
  className?: string;
}

function Icon({ children, onClick, className = "" }: IconProps) {
  const iconClass = `fa-${children}`;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${className}`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <i className={`fa ${iconClass} fa-2x font-weight-bold`} style={{ color: 'var(--color-text-secondary)' }}></i>
    </button>
  );
}

function RawIcon({ children, onClick, className = "" }: IconProps) {
  const iconClass = `fa-${children}`;
  return (
    <div onClick={onClick} className={`inline-flex items-center justify-center w-[25px] h-[25px] m-1.5 ${className}`}>
      <i className={`fa ${iconClass} fa-2x font-weight-bold`}></i>
    </div>
  );
}

export { Icon, RawIcon };