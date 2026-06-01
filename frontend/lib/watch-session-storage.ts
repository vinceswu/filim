/** sessionStorage keys for resume / play state across hard refresh (Ctrl+R). */

function sessionResumeKey(showId: string, episodeKey: string): string {
    return `filim.resume.${encodeURIComponent(showId)}.${encodeURIComponent(episodeKey)}`;
}

export function sessionPlayingKey(showId: string, episodeKey: string): string {
    return `filim.playing.${encodeURIComponent(showId)}.${encodeURIComponent(episodeKey)}`;
}

type SessionPlayIntent = {
    resumePlay: boolean;
    /** `video.muted` before navigation — used to restore after muted autoplay unlock. */
    videoMuted: boolean;
};

export function writeSessionPlayIntent(
    showId: string,
    episodeKey: string,
    intent: SessionPlayIntent
): void {
    if (typeof window === "undefined" || !showId || !episodeKey) return;
    try {
        sessionStorage.setItem(
            sessionPlayingKey(showId, episodeKey),
            JSON.stringify(intent)
        );
    } catch {
        /* ignore */
    }
}

/** Peek only — caller removes with `sessionStorage.removeItem(sessionPlayingKey(...))` after handling. */
export function readSessionPlayIntent(
    showId: string,
    episodeKey: string
): SessionPlayIntent | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(sessionPlayingKey(showId, episodeKey));
        if (raw == null) return null;
        if (raw === "1") {
            return { resumePlay: true, videoMuted: false };
        }
        if (raw === "0") {
            return null;
        }
        const j = JSON.parse(raw) as {
            resumePlay?: unknown;
            videoMuted?: unknown;
        };
        if (j && j.resumePlay === true) {
            return { resumePlay: true, videoMuted: !!j.videoMuted };
        }
        return null;
    } catch {
        return null;
    }
}

type SessionResumePayload = {
    position_seconds: number;
    duration_seconds?: number;
};

export function readSessionResume(
    showId: string,
    episodeKey: string
): SessionResumePayload | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(sessionResumeKey(showId, episodeKey));
        if (!raw) return null;
        const j = JSON.parse(raw) as {
            position_seconds?: unknown;
            duration_seconds?: unknown;
        };
        if (typeof j.position_seconds !== "number" || j.position_seconds < 0) return null;
        return {
            position_seconds: j.position_seconds,
            duration_seconds:
                typeof j.duration_seconds === "number" ? j.duration_seconds : undefined
        };
    } catch {
        return null;
    }
}

export function writeSessionResume(
    showId: string,
    episodeKey: string,
    positionSeconds: number,
    durationSeconds: number
): void {
    if (typeof window === "undefined" || !showId || !episodeKey) return;
    try {
        sessionStorage.setItem(
            sessionResumeKey(showId, episodeKey),
            JSON.stringify({
                position_seconds: positionSeconds,
                duration_seconds: durationSeconds,
                t: Date.now()
            })
        );
    } catch {
        /* quota / private mode */
    }
}

export function mergeResumeFromSessionAndApi(
    fromSession: SessionResumePayload | null,
    fromApi: { position_seconds: number; duration_seconds: number } | null
): number | null {
    const dur =
        fromApi?.duration_seconds ??
        fromSession?.duration_seconds ??
        0;
    let best = 0;
    if (fromApi && fromApi.position_seconds > best) best = fromApi.position_seconds;
    if (fromSession && fromSession.position_seconds > best) best = fromSession.position_seconds;
    if (best <= 0) return null;
    if (dur > 0 && best >= dur - 0.25) return null;
    return best;
}
