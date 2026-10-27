export type ReleasePlatform = 'android' | 'ios' | 'windows' | 'macos';
export interface ReleaseRecord {
  id: string; platform: ReleasePlatform; version: string; build_number: number;
  file_name: string; content_type: string; size_bytes: number; sha256: string | null;
  notes: string; is_active: number; created_at: number;
}
export const releaseExtensions: Record<ReleasePlatform, readonly string[]> = {
  android: ['.apk', '.aab'], ios: ['.ipa'], windows: ['.exe', '.msix'], macos: ['.dmg', '.pkg'],
};
