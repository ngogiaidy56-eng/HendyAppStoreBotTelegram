export interface FeatureFlagRecord { flag_key: string; description: string; enabled: 0 | 1; rollout_percent: number; updated_by: string | null; updated_at: number }
export interface PublicFeatureFlag { key: string; description: string; enabled: boolean }
