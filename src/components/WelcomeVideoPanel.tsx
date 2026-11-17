import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Maximize2,
  Minimize2,
  Pause,
  Pencil,
  Play,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { WelcomeShowcase } from '../types/lms';
import { normalizeVideoUrl, youtubeId } from '../utils/lms';
import {
  getYtOrigin,
  loadYouTubeIframeApi,
  type YtControlsPlayer,
} from '../utils/youtubeApi';

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function WelcomeVideoPanel({
  showcase,
  isAdmin,
  onEdit,
}: {
  showcase: WelcomeShowcase;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  const [compact, setCompact] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(80);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [photoError, setPhotoError] = useState(false);
  const [ytFallbackMode, setYtFallbackMode] = useState(false);
  const [playerError, setPlayerError] = useState('');

  const stageRef = useRef<HTMLDivElement | null>(null);
  const ytMountRef = useRef<HTMLDivElement | null>(null);
  const fallbackIframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytRef = useRef<YtControlsPlayer | null>(null);
  const initialVolumeRef = useRef(80);
  const mutedRef = useRef(true);

  const normalizedUrl = showcase.videoUrl
    ? normalizeVideoUrl(showcase.videoUrl)
    : '';
  const ytId = normalizedUrl ? youtubeId(normalizedUrl) : '';
  const hasVideo = Boolean(normalizedUrl);
  const photoSrc =
    showcase.photoUrl ||
    '/assets/aistudio/IMG_20251110_092655_764_2c1ee29a.webp';

  useEffect(() => {
    setPhotoError(false);
  }, [photoSrc]);

  useEffect(() => {
    initialVolumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    if (!hasVideo) return;
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    setMuted(true);
    mutedRef.current = true;
    setYtFallbackMode(false);
    setPlayerError('');

    let destroyed = false;
    ytRef.current = null;

    const configureIframeAttrs = (iframeEl: HTMLIFrameElement | null | undefined, interactive: boolean) => {
      if (!iframeEl) return;
      iframeEl.className = interactive
        ? 'h-full w-full border-0'
        : 'h-full w-full border-0 pointer-events-none';
      iframeEl.referrerPolicy = 'strict-origin-when-cross-origin';
      iframeEl.allowFullscreen = true;
      iframeEl.setAttribute(
        'allow',
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
      );
    };

    const mountYtPlayer = async () => {
      if (!ytId) return;
      try {
        const YTGlobal = await loadYouTubeIframeApi(4500);
        if (destroyed || !ytMountRef.current) return;

        ytMountRef.current.innerHTML = '<div class="h-full w-full"></div>';
        const targetEl = ytMountRef.current.firstElementChild as HTMLElement;
        const origin = getYtOrigin();

        const player = new YTGlobal.Player(targetEl, {
          width: '100%',
          height: '100%',
          videoId: ytId,
          host: 'https://www.youtube.com',
          playerVars: {
            autoplay: showcase.autoplay ? 1 : 0,
            mute: 1,
            controls: 0,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            playsinline: 1,
            fs: 0,
            disablekb: 1,
            enablejsapi: 1,
            ...(origin ? { origin, widget_referrer: window.location.href } : {}),
            ...(showcase.loop ? { loop: 1, playlist: ytId } : {}),
          },
          events: {
            onReady: (ev) => {
              const p = ev?.target || player;
              if (!p || destroyed) return;
              ytRef.current = p;
              configureIframeAttrs(
                p.getIframe?.() || ytMountRef.current?.querySelector('iframe'),
                false
              );
              try {
                if (mutedRef.current) {
                  p.mute?.();
                } else {
                  p.unMute?.();
                }
                p.setVolume?.(initialVolumeRef.current);
                const dur = p.getDuration?.() || 0;
                if (dur > 0) setDuration(dur);
                if (showcase.autoplay) {
                  p.mute?.();
                  p.playVideo?.();
                }
              } catch {
                // ignore transient YouTube player startup state
              }
            },
            onStateChange: (ev) => {
              if (destroyed) return;
              // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
              if (ev.data === 1) {
                setPlaying(true);
                setPlayerError('');
              } else if (ev.data === 0 && showcase.loop) {
                try {
                  ytRef.current?.seekTo?.(0, true);
                  ytRef.current?.playVideo?.();
                } catch {
                  setPlaying(false);
                }
              } else if (
                ev.data === 2 ||
                ev.data === 0 ||
                ev.data === 5 ||
                ev.data === -1
              ) {
                setPlaying(false);
              }
            },
            onError: (ev) => {
              if (destroyed) return;
              const code = ev?.data;
              if (code === 101 || code === 150) {
                setPlayerError(
                  'This YouTube video has embedding disabled by the channel owner. Enable "Allow embedding" in YouTube Studio for this Unlisted/Public video.'
                );
              } else if (code === 100) {
                setPlayerError(
                  'This YouTube video is Private or unavailable. Make sure visibility is set to Unlisted or Public.'
                );
              } else if (code === 153) {
                setPlayerError(
                  'YouTube rejected embed configuration from this browser context. Please verify the video URL or embedding permissions.'
                );
              } else {
                setPlayerError(
                  'Unable to play this YouTube link inside the embed player. Please check the video link.'
                );
              }
              setPlaying(false);
            },
          },
        });

        ytRef.current = player;
        configureIframeAttrs(
          player.getIframe?.() || ytMountRef.current?.querySelector('iframe'),
          false
        );
      } catch {
        if (!destroyed) {
          setYtFallbackMode(true);
        }
      }
    };

    if (ytId) {
      void mountYtPlayer();
    }

    const poll = setInterval(() => {
      try {
        if (videoRef.current) {
          setCurrentTime(videoRef.current.currentTime || 0);
          setDuration(videoRef.current.duration || 0);
          setPlaying(!videoRef.current.paused && !videoRef.current.ended);
        } else if (ytRef.current?.getCurrentTime) {
          const cur = ytRef.current.getCurrentTime() || 0;
          const dur = ytRef.current.getDuration?.() || 0;
          const st = ytRef.current.getPlayerState?.();
          setCurrentTime(cur);
          if (dur > 0) setDuration(dur);
          if (st === 1) setPlaying(true);
          else if (st === 2 || st === 0 || st === 5 || st === -1) setPlaying(false);
        }
      } catch {
        // ignore read errors while iframe initializes
      }
    }, 500);

    return () => {
      destroyed = true;
      clearInterval(poll);
      try {
        ytRef.current?.destroy?.();
      } catch {
        // ignore cleanup error
      }
      ytRef.current = null;
    };
  }, [normalizedUrl, showcase.autoplay, showcase.loop, ytId, hasVideo]);

  if (!showcase.active && !isAdmin) {
    return null;
  }

  const postYtCommand = (func: string, args: unknown[] = []) => {
    const iframe =
      ytRef.current?.getIframe?.() ||
      ytMountRef.current?.querySelector('iframe') ||
      fallbackIframeRef.current;
    try {
      iframe?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        '*'
      );
    } catch {
      // ignore postMessage failure
    }
  };

  const togglePlay = () => {
    if (!hasVideo) return;
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
        setPlaying(true);
      } else {
        videoRef.current.pause();
        setPlaying(false);
      }
      return;
    }
    const p = ytRef.current;
    const st = p?.getPlayerState?.();
    const currentlyPlaying = st === 1 || (st === undefined && playing);
    if (currentlyPlaying) {
      p?.pauseVideo?.();
      postYtCommand('pauseVideo');
      setPlaying(false);
    } else {
      p?.playVideo?.();
      postYtCommand('playVideo');
      setPlaying(true);
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    const nextVol = volume > 0 ? volume : 75;
    setMuted(nextMuted);
    if (!nextMuted && volume === 0) setVolume(75);

    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
      if (!nextMuted) videoRef.current.volume = nextVol / 100;
      return;
    }
    const p = ytRef.current;
    if (nextMuted) {
      p?.mute?.();
      postYtCommand('mute');
    } else {
      p?.unMute?.();
      p?.setVolume?.(nextVol);
      postYtCommand('unMute');
      postYtCommand('setVolume', [nextVol]);
    }
  };

  const handleVolumeChange = (nextVol: number) => {
    setVolume(nextVol);
    const shouldMute = nextVol === 0;
    setMuted(shouldMute);
    if (videoRef.current) {
      videoRef.current.volume = nextVol / 100;
      videoRef.current.muted = shouldMute;
      return;
    }
    const p = ytRef.current;
    if (shouldMute) {
      p?.mute?.();
      postYtCommand('mute');
    } else {
      p?.unMute?.();
      p?.setVolume?.(nextVol);
      postYtCommand('unMute');
      postYtCommand('setVolume', [nextVol]);
    }
  };

  const handleSeek = (nextSec: number) => {
    setCurrentTime(nextSec);
    if (videoRef.current) {
      videoRef.current.currentTime = nextSec;
      return;
    }
    ytRef.current?.seekTo?.(nextSec, true);
    postYtCommand('seekTo', [nextSec, true]);
  };

  const cycleSpeed = () => {
    const rates = [1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(speed) + 1) % rates.length];
    setSpeed(next);
    if (videoRef.current) {
      videoRef.current.playbackRate = next;
    } else {
      ytRef.current?.setPlaybackRate?.(next);
      postYtCommand('setPlaybackRate', [next]);
    }
  };

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  };

  const ytOrigin = getYtOrigin();
  const fallbackEmbedSrc = ytId
    ? `https://www.youtube.com/embed/${ytId}?enablejsapi=1&autoplay=${
        showcase.autoplay ? 1 : 0
      }&mute=1&controls=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1${
        ytOrigin ? `&origin=${encodeURIComponent(ytOrigin)}` : ''
      }${showcase.loop ? `&loop=1&playlist=${ytId}` : ''}`
    : '';

  return (
    <section
      aria-label="Course orientation showcase"
      className="mb-6 overflow-hidden rounded-[18px] border border-[#28426e] bg-gradient-to-br from-[#0f1f3d] via-[#17305b] to-[#1d3e72] text-white shadow-[0_14px_38px_rgba(16,31,61,0.18)]"
    >
      {/* Top gradient ribbon & header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#142a52]/90 via-[#1b3a6f]/80 to-[#142a52]/90 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-[#d7a84b]">
            {!photoError ? (
              <img
                src={photoSrc}
                alt={showcase.mentorName}
                referrerPolicy="no-referrer"
                onError={() => setPhotoError(true)}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[#d7a84b] text-xs font-extrabold text-[#142746]">
                {(showcase.mentorName || 'A')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#f3cf7a]">
              <span>Inbuilt Course Guide</span>
              <span aria-hidden="true" className="text-white/40">
                ·
              </span>
              <span className="truncate text-[#bfe8d6]">
                {showcase.mentorName}
              </span>
              {!showcase.active && isAdmin && (
                <>
                  <span aria-hidden="true" className="text-white/40">
                    ·
                  </span>
                  <span className="text-[#fca5a5]">Hidden from Students</span>
                </>
              )}
            </div>
            <h2 className="truncate text-sm font-bold tracking-tight text-white sm:text-base">
              {showcase.title}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasVideo && (
            <button
              type="button"
              onClick={() => setCompact((c) => !c)}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {compact ? (
                <>
                  <Maximize2 className="h-3.5 w-3.5 text-[#f3cf7a]" />
                  <span>Expand Video</span>
                </>
              ) : (
                <>
                  <Minimize2 className="h-3.5 w-3.5 text-[#f3cf7a]" />
                  <span>Minimize</span>
                </>
              )}
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#d7a84b] px-3.5 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#e4b85e] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>{hasVideo ? 'Edit Video & Photo' : 'Add Intro Video'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className={
          compact
            ? 'px-4 py-3 sm:px-5'
            : 'grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 sm:p-5 items-stretch'
        }
      >
        {!compact && (
          <div className="lg:col-span-5 flex flex-col justify-between rounded-[14px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.03] p-4 sm:p-5">
            <div>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[14px] border border-[#d7a84b]/60 bg-[#0d1930] shadow-md">
                  {!photoError ? (
                    <img
                      src={photoSrc}
                      alt={showcase.mentorName}
                      referrerPolicy="no-referrer"
                      onError={() => setPhotoError(true)}
                      className="h-full w-full object-cover object-top"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-[#d7a84b] text-xl font-extrabold text-[#142746]">
                      {(showcase.mentorName || 'A')[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold tracking-wide text-[#f3cf7a]">
                    Mentor &amp; Course Director
                  </div>
                  <div className="mt-0.5 text-lg font-extrabold text-white leading-tight">
                    {showcase.mentorName}
                  </div>
                  <div className="mt-1 text-xs text-[#cbd7ec] leading-snug">
                    {showcase.mentorRole}
                  </div>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-[#e6edf8]">
                {showcase.subtitle}
              </p>
            </div>

            <div className="mt-5 pt-3.5 border-t border-white/10 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-[#bfe8d6]">
              <span>GST Practical</span>
              <span className="text-white/35" aria-hidden="true">
                ·
              </span>
              <span>Income Tax &amp; ITR</span>
              <span className="text-white/35" aria-hidden="true">
                ·
              </span>
              <span>TDS Compliance</span>
              <span className="text-white/35" aria-hidden="true">
                ·
              </span>
              <span className="text-[#f3cf7a]">Inbuilt Portal Playback</span>
            </div>
          </div>
        )}

        {/* Inbuilt Video Player Column */}
        <div className={compact ? 'w-full' : 'lg:col-span-7 flex flex-col'}>
          {!hasVideo ? (
            <div className="flex flex-1 min-h-[220px] flex-col items-center justify-center rounded-[14px] border border-dashed border-white/25 bg-[#0b162b]/70 p-6 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#d7a84b]/20 text-[#f3cf7a]">
                <Video className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-base font-bold text-white">
                {isAdmin
                  ? 'Add Your Unlisted Course Overview Video'
                  : 'Course Orientation Video Coming Soon'}
              </h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#b8c6de]">
                {isAdmin
                  ? 'Paste any YouTube unlisted link or direct MP4 video URL. Students will see and watch it automatically right inside this inbuilt portal panel without leaving the app.'
                  : 'The administrator will publish the course introduction video here shortly.'}
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="mt-4 rounded-[10px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#e4b85e] cursor-pointer"
                >
                  Paste Video Link &amp; Save
                </button>
              )}
            </div>
          ) : (
            <div
              ref={stageRef}
              className="flex flex-col overflow-hidden rounded-[14px] border border-white/15 bg-[#091224] shadow-lg"
            >
              <div
                className={`relative w-full overflow-hidden bg-black ${
                  compact ? 'h-0' : 'aspect-video'
                }`}
              >
                {ytId ? (
                  ytFallbackMode ? (
                    <iframe
                      ref={fallbackIframeRef}
                      src={fallbackEmbedSrc}
                      title={showcase.title}
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  ) : (
                    <div ref={ytMountRef} className="h-full w-full" />
                  )
                ) : (
                  <video
                    ref={videoRef}
                    src={normalizedUrl}
                    autoPlay={showcase.autoplay}
                    muted={muted}
                    loop={showcase.loop}
                    playsInline
                    onError={() =>
                      setPlayerError(
                        'Could not play this video URL. Make sure you pasted a valid YouTube link or direct MP4 video URL.'
                      )
                    }
                    className="h-full w-full object-contain"
                  />
                )}

                {playerError && !compact ? (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#091224]/95 p-5 text-center">
                    <AlertCircle className="h-8 w-8 text-[#fca5a5]" />
                    <p className="mt-2.5 max-w-md text-xs leading-relaxed text-[#e6edf8]">
                      {playerError}
                    </p>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={onEdit}
                        className="mt-3 rounded-[9px] bg-[#d7a84b] px-3.5 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#e4b85e] cursor-pointer"
                      >
                        Update Video Link
                      </button>
                    )}
                  </div>
                ) : (
                  !ytFallbackMode && (
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={playing ? 'Pause video' : 'Play video'}
                      className="absolute inset-0 z-10 flex items-center justify-center bg-transparent cursor-pointer focus:outline-none group"
                    >
                      {!playing && !compact && (
                        <span className="grid h-14 w-14 place-items-center rounded-full bg-[#142746]/85 text-[#f3cf7a] ring-2 ring-[#d7a84b] shadow-lg transition-transform group-hover:scale-105">
                          <Play className="h-6 w-6 fill-current ml-0.5" />
                        </span>
                      )}
                    </button>
                  )
                )}

                {muted && !compact && !playerError && (
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="absolute bottom-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-[9px] bg-[#142746]/90 border border-[#d7a84b]/60 px-3 py-1.5 text-xs font-bold text-[#f3cf7a] hover:bg-[#1e3761] cursor-pointer"
                  >
                    <VolumeX className="h-3.5 w-3.5" />
                    <span>Tap for Sound</span>
                  </button>
                )}
              </div>

              {/* Inbuilt Portal Studio Controls Bar */}
              <div className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-[#0d1930] px-3.5 py-2.5 text-xs text-white">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? 'Pause' : 'Play'}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#d7a84b] text-[#142746] hover:bg-[#e4b85e] cursor-pointer"
                >
                  {playing ? (
                    <Pause className="h-4 w-4 fill-current" />
                  ) : (
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  )}
                </button>

                <div className="flex min-w-[140px] flex-1 items-center gap-2.5">
                  <span className="font-mono text-[11px] tabular-nums text-[#cbd7ec] shrink-0">
                    {formatSec(currentTime)} / {formatSec(duration)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={duration > 0 ? Math.floor(duration) : 100}
                    value={Math.min(
                      duration > 0 ? Math.floor(duration) : 100,
                      Math.floor(currentTime)
                    )}
                    onChange={(e) => handleSeek(Number(e.target.value))}
                    aria-label="Seek video timeline"
                    className="h-1.5 w-full accent-[#d7a84b] cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                    className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="h-4 w-4 text-[#f3cf7a]" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-[#8be3bf]" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={muted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    aria-label="Volume control"
                    className="w-16 sm:w-20 h-1.5 accent-[#13845b] cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={cycleSpeed}
                    title="Playback speed"
                    className="rounded-lg bg-white/10 px-2.5 py-1.5 font-mono text-[11px] font-bold tabular-nums text-[#e6edf8] hover:bg-white/20 cursor-pointer"
                  >
                    {speed}x
                  </button>
                  {!compact && (
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      aria-label="Fullscreen player"
                      title="Fullscreen inside portal"
                      className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
