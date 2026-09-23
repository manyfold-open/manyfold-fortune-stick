/** API paths that manage the deployment's Manyfold connection. */
export const isSettingsApiPath = (path: string): boolean =>
  path === '/api/connect' ||
  path.startsWith('/api/connect/') ||
  path === '/api/agents' ||
  path.startsWith('/api/agents/');
