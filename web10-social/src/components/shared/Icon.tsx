import { C } from 'rectangles-npm';

function Icon({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: string;
}) {
  return (
    <C onClick={onClick} l ns s="30px" va="center">
      <i className={`fa fa-${children}`} />
    </C>
  );
}

function RawIcon({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: string;
}) {
  return (
    <C onClick={onClick} l ns s="30px" va="center">
      <i className={`fa-solid fa-${children}`} />
    </C>
  );
}

export { Icon, RawIcon };
