/** Shared public contracts used by administration forms and deployment tooling. */
export interface GitHubWorkflowDispatch { workflow: string; ref: 'main' }
export interface GitHubSecretSyncResult { synced: string[]; count: number }
