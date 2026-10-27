import { detectDevice } from './device-detect';
export function resolveLayout(request: Request): { device: ReturnType<typeof detectDevice>; layout: 'mobile-store'|'desktop-portal'|'generic' } {
  const device = detectDevice(request.headers.get('user-agent') || '');
  return { device, layout: device === 'ios' || device === 'android' ? 'mobile-store' : device === 'windows' || device === 'macos' ? 'desktop-portal' : 'generic' };
}
