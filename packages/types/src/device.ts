export type DeviceFamily='ios'|'android'|'windows'|'macos'|'unknown';
export interface DeviceResolution { device:DeviceFamily; layout:'mobile-store'|'desktop-portal'|'generic' }
