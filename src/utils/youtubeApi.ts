export interface YtControlsPlayer {
  playVideo?: () => void;
  pauseVideo?: () => void;
  mute?: () => void;
  unMute?: () => void;
  isMuted?: () => boolean;
  setVolume?: (v: number) => void;
  getVolume?: () => number;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  setPlaybackRate?: (rate: number) => void;
  getIframe?: () => HTMLIFrameElement;
  destroy?: () => void;
}

export interface YTGlobalShape {
  Player: new (
    el: HTMLElement | string,
    opts?: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (ev?: { target?: YtControlsPlayer }) => void;
        onStateChange?: (ev: { data: number }) => void;
        onError?: (ev: { data: number }) => void;
      };
    }
  ) => YtControlsPlayer;
}

let apiPromise: Promise<YTGlobalShape> | null = null;

export function getYtOrigin(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const orig = window.location?.origin;
  return orig && /^https?:\/\//i.test(orig) ? orig : undefined;
}

export function loadYouTubeIframeApi(timeoutMs = 5000): Promise<YTGlobalShape> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('YouTube IFrame API requires a browser environment.'));
  }

  const win = window as unknown as {
    YT?: YTGlobalShape;
    onYouTubeIframeAPIReady?: () => void;
  };

  if (win.YT?.Player) {
    return Promise.resolve(win.YT);
  }

  if (apiPromise) {
    return apiPromise;
  }

  apiPromise = new Promise<YTGlobalShape>((resolve, reject) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      if (win.YT?.Player) {
        settled = true;
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        resolve(win.YT);
      }
    };

    const prevCallback = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      try {
        prevCallback?.();
      } catch {
        // ignore previous ready callback error
      }
      finish();
    };

    if (
      !document.querySelector(
        'script[src*="youtube.com/iframe_api"],script[data-yt-api="1"]'
      )
    ) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.dataset.ytApi = '1';
      document.head.appendChild(tag);
    }

    const pollTimer = setInterval(finish, 100);
    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      apiPromise = null;
      reject(new Error('YouTube IFrame API timed out.'));
    }, timeoutMs);
  });

  return apiPromise;
}
