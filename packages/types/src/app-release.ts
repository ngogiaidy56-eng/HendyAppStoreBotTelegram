export type AppPlatform='android'|'ios'|'windows'|'macos';
export interface AppRelease { id:string; platform:AppPlatform; version:string; build_number:number; file_name:string; size_bytes:number; sha256?:string|null; notes:string; is_active:boolean|number; created_at:number }
