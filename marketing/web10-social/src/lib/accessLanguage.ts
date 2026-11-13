// Copy only; matching an error never grants access or triggers an automatic login.
export function needsAppApproval(message: string): boolean {
  return /^No app contract(?:\s|$)/i.test(message);
}

export function needsSignIn(message: string): boolean {
  return /^(?:incorrect token|invalid token|token expired|No token available)/i.test(message);
}

export function requestedPermission(message: string): { service: string; operation: string } | null {
  const match = /^No app contract(?: for .+?)? to (\w+) on (.+)$/i.exec(message);
  return match ? { operation: match[1], service: match[2] } : null;
}

export function accessAction(operation: string): string {
  const actions: Record<string, string> = { create: 'create', readAll: 'view',
    updateOwn: 'edit your own', deleteOwn: 'delete your own',
    updateAll: 'edit all accessible', deleteAll: 'delete all accessible', hideAll: 'hide' };
  return actions[operation] || `use the “${operation}” permission on`;
}

export function friendlyAccessMessage(message: string): string {
  if (needsAppApproval(message)) {
    const request = requestedPermission(message);
    if (request) return `This app needs your approval to ${accessAction(request.operation)} ${request.service}.`;
    return 'This app needs your approval to use this part of your account.';
  }
  if (needsSignIn(message)) return 'Please sign in again to keep using your account.';
  return message;
}
