"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { api } from "@/lib/http";
import { episodesMatchForProgress } from "@/lib/episode-match";
import {
    mergeResumeFromSessionAndApi,
    readSessionResume,
    writeSessionResume
} from "@/lib/watch-session-storage";
import { Player } from "@/components/Player";
import { WatchProvider, useWatch } from "./WatchContext";

type EpisodeSummary = {
    number: string;
    title?: string | null;
    duration_seconds?: number | null;
};

type WatchShowDetails = {
    id: string;
    title: string;
    episode_count: number;
    episodes: EpisodeSummary[];
    synopsis?: string | null;
    cover_image_url?: string | null;
    tags?: string[];
    available_audio_languages?: string[];
};

function WatchLayoutInner({ children }: { children: React.ReactNode }) {
    const params = useParams<{ showId: string; episode: string }>();
    const router = useRouter();
    const { state, setEpisodeData } = useWatch();
    /** Set only after a stream fetch succeeds; avoids treating language/quality refetches as "same visit" and skipping progress. */
    const streamCommittedRouteKeyRef = useRef<string | null>(null);

    const [language, setLanguage] = useState<string>("ja");
    const languageRef = useRef(language);
    languageRef.current = language;
    // Incremented only on user-initiated language changes; avoids re-triggering fetchStream
    // when fetchStream itself calls setLanguage after reading the audio preference.
    const [languageTrigger, setLanguageTrigger] = useState(0);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const refreshAttemptedRef = useRef(false);
    const pendingRefreshRef = useRef(false);
    const [selectedQualityId, setSelectedQualityId] = useState<string | null>(null);
    const [showDetails, setShowDetails] = useState<WatchShowDetails | null>(null);
    const [seasons, setSeasons] = useState<{ id: string; title: string }[]>([]);

    const routeIds = useMemo(() => {
        const { showId, episode } = params;
        if (showId && showId !== "undefined" && episode && episode !== "undefined") {
            return {
                showId: decodeURIComponent(showId),
                episode: decodeURIComponent(episode)
            };
        }
        return null;
    }, [params]);

    const routeKey = routeIds ? `${routeIds.showId}/${routeIds.episode}` : null;

    const qualityHint = useMemo(() => {
        if (selectedQualityId == null) return undefined;
        const v = state.variants.find((x) => x.id === selectedQualityId);
        return v?.resolution ?? undefined;
    }, [selectedQualityId, state.variants]);

    useEffect(() => {
        refreshAttemptedRef.current = false;
        pendingRefreshRef.current = false;
    }, [routeKey]);

    useEffect(() => {
        if (!routeIds || !routeKey) return;

        const ids = routeIds;

        const committed = streamCommittedRouteKeyRef.current;
        const isEpisodeChange = committed !== null && committed !== routeKey;
        const applyServerResume = committed === null || isEpisodeChange;

        if (isEpisodeChange) {
            setSelectedQualityId(null);
        }

        const qualityParam = isEpisodeChange ? undefined : qualityHint;
        const variantParam = isEpisodeChange ? null : selectedQualityId;

        let cancelled = false;

        async function fetchStream() {
            const isRefresh = pendingRefreshRef.current;
            pendingRefreshRef.current = false;

            setEpisodeData({
                isPageLoading: true,
                error: null,
                ...(isEpisodeChange || isRefresh
                    ? {
                        manifestUrl: null,
                        variants: [],
                        audioLanguages: undefined
                    }
                    : {})
            });

            try {
                let resumePosition: number | null = null;
                if (applyServerResume) {
                    const fromSession = readSessionResume(ids.showId, ids.episode);
                    let fromApi: {
                        position_seconds: number;
                        duration_seconds: number;
                    } | null = null;
                    try {
                        const progressRes = await api.get<{
                            items: { episode: string; position_seconds: number; duration_seconds: number }[];
                        }>(`/user/progress/${ids.showId}`);
                        const match = progressRes.data.items.find((i) =>
                            episodesMatchForProgress(i.episode, ids.episode)
                        );
                        if (match && match.position_seconds < match.duration_seconds) {
                            fromApi = {
                                position_seconds: match.position_seconds,
                                duration_seconds: match.duration_seconds
                            };
                        }
                    } catch {
                        /* ignore */
                    }
                    resumePosition = mergeResumeFromSessionAndApi(fromSession, fromApi);
                }

                let streamLanguage = languageRef.current;
                // Only read API preference on first-ever load (committed === null).
                // Episode changes within a session preserve the user's active selection.
                if (committed === null) {
                    try {
                        const prefRes = await api.get<{ item: { audio_language_id: string } | null }>(
                            "/user/audio-preference"
                        );
                        const pref = prefRes.data.item?.audio_language_id;
                        if (pref === "ja" || pref === "en") streamLanguage = pref;
                        else if (pref === "sub") streamLanguage = "ja";
                        else if (pref === "dub") streamLanguage = "en";
                    } catch {
                        /* ignore */
                    }
                    if (streamLanguage !== language) {
                        setLanguage(streamLanguage);
                    }
                }

                languageRef.current = streamLanguage;

                const streamRes = await api.get<{
                    manifest_url: string;
                    variants: { id: string; resolution?: string | null; provider?: string | null; kind: string }[];
                    audio_languages?: { id: string; code?: string | null; label: string; is_default?: boolean }[];
                }>(`/stream/${ids.showId}/episodes/${ids.episode}/stream`, {
                    params: {
                        language: streamLanguage,
                        ...(qualityParam ? { quality: qualityParam } : {}),
                        ...(variantParam ? { variant: variantParam } : {}),
                        ...(isRefresh ? { refresh: true } : {})
                    }
                });

                if (!cancelled) {
                    setEpisodeData({
                        manifestUrl: streamRes.data.manifest_url,
                        variants: streamRes.data.variants,
                        audioLanguages: streamRes.data.audio_languages,
                        isPageLoading: false,
                        error: null,
                        ...(applyServerResume ? { resumePositionSeconds: resumePosition } : {})
                    });
                    streamCommittedRouteKeyRef.current = routeKey;
                }
            } catch (err: unknown) {
                if (!cancelled) {
                    if (!refreshAttemptedRef.current) {
                        refreshAttemptedRef.current = true;
                        pendingRefreshRef.current = true;
                        setRefreshTrigger(t => t + 1);
                    } else {
                        const message =
                            err instanceof Error ? err.message : "Episode unavailable.";
                        setEpisodeData({
                            error: message,
                            isPageLoading: false
                        });
                    }
                }
            }
        }

        void fetchStream();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routeKey, routeIds, languageTrigger, qualityHint, selectedQualityId, setEpisodeData, refreshTrigger]);

    useEffect(() => {
        let cancelled = false;
        async function fetchDetails() {
            if (!routeIds?.showId) return;
            try {
                const res = await api.get<WatchShowDetails>(`/catalog/${routeIds.showId}`);
                if (cancelled) return;

                const sortedEpisodes = (res.data.episodes || []).sort((a, b) => {
                    const aNum = parseFloat(String(a.number).replace(/[^0-9.]/g, ""));
                    const bNum = parseFloat(String(b.number).replace(/[^0-9.]/g, ""));
                    return aNum - bNum;
                });
                setShowDetails({ ...res.data, episodes: sortedEpisodes });

                try {
                    const seriesRes = await api.get<{ items: { id: string; title: string }[] }>(
                        `/catalog/${routeIds.showId}/series`
                    );
                    if (cancelled) return;
                    setSeasons(() => {
                        const newList = [...seriesRes.data.items];
                        if (!newList.find(s => s.id === res.data.id)) {
                            newList.unshift({ id: res.data.id, title: res.data.title });
                        }
                        return newList;
                    });
                } catch { /* ignore */ }
            } catch (err) {
                console.warn("Failed to load show details", err);
            }
        }
        void fetchDetails();
        return () => { cancelled = true; };
    }, [routeIds?.showId]);

    const episodeMeta = useMemo(() => {
        if (!showDetails || !routeIds) return null;
        return showDetails.episodes.find((ep) => {
            const epNum = String(ep.number).toLowerCase().replace(/^e/, '');
            const routeNum = String(routeIds.episode).toLowerCase().replace(/^e/, '');
            return epNum === routeNum || epNum.padStart(2, '0') === routeNum.padStart(2, '0');
        }) ?? null;
    }, [showDetails, routeIds]);

    const episodeLabel = episodeMeta
        ? `E${episodeMeta.number}${episodeMeta.title ? ` • ${episodeMeta.title}` : ""}`
        : `E${routeIds?.episode ?? "?"}`;

    const nextEpisode = useMemo(() => {
        if (!showDetails || !episodeMeta) return null;
        const index = showDetails.episodes.findIndex((ep) => ep.number === episodeMeta.number);
        return showDetails.episodes[index + 1] ?? null;
    }, [showDetails, episodeMeta]);

    const nextEpisodeHref = nextEpisode ? `/watch/${showDetails?.id}/${nextEpisode.number}` : undefined;
    const nextEpisodeLabel = nextEpisode ? `Episode ${nextEpisode.number}${nextEpisode.title ? ` • ${nextEpisode.title}` : ""}` : undefined;

    const languageOptions = useMemo(() => {
        if (showDetails?.available_audio_languages?.length) {
            return showDetails.available_audio_languages.map(code => ({
                id: code,
                label: code === "en" ? "English" : "Japanese (日本語)"
            }));
        }
        return [{ id: "ja", label: "Japanese (日本語)" }, { id: "en", label: "English" }];
    }, [showDetails]);

    const handleChangeLanguage = useCallback((nextId: string) => {
        refreshAttemptedRef.current = false;
        pendingRefreshRef.current = false;
        setLanguage(nextId);
        setLanguageTrigger(t => t + 1);
        api.post("/user/audio-preference", { audio_language_id: nextId }).catch(() => { });
    }, []);

    const handleChangeQuality = useCallback((qualityId: string | null) => {
        refreshAttemptedRef.current = false;
        pendingRefreshRef.current = false;
        setSelectedQualityId(qualityId);
    }, []);

    const stableQualityOptions = useMemo(
        () => [
            { id: "auto", label: "Auto", value: null as string | null },
            ...state.variants.map((v) => ({
                id: v.id,
                label: v.resolution ? `${v.resolution} (${v.provider || "Source"})` : (v.provider || "Source"),
                value: v.resolution ?? null
            }))
        ],
        [state.variants]
    );

    const handleProgress = useCallback((payload: any) => {
        if (!routeIds) return;
        writeSessionResume(
            routeIds.showId,
            routeIds.episode,
            payload.positionSeconds,
            payload.durationSeconds
        );
        api.post("/user/progress", {
            show_id: routeIds.showId,
            episode: routeIds.episode,
            position_seconds: payload.positionSeconds,
            duration_seconds: payload.durationSeconds,
            is_finished: payload.isFinished
        }).catch(() => { });
    }, [routeIds]);

    const handleBack = useCallback(() => router.back(), [router]);

    const handlePlayerError = useCallback(() => {
        if (refreshAttemptedRef.current) {
            setEpisodeData({ error: "Stream unavailable. Try a different source or episode.", isPageLoading: false });
            return;
        }
        refreshAttemptedRef.current = true;
        pendingRefreshRef.current = true;
        setRefreshTrigger(t => t + 1);
    }, [setEpisodeData]);

    // Show loading spinner immediately when route changes, before the useEffect fires
    const hasUncommittedChange =
        streamCommittedRouteKeyRef.current !== null && streamCommittedRouteKeyRef.current !== routeKey;
    const isStreamLoading = state.isPageLoading || hasUncommittedChange;

    return (
        <main className="h-screen w-screen overflow-hidden bg-black text-white">
            <div className="relative h-full w-full bg-black">
                {!state.error && (
                    <Player
                        source={isStreamLoading && hasUncommittedChange ? undefined : (state.manifestUrl ? { url: state.manifestUrl } : undefined)}
                        isStreamLoading={isStreamLoading}
                        title={showDetails?.title}
                        episodeLabel={episodeLabel}
                        onBack={handleBack}
                        audioLanguages={state.audioLanguages?.map(l => ({
                            id: l.id, label: l.label, code: l.code ?? null, isDefault: l.is_default ?? false
                        }))}
                        languageOptions={languageOptions}
                        currentLanguageId={language}
                        onChangeLanguage={handleChangeLanguage}
                        initialTimeSeconds={state.resumePositionSeconds ?? undefined}
                        onProgress={handleProgress}
                        onError={handlePlayerError}
                        introEndSeconds={episodeMeta?.duration_seconds && episodeMeta.duration_seconds > 900 ? 90 : undefined}
                        nextEpisodeHref={nextEpisodeHref}
                        nextEpisodeLabel={nextEpisodeLabel}
                        qualityOptions={stableQualityOptions}
                        currentQualityId={selectedQualityId ?? "auto"}
                        onChangeQuality={handleChangeQuality}
                        showId={showDetails?.id || routeIds?.showId}
                        progressEpisodeKey={routeIds?.episode}
                        episodes={showDetails?.episodes || []}
                        seasons={seasons}
                        isMovie={showDetails?.episode_count === 1}
                    />
                )}

                {state.error && (
                    <div className="flex h-full w-full items-center justify-center px-4 text-center">
                        <div className="space-y-2">
                            <p className="text-sm text-red-300">{state.error}</p>
                            <p className="text-xs text-neutral-300">Try a different episode or title.</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="hidden">{children}</div>
        </main>
    );
}

export default function WatchLayout({ children }: { children: React.ReactNode }) {
    return (
        <WatchProvider>
            <WatchLayoutInner>{children}</WatchLayoutInner>
        </WatchProvider>
    );
}
