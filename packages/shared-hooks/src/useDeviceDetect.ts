import { useEffect, useState } from 'react';
export type DeviceFamily = 'ios' | 'android' | 'windows' | 'macos' | 'unknown';
export function detectDevice(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): DeviceFamily {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macos';
  return 'unknown';
}
export function useDeviceDetect() { const [device, setDevice] = useState<DeviceFamily>('unknown'); useEffect(() => setDevice(detectDevice()), []); return device; }
