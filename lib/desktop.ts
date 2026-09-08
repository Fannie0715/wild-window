export interface DesktopCapture {
  captureLivePlayer: () => Promise<{ image: string; width: number; height: number }>;
  openMini: (cameraId: string) => Promise<{ opened: boolean }>;
}
declare global { interface Window { wildWindowDesktop?: DesktopCapture } }
export function desktopBridge() {
  return typeof window === 'undefined' ? undefined : window.wildWindowDesktop;
}
