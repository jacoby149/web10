import { accessAction, friendlyAccessMessage, requestedPermission } from '@/lib/accessLanguage';

export function AccessPermissionMessage({ message }: { message: string }) {
  const request = requestedPermission(message);
  if (!request) return <>{friendlyAccessMessage(message)}</>;
  return <>This app needs your approval to {accessAction(request.operation)}{' '}
    <span className="inline-block max-w-full overflow-x-auto whitespace-nowrap align-middle"><code className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.9em]">{request.service}</code>.</span></>;
}
