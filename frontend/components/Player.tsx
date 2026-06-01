"use client";

import Link from "next/link";
import { useEffect, useRef, useState, Fragment, ReactNode } from "react";
import Hls from "hls.js";
import { Transition } from "@headlessui/react";
import {
    ArrowLeft,
    Play,
    Pause,
    RotateCcw,
    RotateCw,
    Volume2,
    VolumeX,
    Maximize,
    Minimize,
    Settings,
    MessageSquare,
    Check,
    Layers,
    SkipForward,
    Gauge
} from "lucide-react";
import { EpisodesPanel } from "./EpisodesPanel";
import {
    readSessionPlayIntent,
    sessionPlayingKey,
    writeSessionPlayIntent
} from "@/lib/watch-session-storage";
import { formatTime } from "@/lib/utils";

type PlayerSource = {
    url: string;
    isHls?: boolean;
};

type ProgressPayload = {
    positionSeconds: number;
    durationSeconds: number;
    isFinished: boolean;
};

type QualityOption = {
    id: string;
    label: string;
    value: string | null;
};

type PlayerProps = {
    source?: PlayerSource;
    title?: string;
    episodeLabel?: string;
    initialTimeSeconds?: number;
    audioLanguages?: {
        id: string;
        label: string;
        code?: string | null;
        isDefault?: boolean;
    }[];
    languageOptions?: { id: string; label: string }[];
    currentLanguageId?: string | null;
    onChangeLanguage?: (languageId: string) => void;
    onProgress?: (payload: ProgressPayload) => void;
    onEnded?: () => void;
    onError?: (error: Error) => void;
    qualityOptions?: QualityOption[];
    currentQualityId?: string | null;
    onChangeQuality?: (qualityId: string | null) => void;
    introEndSeconds?: number;
    nextEpisodeHref?: string;
    nextEpisodeLabel?: string;
    onBack?: () => void;
    onShowEpisodes?: () => void;
    showId?: string;
    /** Route/catalog episode id for session resume / play-intent across refresh (e.g. same as URL segment). */
    progressEpisodeKey?: string;
    episodes?: { number: string; title?: string | null; season?: number }[];
    seasons?: { id: string; title: string }[];
    isMovie?: boolean;
    /** Full-area loading overlay while the watch layout refetches the stream (audio / quality / episode). */
    isStreamLoading?: boolean;
};

const PROGRESS_INTERVAL_MS = 15000;

function resolveAudioPreferenceCode(
    audioLanguages: PlayerProps["audioLanguages"] | undefined,
    selectedId: string | null
): string | null {
    if (!selectedId) return null;
    if (!audioLanguages?.length) {
        return selectedId === "ja" || selectedId === "en" ? selectedId : null;
    }
    const byId = audioLanguages.find((l) => l.id === selectedId);
    if (byId?.code) return byId.code;
    if (byId) return byId.id;
    if (selectedId === "ja" || selectedId === "en") {
        const hit = audioLanguages.find((l) => l.code === selectedId || l.id === selectedId);
        return hit?.code ?? selectedId;
    }
    return null;
}

export function Player({
    source,
    title,
    episodeLabel,
    initialTimeSeconds,
    audioLanguages,
    languageOptions,
    currentLanguageId,
    onChangeLanguage,
    onProgress,
    onEnded,
    onError,
    qualityOptions: qualityOptionsProp,
    currentQualityId,
    onChangeQuality,
    introEndSeconds,
    nextEpisodeHref,
    nextEpisodeLabel,
    onBack,
    onShowEpisodes,
    showId,
    progressEpisodeKey,
    episodes,
    seasons,
    isMovie = false,
    isStreamLoading = false
}: PlayerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);

    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [scrubPercent, setScrubPercent] = useState(0);
    const [bufferedPercent, setBufferedPercent] = useState(0);
    const [showSkipIntro, setShowSkipIntro] = useState(false);
    const [hasSkippedIntro, setHasSkippedIntro] = useState(false);
    const [subtitleTracks, setSubtitleTracks] = useState<
        { id: number; name: string }[]
    >([]);
    const [currentSubtitleId, setCurrentSubtitleId] = useState<number | null>(null);
    const [hasEnded, setHasEnded] = useState(false);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    // Tracks actual playing language when HLS falls back (e.g. episode has no dub).
    // null means "same as selectedAudioLanguageId".
    const [hlsActualLanguageId, setHlsActualLanguageId] = useState<string | null>(null);
    const [hlsQualityOptions, setHlsQualityOptions] = useState<QualityOption[]>([]);
    const [hlsQualityValue, setHlsQualityValue] = useState("auto");
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const episodesTimeoutRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const hasAppliedInitialTime = useRef(false);
    const lastSourceUrlRef = useRef<string | null>(null);
    const lastEpisodeLabelRef = useRef<string | undefined>(episodeLabel);
    const seekBarRef = useRef<HTMLDivElement | null>(null);
    const [isMobileDevice, setIsMobileDevice] = useState(false);
    const [isCssLandscape, setIsCssLandscape] = useState(false);
    const clickTimeoutRef = useRef<number | null>(null);
    const controlsVisibleRef = useRef(controlsVisible);
    controlsVisibleRef.current = controlsVisible;
    const lastWakeTimeRef = useRef<number>(0);

    const onProgressRef = useRef(onProgress);
    onProgressRef.current = onProgress;
    const durationRef = useRef(duration);
    durationRef.current = duration;
    const onEndedRef = useRef(onEnded);
    onEndedRef.current = onEnded;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    const isScrubbingRef = useRef(isScrubbing);
    isScrubbingRef.current = isScrubbing;
    const hasSkippedIntroRef = useRef(hasSkippedIntro);
    hasSkippedIntroRef.current = hasSkippedIntro;
    const introEndSecondsRef = useRef(introEndSeconds);
    introEndSecondsRef.current = introEndSeconds;
    const currentLanguageIdRef = useRef(currentLanguageId);
    currentLanguageIdRef.current = currentLanguageId;
    const initialTimeSecondsRef = useRef(initialTimeSeconds);
    initialTimeSecondsRef.current = initialTimeSeconds;

    const [selectedAudioLanguageId, setSelectedAudioLanguageId] = useState<string | null>(() => {
        if (currentLanguageId) return currentLanguageId;
        if (audioLanguages && audioLanguages.length > 0) {
            return audioLanguages.find((lang) => lang.isDefault)?.id ?? audioLanguages[0]?.id ?? null;
        }
        return null;
    });

    useEffect(() => {
        if (typeof window === "undefined" || !navigator) return;

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        setIsMobileDevice(isMobile);

        const checkOrientation = () => {
            if (isMobile && window.innerHeight > window.innerWidth) {
                setIsCssLandscape(true);
            } else {
                setIsCssLandscape(false);
            }
        };

        if (isMobile) {
            checkOrientation();
            window.addEventListener("resize", checkOrientation);
            void enforceMobileFullscreen();
        }

        return () => {
            window.removeEventListener("resize", checkOrientation);
        };
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;


        const savedTime = lastTimeRef.current;

        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        const isEpisodeSwitch = lastEpisodeLabelRef.current !== episodeLabel;

        if (!source || !source.url) {
            setHlsQualityOptions([]);
            setHlsQualityValue("auto");
            video.removeAttribute("src");
            video.load();
            setIsBuffering(true);
            setIsPlayerReady(false);
            setIsPlaying(false);
            setDuration(0);
            setCurrentTime(0);
            return;
        }

        const isHls = source.isHls ?? source.url.includes(".m3u8");

        // New episode: use saved progress from the server (initialTimeSeconds). Same episode with a
        // new manifest (quality/audio): continue from the live playhead (savedTime), even if the URL
        // were unchanged.
        const resumeTime = isEpisodeSwitch
            ? (initialTimeSecondsRef.current ?? 0)
            : savedTime > 0
                ? savedTime
                : (initialTimeSecondsRef.current ?? 0);

        const applyResumeTime = () => {
            const rt = isEpisodeSwitch
                ? (initialTimeSecondsRef.current ?? 0)
                : savedTime > 0
                    ? savedTime
                    : (initialTimeSecondsRef.current ?? 0);
            if (rt > 0 && (!video.duration || rt < video.duration)) {
                video.currentTime = rt;
                setCurrentTime(rt);
                lastTimeRef.current = rt;
            }
            lastSourceUrlRef.current = source.url;
            lastEpisodeLabelRef.current = episodeLabel;
        };

        const mediaErrorRecoveredRef = { current: false };

        if (isHls && Hls.isSupported()) {
            const hls = new Hls({

                startPosition: resumeTime > 0 ? resumeTime : -1,
            });
            hlsRef.current = hls;
            hls.loadSource(source.url);
            hls.attachMedia(video);

            const rebuildHlsQualityMenu = () => {
                const levels = hls.levels;
                if (!levels || levels.length <= 1) {
                    setHlsQualityOptions([]);
                    setHlsQualityValue("auto");
                    return;
                }
                const withIdx = levels.map((lvl, i) => ({ lvl, i }));
                withIdx.sort((a, b) => (b.lvl.height || 0) - (a.lvl.height || 0));
                const opts: QualityOption[] = [
                    { id: "auto", label: "Auto", value: null },
                    ...withIdx.map(({ lvl, i }) => ({
                        id: `lvl-${i}`,
                        label: lvl.height ? `${lvl.height}p` : lvl.name ? String(lvl.name) : `Stream ${i + 1}`,
                        value: String(i)
                    }))
                ];
                setHlsQualityOptions(opts);
                const auto = hls.loadLevel === -1 || hls.autoLevelEnabled;
                setHlsQualityValue(auto ? "auto" : `lvl-${hls.currentLevel}`);
            };

            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (!data.fatal) return;
                if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    if (!mediaErrorRecoveredRef.current) {
                        mediaErrorRecoveredRef.current = true;
                        hls.recoverMediaError();
                    } else {
                        // Recovery failed — bubble up so layout can retry with fresh CDN URL.
                        setIsBuffering(false);
                        setIsPlayerReady(true);
                        setIsPlaying(false);
                        onErrorRef.current?.(new Error("media_error"));
                    }
                } else {
                    setIsBuffering(false);
                    setIsPlayerReady(true);
                    setIsPlaying(false);
                    onErrorRef.current?.(new Error("stream_error"));
                }
            });

            hls.on(Hls.Events.MANIFEST_PARSED, (_event, _data) => {
                applyResumeTime();
                rebuildHlsQualityMenu();
            });

            hls.on(Hls.Events.LEVELS_UPDATED, () => {
                rebuildHlsQualityMenu();
            });

            hls.on(Hls.Events.LEVEL_SWITCHED, () => {
                if (hlsRef.current !== hls) return;
                const inst = hlsRef.current;
                if (inst.loadLevel === -1 || inst.autoLevelEnabled) {
                    setHlsQualityValue("auto");
                } else {
                    setHlsQualityValue(`lvl-${inst.currentLevel}`);
                }
            });

            hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_event, data: any) => {
                const tracks = (data.subtitleTracks || []).map(
                    (track: any, index: number) => ({
                        id: index,
                        name: track.name || track.lang || `Track ${index + 1}`
                    })
                );
                setSubtitleTracks(tracks);

                if (tracks.length === 0) {
                    setCurrentSubtitleId(null);
                    const anyHls = hls as any;
                    anyHls.subtitleTrack = -1;
                    return;
                }

                const defaultId = currentLanguageIdRef.current === "ja" ? 0 : -1;
                setCurrentSubtitleId(defaultId);
                const anyHls = hls as any;
                anyHls.subtitleTrack = defaultId;
            });

            hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_event: any, data: any) => {
                setCurrentSubtitleId(typeof data.id === "number" ? data.id : null);
            });

            hls.on(Hls.Events.NON_NATIVE_TEXT_TRACKS_FOUND, (_event, _data: any) => {
            });

            hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data: any) => {
                const tracks = data.audioTracks || [];
                if (tracks.length === 0) {
                    return;
                }

                const code = resolveAudioPreferenceCode(audioLanguages, selectedAudioLanguageId);
                if (code) {
                    const matchByCode = tracks.findIndex((track: any) => {
                        const lang = track.lang as string | undefined;
                        return (
                            track.lang === code ||
                            track.name === code ||
                            (typeof lang === "string" && lang.split("-")[0] === code)
                        );
                    });
                    if (matchByCode >= 0) {
                        const anyHls = hls as any;
                        anyHls.audioTrack = matchByCode;
                        setHlsActualLanguageId(null); // playing what was requested
                        return;
                    }
                }

                // Requested language not in this stream — fall back to track 0.
                // Update display to reflect what's actually playing without changing user pref.
                const anyHls = hls as any;
                anyHls.audioTrack = 0;
                const fallbackTrack = tracks[0];
                const fallbackLang = (fallbackTrack?.lang as string | undefined)?.split("-")[0] ?? null;
                const fallbackEntry = audioLanguages?.find((l) => l.code === fallbackLang || l.id === fallbackLang);
                setHlsActualLanguageId(fallbackEntry?.id ?? fallbackLang);
            });
        } else {
            video.src = source.url;
        }

        const handleLoadedMetadata = () => {
            setDuration(video.duration || 0);
            if (!isHls) {
                applyResumeTime();
            }
        };

        /** Seconds of media buffered ahead of the playhead (0 if none). */
        const bufferAhead = (v: HTMLVideoElement): number => {
            if (!v.buffered.length) return 0;
            const t = v.currentTime;
            let maxAhead = 0;
            for (let i = 0; i < v.buffered.length; i++) {
                const start = v.buffered.start(i);
                const end = v.buffered.end(i);
                if (start <= t + 0.01 && t <= end + 0.01) {
                    maxAhead = Math.max(maxAhead, end - t);
                }
            }
            return maxAhead;
        };

        /** `waiting` sets buffering, but `playing` often does not fire again after a mid-play stall. */
        const syncBufferingFromElement = () => {
            if (video.paused || video.ended) return;
            const dur = video.duration || 0;
            const t = video.currentTime;
            const ahead = bufferAhead(video);
            if (ahead > 0.35 || (dur > 0 && t >= dur - 0.5)) {
                setIsBuffering(false);
            }
        };

        const handleTimeUpdate = () => {
            if (!isScrubbingRef.current) {
                const t = video.currentTime || 0;
                setCurrentTime(t);
                lastTimeRef.current = t;

                const introEnd = introEndSecondsRef.current;
                if (
                    !hasSkippedIntroRef.current &&
                    introEnd &&
                    video.duration &&
                    video.duration > 600 &&
                    t > 5 &&
                    t < introEnd
                ) {
                    setShowSkipIntro(true);
                } else if (t >= (introEnd ?? 0)) {
                    setShowSkipIntro(false);
                }
            }
            syncBufferingFromElement();
        };

        const handleProgress = () => {
            if (video.buffered.length > 0 && video.duration) {
                let currentBuffered = 0;
                const currentTime = video.currentTime;
                for (let i = 0; i < video.buffered.length; i++) {
                    if (video.buffered.start(i) <= currentTime && video.buffered.end(i) >= currentTime) {
                        currentBuffered = video.buffered.end(i);
                        break;
                    }
                }
                setBufferedPercent((currentBuffered / video.duration) * 100);
            }
            syncBufferingFromElement();
        };

        const handlePlaying = () => {
            setIsPlaying(true);
            setIsBuffering(false);
        };

        const handlePause = () => {
            setIsPlaying(false);
            setIsBuffering(false);
            if (durationRef.current && onProgressRef.current) {
                onProgressRef.current({
                    positionSeconds: video.currentTime || lastTimeRef.current,
                    durationSeconds: durationRef.current,
                    isFinished: video.ended || false
                });
            }
        };

        const handleWaiting = () => {
            setIsBuffering(true);
        };

        const handleEnded = () => {
            setIsPlaying(false);
            setIsBuffering(false);
            setCurrentTime(video.duration || 0);
            setHasEnded(true);
            onProgressRef.current?.({
                positionSeconds: video.duration || 0,
                durationSeconds: video.duration || 0,
                isFinished: true
            });
            onEndedRef.current?.();
        };

        const handleCanPlay = () => {
            setIsPlayerReady(true);
            syncBufferingFromElement();
        };

        const handleCanPlayThrough = () => {
            setIsPlayerReady(true);
            syncBufferingFromElement();
        };

        const handleSeeked = () => {
            syncBufferingFromElement();
        };

        // Clear stuck spinner on native video load failure (e.g. 403, bad URL) and trigger retry.
        const handleVideoError = () => {
            setIsBuffering(false);
            setIsPlayerReady(true);
            setIsPlaying(false);
            onErrorRef.current?.(new Error("video_error"));
        };

        video.addEventListener("loadedmetadata", handleLoadedMetadata);
        video.addEventListener("timeupdate", handleTimeUpdate);
        video.addEventListener("playing", handlePlaying);
        video.addEventListener("pause", handlePause);
        video.addEventListener("waiting", handleWaiting);
        video.addEventListener("progress", handleProgress);
        video.addEventListener("ended", handleEnded);
        video.addEventListener("canplay", handleCanPlay);
        video.addEventListener("canplaythrough", handleCanPlayThrough);
        video.addEventListener("seeked", handleSeeked);
        video.addEventListener("error", handleVideoError);

        const wasAlreadyMuted = video.muted;
        void video
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => {
                // Gesture may have expired by the time the stream URL is fetched.
                // Muted autoplay is permitted on iOS/Android — start muted so the
                // video buffers and canplay fires, clearing the loading spinner.
                video.muted = true;
                setIsMuted(true);
                void video
                    .play()
                    .then(() => {
                        setIsPlaying(true);
                        // Restore audio if the user wasn't muted before the stream swap.
                        if (!wasAlreadyMuted) {
                            video.muted = false;
                            setIsMuted(false);
                        }
                    })
                    .catch(() => {
                        video.muted = false;
                        setIsMuted(false);
                        // Don't setIsPlaying(false) here — races with handlePlaying
                        // when user triggers play while this promise is pending.
                    });
            });

        return () => {
            video.removeEventListener("loadedmetadata", handleLoadedMetadata);
            video.removeEventListener("timeupdate", handleTimeUpdate);
            video.removeEventListener("playing", handlePlaying);
            video.removeEventListener("pause", handlePause);
            video.removeEventListener("waiting", handleWaiting);
            video.removeEventListener("progress", handleProgress);
            video.removeEventListener("ended", handleEnded);
            video.removeEventListener("canplay", handleCanPlay);
            video.removeEventListener("canplaythrough", handleCanPlayThrough);
            video.removeEventListener("seeked", handleSeeked);
            video.removeEventListener("error", handleVideoError);
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- full HLS teardown/rebuild only on stream URL change; other props handled by separate effects
    }, [source?.url]);

    useEffect(() => {
        hasAppliedInitialTime.current = false;
    }, [episodeLabel, source?.url]);

    // Watchdog: if video is playing but duration stays 0 (e.g. manifest parsed but
    // segments are dead and no HLS error fires), surface an error so layout can retry.
    useEffect(() => {
        if (!isPlaying || !isPlayerReady || duration > 0 || !source?.url) return;
        const timer = window.setTimeout(() => {
            setIsPlaying(false);
            onErrorRef.current?.(new Error("stuck_stream"));
        }, 5000);
        return () => window.clearTimeout(timer);
    }, [isPlaying, isPlayerReady, duration, source?.url]);

    useEffect(() => {
        if (currentLanguageId) {
            setSelectedAudioLanguageId(currentLanguageId);
        }
    }, [currentLanguageId]);

    useEffect(() => {
        const hls = hlsRef.current;
        const tracks = hls?.audioTracks;
        if (!hls || !tracks?.length) return;
        const code = resolveAudioPreferenceCode(audioLanguages, selectedAudioLanguageId);
        if (!code) return;
        const idx = tracks.findIndex((t: any) => {
            const lang = t.lang as string | undefined;
            return (
                t.lang === code ||
                t.name === code ||
                (typeof lang === "string" && lang.split("-")[0] === code)
            );
        });
        if (idx >= 0 && hls.audioTrack !== idx) {
            hls.audioTrack = idx;
        }
    }, [selectedAudioLanguageId, audioLanguages, source?.url]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !source?.url) return;
        if (initialTimeSeconds == null || initialTimeSeconds <= 0) return;

        let cancelled = false;
        const target = initialTimeSeconds;

        const applyResume = () => {
            if (cancelled || hasAppliedInitialTime.current) return;
            const elDur =
                Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
            const dur = elDur > 0 ? elDur : duration > 0 ? duration : 0;
            if (dur > 0 && target >= dur - 0.5) {
                hasAppliedInitialTime.current = true;
                return;
            }
            if (dur > 0 && target > 0) {
                video.currentTime = target;
                setCurrentTime(target);
                lastTimeRef.current = target;
                hasAppliedInitialTime.current = true;
            }
        };

        const onLoadedMetadata = () => {
            requestAnimationFrame(() => requestAnimationFrame(applyResume));
        };

        video.addEventListener("loadedmetadata", onLoadedMetadata);
        video.addEventListener("loadeddata", applyResume);
        applyResume();

        return () => {
            cancelled = true;
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("loadeddata", applyResume);
        };
    }, [initialTimeSeconds, source?.url, duration]);

    /**
     * After Ctrl+R, resume playback if the tab was playing. Unmuted autoplay is usually blocked;
     * we fall back to muted play() then restore `video.muted` when the user had sound on.
     */
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !source?.url || !isPlayerReady || !showId || !progressEpisodeKey) return;

        let storageKey: string;
        try {
            storageKey = sessionPlayingKey(showId, progressEpisodeKey);
        } catch {
            return;
        }

        const intent = readSessionPlayIntent(showId, progressEpisodeKey);
        if (!intent?.resumePlay) return;

        const clearIntent = () => {
            try {
                sessionStorage.removeItem(storageKey);
            } catch {
                /* ignore */
            }
        };

        const attemptResume = () => {
            if (!video.paused && !video.ended) {
                setIsPlaying(true);
                clearIntent();
                return;
            }

            const hadMuted = intent.videoMuted;

            const restoreMuteIfNeeded = () => {
                if (!hadMuted) {
                    video.muted = false;
                    setIsMuted(false);
                }
            };

            void video
                .play()
                .then(() => {
                    setIsPlaying(true);
                    clearIntent();
                })
                .catch(() => {
                    video.muted = true;
                    setIsMuted(true);
                    void video
                        .play()
                        .then(() => {
                            setIsPlaying(true);
                            restoreMuteIfNeeded();
                            clearIntent();
                        })
                        .catch(() => {
                            setIsPlaying(false);
                            restoreMuteIfNeeded();
                            clearIntent();
                        });
                });
        };

        attemptResume();

        let cancelled = false;
        if (initialTimeSeconds != null && initialTimeSeconds > 0) {
            const onSeeked = () => {
                if (cancelled) return;
                attemptResume();
            };
            video.addEventListener("seeked", onSeeked);
            const t = window.setTimeout(() => {
                if (cancelled) return;
                attemptResume();
            }, 1500);
            return () => {
                cancelled = true;
                video.removeEventListener("seeked", onSeeked);
                window.clearTimeout(t);
            };
        }

        return undefined;
    }, [source?.url, isPlayerReady, showId, progressEpisodeKey, initialTimeSeconds]);

    useEffect(() => {
        if (!onProgress || !source?.url) return;

        const video = videoRef.current;
        if (!video) return;

        const id = window.setInterval(() => {
            const currentDuration = video.duration || durationRef.current;
            if (!currentDuration) return;
            onProgress({
                positionSeconds: video.currentTime,
                durationSeconds: currentDuration,
                isFinished: false
            });
        }, PROGRESS_INTERVAL_MS);

        return () => {
            window.clearInterval(id);
            if (durationRef.current > 0) {
                onProgress({
                    positionSeconds: lastTimeRef.current,
                    durationSeconds: durationRef.current,
                    isFinished: false // Close enough on unmount
                });
            }
        };
    }, [onProgress, source?.url]);

    useEffect(() => {
        const persistPlayIntentForHardNavigation = () => {
            const video = videoRef.current;
            if (showId && progressEpisodeKey && video) {
                writeSessionPlayIntent(showId, progressEpisodeKey, {
                    resumePlay: !(video.paused || video.ended),
                    videoMuted: video.muted
                });
            }
        };

        const flushProgress = () => {
            if (durationRef.current > 0 && onProgressRef.current) {
                onProgressRef.current({
                    positionSeconds: lastTimeRef.current,
                    durationSeconds: durationRef.current,
                    isFinished: false
                });
            }
        };

        const onPageHideOrUnload = () => {
            persistPlayIntentForHardNavigation();
            flushProgress();
        };

        const onVisibilityHidden = () => {
            if (document.visibilityState === "hidden") {
                flushProgress();
            }
        };

        window.addEventListener("pagehide", onPageHideOrUnload);
        window.addEventListener("beforeunload", onPageHideOrUnload);
        document.addEventListener("visibilitychange", onVisibilityHidden);

        return () => {
            window.removeEventListener("pagehide", onPageHideOrUnload);
            window.removeEventListener("beforeunload", onPageHideOrUnload);
            document.removeEventListener("visibilitychange", onVisibilityHidden);
        };
    }, [showId, progressEpisodeKey]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const syncTracks = () => {
            const nativeTracks = Array.from(video.textTracks).map((track, index) => ({
                id: index + 100,
                name: track.label || track.language || `Track ${index + 1}`
            }));

            if (nativeTracks.length > 0) {
                setSubtitleTracks(prev => {
                    if (prev.length > 0) return prev;
                    return nativeTracks;
                });
            }
        };

        video.textTracks.addEventListener("addtrack", syncTracks);
        syncTracks();

        return () => {
            video.textTracks.removeEventListener("addtrack", syncTracks);
        };
    }, []);

    useEffect(() => {
        if (!isPlaying || isBuffering) {
            setControlsVisible(true);
            if (containerRef.current) {
                containerRef.current.style.cursor = "default";
            }
            return;
        }

        let timeout: number | null = null;

        const resetTimer = () => {
            if (!controlsVisibleRef.current) {
                lastWakeTimeRef.current = Date.now();
            }
            setControlsVisible(true);
            if (containerRef.current) {
                containerRef.current.style.cursor = "default";
            }
            if (timeout !== null) {
                window.clearTimeout(timeout);
            }
            timeout = window.setTimeout(() => {
                if (activeMenu) {
                    resetTimer();
                    return;
                }
                setControlsVisible(false);
                if (containerRef.current && isPlaying) {
                    containerRef.current.style.cursor = "none";
                }
            }, 3000);
        };

        resetTimer();

        const el = containerRef.current;
        if (el) {
            el.addEventListener("mousemove", resetTimer);
            el.addEventListener("touchstart", resetTimer);
            el.addEventListener("mousedown", resetTimer);
        }

        return () => {
            if (timeout !== null) {
                window.clearTimeout(timeout);
            }
            if (el) {
                el.removeEventListener("mousemove", resetTimer);
                el.removeEventListener("touchstart", resetTimer);
                el.removeEventListener("mousedown", resetTimer);
                el.style.cursor = "default";
            }
        };
    }, [isPlaying, activeMenu, isBuffering]);

    const exitingFullscreenRef = useRef(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const fsElement =
                document.fullscreenElement ||
                (document as any).webkitFullscreenElement;
            setIsFullscreen(!!fsElement);

            // On mobile, when the system back button exits fullscreen,
            // the browser consumes the back event. We need to navigate back ourselves.
            if (!fsElement && isMobileDevice && !exitingFullscreenRef.current) {
                if (durationRef.current > 0 && onProgressRef.current) {
                    onProgressRef.current({
                        positionSeconds: lastTimeRef.current,
                        durationSeconds: durationRef.current,
                        isFinished: false
                    });
                }
                if (onBack) {
                    onBack();
                } else {
                    history.back();
                }
            }
            exitingFullscreenRef.current = false;
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
        };
    }, [isMobileDevice, onBack]);

    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.isContentEditable)
            ) {
                return;
            }

            if (event.key === " " || event.key === "k") {
                event.preventDefault();
                togglePlay();
            } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                seekRelative(-10);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                seekRelative(10);
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                changeVolume(0.1);
            } else if (event.key === "ArrowDown") {
                event.preventDefault();
                changeVolume(-0.1);
            } else if (event.key === "f") {
                event.preventDefault();
                toggleFullscreen();
            } else if (event.key === "m") {
                event.preventDefault();
                toggleMute();
            }
        };

        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    });

    const enforceMobileFullscreen = async () => {
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video || typeof window === "undefined" || !navigator) return;

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (!isMobile) return;

        try {
            const isFs =
                document.fullscreenElement ||
                (document as any).webkitFullscreenElement;

            if (!isFs) {
                if (container.requestFullscreen) {
                    await container.requestFullscreen();
                } else if ((container as any).webkitRequestFullscreen) {
                    await (container as any).webkitRequestFullscreen();
                } else if ((video as any).webkitEnterFullscreen) {
                    (video as any).webkitEnterFullscreen();
                }
            }

            if (window.screen && window.screen.orientation && (window.screen.orientation as any).lock) {
                await (window.screen.orientation as any).lock("landscape");
            } else {
                if (window.innerHeight > window.innerWidth) {
                    setIsCssLandscape(true);
                }
            }
        } catch (err) {
            console.warn("Could not enforce mobile fullscreen or landscape", err);
            if (window.innerHeight > window.innerWidth) {
                setIsCssLandscape(true);
            }
        }
    };

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            const wasMuted = video.muted;
            void video.play().then(() => {
                setIsPlaying(true);
                void enforceMobileFullscreen();
            }).catch(() => {
                video.muted = true;
                setIsMuted(true);
                void video.play().then(() => {
                    setIsPlaying(true);
                    void enforceMobileFullscreen();
                    if (!wasMuted) {
                        video.muted = false;
                        setIsMuted(false);
                    }
                }).catch(() => {
                    video.muted = wasMuted;
                    setIsMuted(wasMuted);
                    setIsPlaying(false);
                });
            });
        } else {
            video.pause();
            setIsPlaying(false);
        }
    };

    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;
        const next = !video.muted;
        video.muted = next;
        setIsMuted(next);
    };

    const changeVolume = (delta: number) => {
        const video = videoRef.current;
        if (!video) return;
        const next = Math.min(1, Math.max(0, video.volume + delta));
        video.volume = next;
        setVolume(next);
        if (next === 0) {
            video.muted = true;
            setIsMuted(true);
        } else if (video.muted) {
            video.muted = false;
            setIsMuted(false);
        }
    };

    const handleVolumeChange = (value: number) => {
        const video = videoRef.current;
        if (!video) return;
        const vol = value / 100;
        video.volume = vol;
        video.muted = vol === 0;
        setVolume(vol);
        setIsMuted(vol === 0);
    };

    const seekRelative = (deltaSeconds: number) => {
        const video = videoRef.current;
        if (!video || !video.duration) return;
        const next = Math.min(video.duration, Math.max(0, video.currentTime + deltaSeconds));
        video.currentTime = next;
        setCurrentTime(next);
    };

    const handleSeekStart = () => {
        setIsScrubbing(true);
    };

    const handleSeekCommit = (percent: number) => {
        const video = videoRef.current;
        if (!video || !duration) return;
        const t = (percent / 100) * duration;
        video.currentTime = t;
        setCurrentTime(t);
        lastTimeRef.current = t;
        if (introEndSeconds && t >= introEndSeconds) {
            setShowSkipIntro(false);
            setHasSkippedIntro(true);
        }
        setIsScrubbing(false);
    };

    const getSeekPercent = (e: React.MouseEvent<HTMLDivElement>) => {
        const bar = seekBarRef.current;
        if (!bar) return 0;
        const rect = bar.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        return (x / rect.width) * 100;
    };

    const handleSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const percent = getSeekPercent(e);
        setScrubPercent(percent);
        handleSeekCommit(percent);
    };

    const handleSeekBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        handleSeekStart();
        const percent = getSeekPercent(e);
        setScrubPercent(percent);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const bar = seekBarRef.current;
            if (!bar) return;
            const rect = bar.getBoundingClientRect();
            const x = Math.max(0, Math.min(moveEvent.clientX - rect.left, rect.width));
            const p = (x / rect.width) * 100;
            setScrubPercent(p);
        };

        const handleMouseUp = (upEvent: MouseEvent) => {
            const bar = seekBarRef.current;
            if (bar) {
                const rect = bar.getBoundingClientRect();
                const x = Math.max(0, Math.min(upEvent.clientX - rect.left, rect.width));
                const p = (x / rect.width) * 100;
                handleSeekCommit(p);
            }
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleSeekBarTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        e.preventDefault();
        handleSeekStart();
        const bar = seekBarRef.current;
        if (!bar) return;
        const rect = bar.getBoundingClientRect();
        const touch = e.touches[0];
        const x = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
        setScrubPercent((x / rect.width) * 100);

        const handleTouchMove = (moveEvent: TouchEvent) => {
            moveEvent.preventDefault();
            const t = moveEvent.touches[0];
            const x2 = Math.max(0, Math.min(t.clientX - rect.left, rect.width));
            setScrubPercent((x2 / rect.width) * 100);
        };

        const handleTouchEnd = (endEvent: TouchEvent) => {
            const t = endEvent.changedTouches[0];
            const x2 = Math.max(0, Math.min(t.clientX - rect.left, rect.width));
            handleSeekCommit((x2 / rect.width) * 100);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        };

        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleTouchEnd);
    };

    const toggleFullscreen = () => {
        const container = containerRef.current;
        if (!container) return;

        const isFs =
            document.fullscreenElement ||
            (document as any).webkitFullscreenElement;

        if (isFs) {
            if (document.exitFullscreen) {
                void document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                void (document as any).webkitExitFullscreen();
            }
        } else {
            if (container.requestFullscreen) {
                void container.requestFullscreen();
            } else if ((container as any).webkitRequestFullscreen) {
                void (container as any).webkitRequestFullscreen();
            }
        }
    };

    const progressPercent = duration ? (currentTime / duration) * 100 : 0;
    const effectivePercent = isScrubbing ? scrubPercent : progressPercent;

    const showStreamReloadSpinner =
        !hasEnded &&
        (isStreamLoading ||
            (isPlaying && (isBuffering || !isPlayerReady)) ||
            (!isPlaying && !isPlayerReady));

    const changePlaybackSpeed = (speed: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.playbackRate = speed;
        setPlaybackSpeed(speed);
    };

    const useHlsQualityMenu = hlsQualityOptions.length > 0;
    const resolvedQualityOptions = useHlsQualityMenu
        ? hlsQualityOptions
        : qualityOptionsProp && qualityOptionsProp.length > 0
            ? qualityOptionsProp
            : [];
    const resolvedQualityValue = useHlsQualityMenu
        ? hlsQualityValue
        : qualityOptionsProp && qualityOptionsProp.length > 0
            ? currentQualityId ?? "auto"
            : "auto";

    const handleResolvedQualityChange = (id: string) => {
        if (hlsQualityOptions.length > 0) {
            const hls = hlsRef.current;
            if (!hls) return;
            if (id === "auto") {
                hls.loadLevel = -1;
                setHlsQualityValue("auto");
            } else {
                const n = Number(id.replace(/^lvl-/, ""));
                if (!Number.isNaN(n)) {
                    hls.loadLevel = n;
                    setHlsQualityValue(id);
                }
            }
            return;
        }
        if (qualityOptionsProp && qualityOptionsProp.length > 0) {
            onChangeQuality?.(id === "auto" ? null : id);
        }
    };

    return (
        <div
            className={`fixed inset-0 z-50 bg-black ${isCssLandscape ? "landscape-fallback" : ""}`}
        >
            <style dangerouslySetInnerHTML={{
                __html: `
                .landscape-fallback {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vh !important;
                    height: 100vw !important;
                    transform-origin: top left !important;
                    transform: translateY(-100%) rotate(90deg) !important;
                    overflow: hidden !important;
                }
            `}} />
            <div
                ref={containerRef}
                className="relative flex h-full w-full flex-col bg-black text-white overflow-hidden overscroll-none"
                onClick={(e) => {
                    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                    if (isMobile) {
                        void enforceMobileFullscreen();
                    }

                    if ((e.target as HTMLElement).closest('button, a, input, [role="button"], .pointer-events-auto')) {
                        return;
                    }

                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const width = rect.width;

                    if (clickTimeoutRef.current !== null) {
                        window.clearTimeout(clickTimeoutRef.current);
                        clickTimeoutRef.current = null;

                        if (x < width * 0.3) {
                            seekRelative(-10);
                        } else if (x > width * 0.7) {
                            seekRelative(10);
                        } else {
                            toggleFullscreen();
                        }
                        return;
                    }

                    if (Date.now() - lastWakeTimeRef.current < 500) {
                        clickTimeoutRef.current = window.setTimeout(() => {
                            clickTimeoutRef.current = null;
                        }, 300);
                        return;
                    }

                    if (!controlsVisible) {
                        setControlsVisible(true);
                        lastWakeTimeRef.current = Date.now();
                        clickTimeoutRef.current = window.setTimeout(() => {
                            clickTimeoutRef.current = null;
                        }, 300);
                    } else {
                        clickTimeoutRef.current = window.setTimeout(() => {
                            clickTimeoutRef.current = null;
                            togglePlay();
                        }, 300);
                    }
                }}
            >
                <video
                    ref={videoRef}
                    className="pointer-events-none absolute inset-0 h-full w-full bg-black object-cover lg:object-contain"
                    playsInline
                    preload="auto"
                    controls={false}
                />

                <Transition
                    show={controlsVisible}
                    as={Fragment}
                    enter="transition-opacity duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="transition-opacity duration-500"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute inset-x-0 top-0 h-28 sm:h-40 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 h-44 sm:h-64 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                    </div>
                </Transition>

                <Transition
                    show={controlsVisible}
                    as={Fragment}
                    enter="transition duration-300 ease-out"
                    enterFrom="opacity-0 -translate-y-4"
                    enterTo="opacity-100 translate-y-0"
                    leave="transition duration-500 ease-in"
                    leaveFrom="opacity-100 translate-y-0"
                    leaveTo="opacity-0 -translate-y-4"
                >
                    <div className="pointer-events-auto absolute inset-x-0 top-0 flex items-start justify-between px-3 sm:px-12 pt-[max(12px,env(safe-area-inset-top))] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] lg:pt-8 text-sm">
                        <div className="flex items-start gap-3 sm:gap-6">
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (durationRef.current > 0 && onProgressRef.current) {
                                        onProgressRef.current({
                                            positionSeconds: lastTimeRef.current,
                                            durationSeconds: durationRef.current,
                                            isFinished: false
                                        });
                                    }

                                    exitingFullscreenRef.current = true;
                                    const fsElement =
                                        document.fullscreenElement ||
                                        (document as any).webkitFullscreenElement;
                                    if (fsElement) {
                                        if (document.exitFullscreen) {
                                            void document.exitFullscreen().catch(() => { });
                                        } else if ((document as any).webkitExitFullscreen) {
                                            void ((document as any).webkitExitFullscreen)();
                                        }
                                    }

                                    if (onBack) {
                                        onBack();
                                    } else {
                                        history.back();
                                    }
                                }}
                                className="flex min-h-[44px] min-w-[44px] items-center justify-center transition-opacity opacity-80 hover:opacity-100 active:scale-95"
                                aria-label="Back"
                            >
                                <ArrowLeft className="h-6 w-6 sm:h-8 sm:w-8 text-white drop-shadow-md" strokeWidth={2.5} />
                            </button>
                            <div className="space-y-1.5 flex-1">
                                {title && (
                                    <p className="max-w-[200px] sm:max-w-2xl text-base sm:text-xl font-bold sm:text-3xl tracking-tight text-white drop-shadow-md line-clamp-1 sm:line-clamp-none">
                                        {title}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div
                            className="flex items-center gap-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {resolvedQualityOptions.length > 0 && (
                                <Menu
                                    label="Source"
                                    icon={<Settings className="h-5 w-5 sm:h-6 sm:w-6" />}
                                    value={resolvedQualityValue}
                                    options={resolvedQualityOptions.map((o) => ({ id: o.id, label: o.label }))}
                                    onChange={handleResolvedQualityChange}
                                    isOpen={activeMenu === "quality"}
                                    onToggle={(open) => {
                                        if (open) setActiveMenu("quality");
                                        else if (activeMenu === "quality") setActiveMenu(null);
                                    }}
                                    placement="top"
                                    noScale={true}
                                />
                            )}
                        </div>
                    </div>
                </Transition>

                <div className="pointer-events-none absolute inset-0 z-[70] flex items-center justify-center">
                    {!isPlaying &&
                        !isBuffering &&
                        isPlayerReady &&
                        !showStreamReloadSpinner && (
                            // pointer-events-auto + direct onClick keeps the gesture synchronous on mobile.
                            // The container's 300ms setTimeout path breaks Brave's autoplay gate.
                            <button
                                type="button"
                                aria-label="Play"
                                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                                className="pointer-events-auto flex h-16 w-16 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-black/60 border-2 border-white/20 backdrop-blur-md transition-transform hover:scale-110 shadow-[0_0_30px_rgba(0,0,0,0.5)] focus:outline-none"
                            >
                                <Play className="h-7 w-7 sm:h-10 sm:w-10 text-white fill-white ml-1 sm:ml-2 drop-shadow-lg" />
                            </button>
                        )}
                    {showStreamReloadSpinner && (
                        <div className="flex h-16 w-16 sm:h-24 sm:w-24 items-center justify-center">
                            <svg
                                className="animate-spin h-10 w-10 sm:h-16 sm:w-16 text-ncyan drop-shadow-[0_0_15px_rgba(6,182,212,0.8)]"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    className="opacity-20"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                ></circle>
                                <path
                                    className="opacity-100"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                            </svg>
                            <span className="sr-only">Loading</span>
                        </div>
                    )}
                </div>

                {showSkipIntro && !hasSkippedIntro && introEndSeconds && (
                    <div className="pointer-events-auto absolute bottom-20 right-4 sm:bottom-28 sm:right-6">
                        <button
                            type="button"
                            onClick={() => {
                                const video = videoRef.current;
                                if (!video || !duration) return;
                                const target = Math.min(duration, introEndSeconds);
                                video.currentTime = target;
                                setCurrentTime(target);
                                setShowSkipIntro(false);
                                setHasSkippedIntro(true);
                            }}
                            className="rounded border border-white/30 bg-black/60 backdrop-blur-sm px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-white hover:text-black hover:border-white min-h-[44px] transition-colors"
                        >
                            Skip Intro
                        </button>
                    </div>
                )}

                {hasEnded && nextEpisodeHref && (
                    <div className="pointer-events-auto absolute inset-0 flex items-end sm:items-center justify-center sm:justify-end px-4 sm:px-8 pb-24 sm:pb-0 animate-fade-in">
                        <div className="w-full max-w-sm rounded-xl bg-black/90 border border-white/10 p-5 shadow-2xl backdrop-blur-md">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ncyan mb-1">Up Next</p>
                            {nextEpisodeLabel && (
                                <p className="text-sm font-bold text-white mb-4 line-clamp-2">
                                    {nextEpisodeLabel}
                                </p>
                            )}
                            <div className="flex gap-3">
                                <Link
                                    href={nextEpisodeHref}
                                    replace
                                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-ncyan px-4 py-3 text-xs font-bold text-black hover:bg-ncyan-light transition-colors min-h-[44px]"
                                >
                                    <SkipForward className="h-4 w-4 fill-current" />
                                    Play Next
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => setHasEnded(false)}
                                    className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors min-h-[44px]"
                                >
                                    Stay
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <Transition
                    show={controlsVisible}
                    as={Fragment}
                    enter="transition duration-300 ease-out"
                    enterFrom="opacity-0 translate-y-8"
                    enterTo="opacity-100 translate-y-0"
                    leave="transition duration-500 ease-in"
                    leaveFrom="opacity-100 translate-y-0"
                    leaveTo="opacity-0 translate-y-8"
                >
                    <div
                        className="pointer-events-auto absolute inset-x-0 bottom-0 px-3 sm:px-12 pb-[max(4px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-1 lg:pb-12 lg:pt-2"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="space-y-2 sm:space-y-6">
                            <div className="group relative flex items-center gap-3">
                                {/* Hit area wrapper — no background, just extends touch target via padding */}
                                <div
                                    ref={seekBarRef}
                                    className="relative flex-1 cursor-pointer py-4 -my-4"
                                    style={{ touchAction: "none" }}
                                    onClick={handleSeekBarClick}
                                    onMouseDown={handleSeekBarMouseDown}
                                    onTouchStart={handleSeekBarTouchStart}
                                >
                                    {/* Visual track */}
                                    <div className="relative h-1 w-full rounded-full bg-white/15 overflow-hidden transition-[height] duration-150 group-hover:h-1.5">
                                        <div
                                            className="absolute inset-y-0 left-0 bg-white/25 rounded-full"
                                            style={{ width: `${bufferedPercent}%` }}
                                        />
                                        <div
                                            className="absolute inset-y-0 left-0 bg-ncyan rounded-full"
                                            style={{ width: `${effectivePercent}%` }}
                                        />
                                    </div>
                                    {/* Scrubber thumb */}
                                    <div
                                        className={`absolute top-1/2 h-3.5 w-3.5 rounded-full bg-white shadow-md pointer-events-none z-10 transition-[opacity,transform] duration-150 ${isScrubbing ? "opacity-100 scale-125" : "opacity-0 group-hover:opacity-100 scale-100"}`}
                                        style={{ left: `${effectivePercent}%`, transform: `translateX(-50%) translateY(-50%) ${isScrubbing ? "scale(1.25)" : "scale(1)"}` }}
                                    />
                                </div>
                                <div className="tabular-nums text-[11px] font-medium text-white/70 whitespace-nowrap select-none shrink-0">
                                    <span>{formatTime(currentTime)}</span>
                                    <span className="text-white/30 mx-1">/</span>
                                    <span className="text-white/50">{formatTime(duration)}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full">
                                <div className="flex items-center gap-4 sm:gap-6 justify-start">
                                    <button
                                        type="button"
                                        onClick={togglePlay}
                                        className="group flex h-11 w-11 sm:h-10 sm:w-10 items-center justify-center transition-all hover:scale-110 active:scale-90 focus:outline-none focus:ring-0"
                                        aria-label={isPlaying ? "Pause" : "Play"}
                                    >
                                        {isPlaying ? (
                                            <Pause className="h-6 w-6 sm:h-8 sm:w-8 text-white fill-white" />
                                        ) : (
                                            <Play className="h-6 w-6 sm:h-8 sm:w-8 text-white fill-white ml-0.5" />
                                        )}
                                    </button>

                                    <div className="flex items-center gap-3 sm:gap-4">
                                        <button
                                            type="button"
                                            onClick={() => seekRelative(-10)}
                                            className="group relative flex h-11 w-11 sm:h-auto sm:w-auto items-center justify-center transition-all hover:scale-110 active:scale-90 focus:outline-none focus:ring-0"
                                            aria-label="Rewind 10 seconds"
                                        >
                                            <RotateCcw className="h-5 w-5 sm:h-7 sm:w-7 text-white" />
                                            <span className="absolute text-[0.5rem] sm:text-[0.6rem] font-black text-white mt-0.5 sm:mt-1">10</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => seekRelative(10)}
                                            className="group relative flex h-11 w-11 sm:h-auto sm:w-auto items-center justify-center transition-all hover:scale-110 active:scale-90 focus:outline-none focus:ring-0"
                                            aria-label="Forward 10 seconds"
                                        >
                                            <RotateCw className="h-5 w-5 sm:h-7 sm:w-7 text-white" />
                                            <span className="absolute text-[0.5rem] sm:text-[0.6rem] font-black text-white mt-0.5 sm:mt-1">10</span>
                                        </button>
                                    </div>

                                    <div className="hidden sm:flex group relative items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={toggleMute}
                                            className="transition-transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-0"
                                            aria-label={isMuted ? "Unmute" : "Mute"}
                                        >
                                            {isMuted || volume === 0 ? (
                                                <VolumeX className="h-7 w-7 text-white" />
                                            ) : (
                                                <Volume2 className="h-7 w-7 text-white" />
                                            )}
                                        </button>
                                        <div className="w-0 overflow-hidden transition-all duration-300 group-hover:w-24 group-hover:ml-2">
                                            <input
                                                type="range"
                                                min={0}
                                                max={100}
                                                value={Math.round(volume * 100)}
                                                onChange={(event) => handleVolumeChange(Number(event.target.value))}
                                                className="w-20 cursor-pointer accent-ncyan h-1.5 appearance-none rounded-full bg-white/20 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                                                aria-label="Volume"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-center justify-center text-center px-2 sm:px-4 overflow-hidden">
                                    <span className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-[0.15em] truncate max-w-[120px] sm:max-w-xl">
                                        {episodeLabel}
                                    </span>
                                </div>

                                <div
                                    className="flex items-center gap-4 sm:gap-5 justify-end"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {!isMovie && (
                                        <>
                                            <Link
                                                href={nextEpisodeHref || "#"}
                                                replace
                                                className={`flex min-h-[44px] min-w-[44px] items-center justify-center p-2 text-white transition-all hover:scale-110 active:scale-95 focus:outline-none focus:ring-0 ${!nextEpisodeHref ? "opacity-20 grayscale pointer-events-none" : "hover:text-white"}`}
                                            >
                                                <SkipForward className="h-5 w-5 sm:h-7 sm:w-7 fill-current" />
                                            </Link>

                                            <div
                                                className="relative"
                                                onMouseEnter={() => {
                                                    if (episodesTimeoutRef.current) window.clearTimeout(episodesTimeoutRef.current);
                                                    setActiveMenu("episodes");
                                                }}
                                                onMouseLeave={() => {
                                                    episodesTimeoutRef.current = window.setTimeout(() => {
                                                        if (activeMenu === "episodes") setActiveMenu(null);
                                                    }, 200);
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (activeMenu === "episodes") setActiveMenu(null);
                                                        else setActiveMenu("episodes");
                                                        onShowEpisodes?.();
                                                    }}
                                                    className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full p-2 text-white transition-all hover:scale-110 active:scale-95 focus:outline-none focus:ring-0 ${activeMenu === "episodes" ? "text-ncyan" : ""}`}
                                                    aria-label="Episodes"
                                                >
                                                    <Layers className="h-5 w-5 sm:h-7 sm:w-7" />
                                                </button>

                                                <EpisodesPanel
                                                    showId={showId || ""}
                                                    showTitle={title || "Episodes"}
                                                    episodes={episodes || []}
                                                    currentEpisode={progressEpisodeKey || ""}
                                                    isOpen={activeMenu === "episodes"}
                                                    onClose={() => setActiveMenu(null)}
                                                    seasons={seasons}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {(subtitleTracks.length > 0 || (languageOptions && languageOptions.length > 0)) && (
                                        <TwoColumnMenu
                                            label="Audio & Subtitles"
                                            icon={<MessageSquare className="h-5 w-5 sm:h-7 sm:w-7" />}
                                            sections={[
                                                {
                                                    title: "Audio",
                                                    options: (languageOptions || []).map(o => ({ id: `audio-${o.id}`, label: o.label }))
                                                },
                                                {
                                                    title: "Subtitles",
                                                    options: [
                                                        { id: "sub--1", label: "Off" },
                                                        ...subtitleTracks.map(t => ({ id: `sub-${t.id}`, label: t.name }))
                                                    ]
                                                }
                                            ]}
                                            activeIds={[
                                                `audio-${hlsActualLanguageId ?? selectedAudioLanguageId ?? currentLanguageId ?? ""}`,
                                                `sub-${currentSubtitleId ?? -1}`
                                            ]}
                                            onSelect={(id) => {
                                                if (id.startsWith("audio-")) {
                                                    const langId = id.replace("audio-", "");
                                                    setSelectedAudioLanguageId(langId);
                                                    setHlsActualLanguageId(null);
                                                    onChangeLanguage?.(langId);
                                                } else if (id.startsWith("sub-")) {
                                                    const subId = Number(id.replace("sub-", ""));
                                                    const video = videoRef.current;
                                                    const hls = hlsRef.current;

                                                    if (subId >= 100 && video) {
                                                        const nativeIdx = subId - 100;
                                                        for (let i = 0; i < video.textTracks.length; i++) {
                                                            video.textTracks[i].mode = i === nativeIdx ? "showing" : "disabled";
                                                        }
                                                        setCurrentSubtitleId(subId);
                                                    } else if (hls) {
                                                        (hls as any).subtitleTrack = subId;
                                                        setCurrentSubtitleId(subId);
                                                    }
                                                }
                                            }}
                                            isOpen={activeMenu === "audio"}
                                            onToggle={(open) => {
                                                if (open) setActiveMenu("audio");
                                                else if (activeMenu === "audio") setActiveMenu(null);
                                            }}
                                        />
                                    )}

                                    <Menu
                                        label="Playback Speed"
                                        icon={<Gauge className="h-5 w-5 sm:h-7 sm:w-7" />}
                                        value={playbackSpeed.toString()}
                                        options={[
                                            { id: "0.5", label: "0.5x" },
                                            { id: "0.75", label: "0.75x" },
                                            { id: "1", label: "Normal" },
                                            { id: "1.25", label: "1.25x" },
                                            { id: "1.5", label: "1.5x" },
                                            { id: "2", label: "2x" }
                                        ]}
                                        onChange={(id) => changePlaybackSpeed(Number(id))}
                                        isOpen={activeMenu === "speed"}
                                        onToggle={(open) => {
                                            if (open) setActiveMenu("speed");
                                            else if (activeMenu === "speed") setActiveMenu(null);
                                        }}
                                        activeIds={[playbackSpeed.toString()]}
                                    />

                                    {!isMobileDevice && (
                                        <button
                                            type="button"
                                            onClick={toggleFullscreen}
                                            className="flex min-h-[44px] min-w-[44px] items-center justify-center text-white transition-transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-0"
                                            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                                        >
                                            {isFullscreen ? (
                                                <Minimize className="h-7 w-7" />
                                            ) : (
                                                <Maximize className="h-7 w-7" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </Transition>
            </div>
        </div>
    );
}

function Menu({
    label,
    icon,
    value,
    options,
    onChange,
    isOpen,
    onToggle,
    activeIds,
    placement = "bottom",
    noScale
}: {
    label: string;
    icon: ReactNode;
    value: string | null;
    options: { id: string; label: string }[];
    onChange: (id: string) => void;
    isOpen: boolean;
    onToggle: (open: boolean) => void;
    activeIds?: string[];
    placement?: "top" | "bottom";
    noScale?: boolean;
}) {
    const timeoutRef = useRef<number | null>(null);

    const handleMouseEnter = () => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        onToggle(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = window.setTimeout(() => {
            if (isOpen) {
                onToggle(false);
            }
        }, 150);
    };

    return (
        <div
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <button
                type="button"
                aria-label={label}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle(!isOpen);
                }}
                className={`flex items-center gap-2 rounded-full p-2 text-white transition-all focus:outline-none focus:ring-0 min-h-[44px] min-w-[44px] justify-center ${noScale ? "" : "hover:scale-110"}`}
            >
                {icon}
            </button>

            <Transition
                show={isOpen}
                as={Fragment}
                enter="transition duration-150 ease-out"
                enterFrom="opacity-0 scale-95 translate-y-2"
                enterTo="opacity-100 scale-100 translate-y-0"
                leave="transition duration-100 ease-in"
                leaveFrom="opacity-100 scale-100 translate-y-0"
                leaveTo="opacity-0 scale-95 translate-y-2"
            >
                <div className={`hidden sm:block absolute ${placement === "top" ? "top-full" : "bottom-full"} right-0 ${placement === "top" ? "mt-4" : "mb-4"} w-48 max-h-[70vh] overflow-y-auto player-menu-popover p-2 z-50`}>
                    <div className="px-3 py-2 text-[0.65rem] font-black uppercase tracking-[0.2em] text-neutral-500 border-b border-white/5 mb-1">
                        {label}
                    </div>
                    {options.map(opt => (
                        <MenuOption
                            key={opt.id}
                            active={activeIds ? activeIds.includes(opt.id) : value === opt.id}
                            onClick={() => { onChange(opt.id); onToggle(false); }}
                        >
                            {opt.label}
                        </MenuOption>
                    ))}
                </div>
            </Transition>

            <Transition
                show={isOpen}
                as={Fragment}
                enter="transition duration-200 ease-out"
                enterFrom="opacity-0 translate-y-full"
                enterTo="opacity-100 translate-y-0"
                leave="transition duration-150 ease-in"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 translate-y-full"
            >
                <div className="sm:hidden fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); onToggle(false); }}>
                    <div className="player-menu-scrim" />
                    <div className="player-menu-sheet max-h-[60vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="player-menu-sheet-handle" />
                        <div className="px-2 py-1 text-xs font-black uppercase tracking-[0.2em] text-neutral-500 mb-2">
                            {label}
                        </div>
                        {options.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => { onChange(opt.id); onToggle(false); }}
                                className={`flex w-full items-center justify-between px-4 py-3.5 text-sm text-left rounded-lg transition-colors focus:outline-none focus:ring-0 ${(activeIds ? activeIds.includes(opt.id) : value === opt.id)
                                    ? "bg-white/10 text-white font-bold"
                                    : "text-neutral-400 active:bg-white/5"
                                    }`}
                            >
                                <span>{opt.label}</span>
                                {(activeIds ? activeIds.includes(opt.id) : value === opt.id) && <Check className="h-4 w-4 text-white stroke-[4px]" />}
                            </button>
                        ))}
                    </div>
                </div>
            </Transition>
        </div>
    );
}

function TwoColumnMenu({
    label,
    icon,
    sections,
    isOpen,
    onToggle,
    activeIds,
    onSelect
}: {
    label: string;
    icon: ReactNode;
    sections: { title: string; options: { id: string; label: string }[] }[];
    isOpen: boolean;
    onToggle: (open: boolean) => void;
    activeIds: string[];
    onSelect: (id: string) => void;
}) {
    const timeoutRef = useRef<number | null>(null);

    const handleMouseEnter = () => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        onToggle(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = window.setTimeout(() => {
            if (isOpen) {
                onToggle(false);
            }
        }, 150);
    };

    return (
        <div
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <button
                type="button"
                aria-label={label}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle(!isOpen);
                }}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full p-2 text-white transition-all hover:scale-110 focus:outline-none focus:ring-0"
            >
                {icon}
            </button>

            <Transition
                show={isOpen}
                as={Fragment}
                enter="transition duration-150 ease-out"
                enterFrom="opacity-0 scale-95 translate-y-2"
                enterTo="opacity-100 scale-100 translate-y-0"
                leave="transition duration-100 ease-in"
                leaveFrom="opacity-100 scale-100 translate-y-0"
                leaveTo="opacity-0 scale-95 translate-y-2"
            >
                <div className="hidden sm:flex absolute bottom-full right-0 mb-4 w-[480px] max-h-[75vh] overflow-hidden player-menu-popover z-50">
                    {sections.map((section, idx) => (
                        <div key={section.title} className={`flex-1 flex flex-col min-w-0 ${idx === 0 ? "border-r border-white/10" : ""}`}>
                            <div className="px-8 py-6 text-xl font-black uppercase tracking-[0.2em] text-neutral-500 border-b border-white/5">
                                {section.title}
                            </div>
                            <div className="flex-1 overflow-y-auto px-2 pb-6 space-y-0.5 custom-scrollbar">
                                {section.options.map(opt => {
                                    const isActive = activeIds.includes(opt.id);
                                    return (
                                        <button
                                            key={opt.id}
                                            onClick={() => { onSelect(opt.id); }}
                                            className={`group relative flex w-full items-center gap-8 px-6 py-2.5 text-lg text-left transition-colors focus:outline-none focus:ring-0 ${isActive
                                                ? "text-white font-bold"
                                                : "text-neutral-400 hover:text-white"
                                                }`}
                                        >
                                            <div className="w-6 flex shrink-0 justify-center">
                                                {isActive && <Check className="h-6 w-6 text-white stroke-[3px]" />}
                                            </div>
                                            <span className="truncate">{opt.label}</span>

                                            {!isActive && (
                                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-ncyan transition-all group-hover:h-3/4 rounded-r-full shadow-[0_0_8px_rgba(6,182,212,0.4)]" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </Transition>

            <Transition
                show={isOpen}
                as={Fragment}
                enter="transition duration-200 ease-out"
                enterFrom="opacity-0 translate-y-full"
                enterTo="opacity-100 translate-y-0"
                leave="transition duration-150 ease-in"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 translate-y-full"
            >
                <div className="sm:hidden fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); onToggle(false); }}>
                    <div className="player-menu-scrim" />
                    <div className="player-menu-sheet max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="player-menu-sheet-handle" />
                        {sections.map((section, idx) => (
                            <div key={section.title} className={`${idx > 0 ? "mt-4 pt-4 border-t border-white/10" : ""}`}>
                                <div className="px-2 py-1 text-xs font-black uppercase tracking-[0.2em] text-neutral-500 mb-1">
                                    {section.title}
                                </div>
                                <div className="space-y-0.5">
                                    {section.options.map(opt => {
                                        const isActive = activeIds.includes(opt.id);
                                        return (
                                            <button
                                                key={opt.id}
                                                onClick={() => { onSelect(opt.id); }}
                                                className={`flex w-full items-center gap-4 px-4 py-3.5 text-sm text-left rounded-lg transition-colors focus:outline-none focus:ring-0 ${isActive
                                                    ? "bg-white/10 text-white font-bold"
                                                    : "text-neutral-400 active:bg-white/5"
                                                    }`}
                                            >
                                                <div className="w-5 flex shrink-0 justify-center">
                                                    {isActive && <Check className="h-4 w-4 text-white stroke-[3px]" />}
                                                </div>
                                                <span className="truncate">{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Transition>
        </div>
    );
}



function MenuOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`flex w-full items-center justify-between px-3 py-2 text-sm text-left rounded-lg transition-colors focus:outline-none focus:ring-0 ${active
                ? "bg-white/10 text-white font-bold"
                : "text-neutral-400 hover:bg-white/5 hover:text-white"
                }`}
        >
            <span>{children}</span>
            {active && <Check className="h-4 w-4 text-white stroke-[4px]" />}
        </button>
    );
}

