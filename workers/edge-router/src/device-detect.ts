export type DeviceFamily = 'ios'|'android'|'windows'|'macos'|'unknown';
export function detectDevice(ua: string): DeviceFamily {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  return 'unknown';
}
