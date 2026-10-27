import { useMemo } from 'react';
export type DevicePlatform = 'ios'|'android'|'windows'|'macos';
export function detectDevicePlatform(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): DevicePlatform {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/macintosh|mac os x/.test(ua)) return 'macos';
  if (/windows/.test(ua)) return 'windows';
  return 'android';
}
export function useDeviceDetect(): DevicePlatform { return useMemo(() => detectDevicePlatform(), []); }
