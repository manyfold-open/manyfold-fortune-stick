/**
 * API paths for whoever deployed the game: the Manyfold connection, and reading
 * the daily counts (GET /api/stats). Recording a count (POST /api/stats/:metric)
 * stays public, like the rest of the game.
 */
export const isSettingsApiPath = (path: string): boolean =>
  path === '/api/stats' ||
  path === '/api/connect' ||
  path.startsWith('/api/connect/') ||
  path === '/api/agents' ||
  path.startsWith('/api/agents/');
