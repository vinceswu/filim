"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ShowCard, type ShowSummaryCard } from "./ShowCard";
import { useMemo, useState } from "react";
import { useProfile } from "@/lib/profile-context";
import { handlePlayWithFullscreen } from "@/lib/fullscreen";

type Episode = {
    number: string;
    title?: string | null;
};

type ShowDetails = {
    id: string;
    title: string;
    episode_count: number;
    episodes: Episode[];
    synopsis?: string | null;
    cover_image_url?: string | null;
    tags?: string[];
    available_audio_languages?: string[];
};

type PreferenceItem = {
    show_id: string;
    in_list: boolean;
};

interface ShowDetailViewProps {
    id: string;
    initialData?: ShowDetails;
}

function MoreLikeThisDiscovering() {
    return (
        <div className="flex min-h-[120px] w-full flex-col items-center justify-center gap-2 py-10">
            <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-ncyan rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 bg-ncyan rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 bg-ncyan rounded-full animate-bounce" />
            </div>
            <p className="text-[10px] font-bold text-ncyan/50 uppercase tracking-[0.2em] mt-2">
                Discovering
            </p>
        </div>
    );
}

export function ShowDetailView({ id, initialData }: ShowDetailViewProps) {
    const queryClient = useQueryClient();
    const router = useRouter();
    const { profile } = useProfile();

    const {
        data,
        isLoading
    } = useQuery({
        queryKey: ["show", id],
        initialData,
        queryFn: async () => {
            const res = await api.get<ShowDetails>(`/catalog/${id}`);
            return res.data;
        }
    });

    const similar = useQuery({
        queryKey: ["show-similar", id],
        enabled: !!id,
        queryFn: async () => {
            const res = await api.get<{ items: ShowSummaryCard[] }>(
                `/catalog/${id}/similar`,
                { params: { limit: 12 } }
            );
            return res.data.items;
        }
    });

    const relatedFromSimilar = useMemo(
        () =>
            (similar.data ?? []).filter(
                (item) => item.id && item.id !== id
            ),
        [similar.data, id]
    );

    const genreTags = useMemo(() => {
        const raw = data?.tags ?? [];
        const seen = new Set<string>();
        const out: string[] = [];
        for (const t of raw) {
            const s = t.trim();
            if (!s || seen.has(s.toLowerCase())) continue;
            seen.add(s.toLowerCase());
            out.push(s);
        }
        return out;
    }, [data?.tags]);

    const genreTagsKey = genreTags.join("|");

    const genreFallback = useQuery({
        queryKey: ["show-genre-fallback", id, genreTagsKey],
        enabled:
            !!id &&
            !!data &&
            genreTags.length > 0 &&
            similar.isSuccess &&
            relatedFromSimilar.length === 0,
        queryFn: async () => {
            const seen = new Set<string>();
            if (id) seen.add(id);
            const out: ShowSummaryCard[] = [];

            const normalizedGenres = genreTags.map((g) => g.trim().toLowerCase());

            const hasRequiredGenre = (item: ShowSummaryCard) => {
                if (!item.tags || item.tags.length === 0) return false;
                return item.tags.some((t) =>
                    normalizedGenres.includes(t.trim().toLowerCase())
                );
            };

            const pushBatch = (items: ShowSummaryCard[], requireGenre = false) => {
                for (const item of items) {
                    if (!item.id || seen.has(item.id)) continue;
                    if (requireGenre && !hasRequiredGenre(item)) continue;
                    seen.add(item.id);
                    out.push(item);
                    if (out.length >= 18) return;
                }
            };

            try {
                const combined = await api.get<{ items: ShowSummaryCard[] }>(
                    "/catalog/search",
                    {
                        params: {
                            q: "",
                            genres: genreTags.join(","),
                            mode: "sub",
                            page: 1
                        }
                    }
                );
                pushBatch(combined.data.items, true);
            } catch {
                /* ignore */
            }

            for (const tag of genreTags) {
                if (out.length >= 18) break;
                try {
                    const res = await api.get<{ items: ShowSummaryCard[] }>(
                        "/catalog/search",
                        {
                            params: {
                                q: "",
                                genres: tag,
                                mode: "sub",
                                page: 1
                            }
                        }
                    );
                    pushBatch(res.data.items, true);
                } catch {
                    /* ignore */
                }
            }

            for (const tag of genreTags) {
                if (out.length >= 18) break;
                try {
                    const res = await api.get<{ items: ShowSummaryCard[] }>(
                        "/catalog/search",
                        {
                            params: { q: tag, mode: "sub", page: 1 }
                        }
                    );
                    pushBatch(res.data.items, true);
                } catch {
                    /* ignore */
                }
            }

            return out;
        }
    });

    const trendingFallback = useQuery({
        queryKey: ["show-more-trending", id],
        enabled:
            !!id &&
            !!data &&
            similar.isSuccess &&
            relatedFromSimilar.length === 0 &&
            genreTags.length === 0,
        queryFn: async () => {
            const res = await api.get<{ items: ShowSummaryCard[] }>(
                "/catalog/trending",
                { params: { page: 1 } }
            );
            return res.data.items;
        }
    });

    const moreLikeThisItems = useMemo(() => {
        if (relatedFromSimilar.length > 0) {
            return relatedFromSimilar.slice(0, 12);
        }
        const fromGenre = (genreFallback.data ?? []).filter(
            (item) => item.id && item.id !== id
        );
        if (fromGenre.length > 0) {
            return fromGenre.slice(0, 12);
        }
        return (trendingFallback.data ?? [])
            .filter((item) => item.id && item.id !== id)
            .slice(0, 12);
    }, [
        relatedFromSimilar,
        genreFallback.data,
        trendingFallback.data,
        id
    ]);

    const moreLikeThisLoading =
        similar.isPending ||
        (similar.isSuccess &&
            relatedFromSimilar.length === 0 &&
            genreTags.length > 0 &&
            genreFallback.isPending) ||
        (similar.isSuccess &&
            relatedFromSimilar.length === 0 &&
            genreTags.length === 0 &&
            trendingFallback.isPending);

    const preferences = useQuery({
        queryKey: ["preferences"],
        enabled: !profile?.is_guest,
        queryFn: async () => {
            const res = await api.get<{ items: PreferenceItem[] }>("/user/preferences");
            return res.data.items;
        }
    });

    const continueWatching = useQuery({
        queryKey: ["continue-watching", profile?.id],
        enabled: !profile?.is_guest,
        queryFn: async () => {
            const res = await api.get<{ items: { show_id: string; episode: string }[] }>("/user/continue-watching");
            return res.data.items;
        }
    });

    const showProgress = useQuery({
        queryKey: ["show-progress", id],
        enabled: !!id && !profile?.is_guest,
        queryFn: async () => {
            const res = await api.get<{ items: { show_id: string; episode: string; progress: number }[] }>(`/user/progress/${id}`);
            return res.data.items;
        }
    });

    const getPreferenceForShow = (showId: string): PreferenceItem | undefined => {
        return preferences.data?.find((item) => item.show_id === showId);
    };

    const toggleList = useMutation({
        mutationFn: async (payload: { showId: string; inList: boolean }) => {
            await api.post("/user/preferences/list", {
                show_id: payload.showId,
                in_list: payload.inList
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["preferences"] });
        }
    });



    const series = useQuery({
        queryKey: ["show-series", id],
        enabled: !!id,
        queryFn: async () => {
            const res = await api.get<{ items: ShowSummaryCard[] }>(
                `/catalog/${id}/series`
            );
            return res.data.items;
        }
    });

    const filteredSeasons = (series.data || []).filter(s =>
        /season|s\d+|part|cour/i.test(s.title) ||
        s.id === id
    );

    const currentSeason = filteredSeasons.find(s => s.id === id) || filteredSeasons[0];

    const [synopsisExpanded, setSynopsisExpanded] = useState(false);
    const EPISODES_PER_PAGE = 20;
    const [episodePage, setEpisodePage] = useState(0);

    if (isLoading || !data) {
        return (
            <div className="w-full bg-background min-h-[600px] flex flex-col">
                <div className="relative aspect-video w-full bg-neutral-900 animate-shimmer" />
                <div className="p-4 md:p-8 space-y-6">
                    <div className="h-8 w-64 bg-neutral-800 rounded animate-shimmer" />
                    <div className="space-y-2">
                        <div className="h-4 w-full bg-neutral-800 rounded animate-shimmer" />
                        <div className="h-4 w-5/6 bg-neutral-800 rounded animate-shimmer" />
                    </div>
                </div>
            </div>
        );
    }

    const cleanSynopsis = data.synopsis?.replace(/\(Source:.*?\)/g, "").trim();

    const handleToggleList = (showId: string) => {
        const current = getPreferenceForShow(showId);
        const nextInList = !current?.in_list;
        toggleList.mutate({ showId, inList: nextInList });
    };



    const sortedEpisodes = [...data.episodes].sort((a, b) => {
        const numA = parseFloat(a.number);
        const numB = parseFloat(b.number);
        return numA - numB;
    });

    const progress = continueWatching.data?.find(item => item.show_id === data?.id);
    const hasProgress = !!progress?.episode;

    const resumeHref = (() => {
        if (!data) return "#";
        if (hasProgress) {
            return `/watch/${data.id}/${progress.episode}`;
        }
        return `/watch/${data.id}/${sortedEpisodes[0]?.number || "1"}`;
    })();

    return (
        <div className="w-full bg-background flex flex-col rounded-xl overflow-hidden">
            <section className="relative aspect-[16/9] md:aspect-video w-full overflow-hidden">
                {data.cover_image_url && (
                    <Image
                        src={data.cover_image_url}
                        alt={data.title}
                        fill
                        priority
                        unoptimized
                        sizes="100vw"
                        className="object-cover"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 flex flex-col gap-3 md:gap-4">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white drop-shadow-2xl">
                        {data.title}
                    </h1>
                    <div className="flex items-center gap-2 md:gap-3">
                        <Link
                            href={resumeHref}
                            onClick={(e) => {
                                e.preventDefault();
                                handlePlayWithFullscreen(resumeHref, router);
                            }}
                            className="inline-flex items-center gap-2 rounded bg-ncyan px-5 md:px-8 py-2.5 md:py-2.5 text-sm md:text-base font-bold text-black hover:bg-ncyan-light transition-colors shadow-lg shadow-ncyan/20 min-h-[44px]"
                        >
                            <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6" fill="currentColor">
                                <path d="M6 4l15 8-15 8V4z" />
                            </svg>
                            {hasProgress ? "Resume" : "Play"}
                        </Link>
                        {!profile?.is_guest && (
                            <button
                                onClick={() => handleToggleList(data.id)}
                                className="flex h-9 w-9 md:h-11 md:w-11 items-center justify-center rounded-full border-2 border-neutral-400 text-white hover:border-white transition-colors bg-black/40"
                            >
                                {getPreferenceForShow(data.id)?.in_list ? (
                                    <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6" fill="currentColor">
                                        <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6" fill="currentColor">
                                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                                    </svg>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </section>

            <div className="p-4 md:p-8 space-y-8 md:space-y-12">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
                    <div className="md:col-span-2 space-y-4 md:space-y-6">
                        <div className="flex items-center gap-2 text-xs md:text-sm text-neutral-400 font-semibold">
                            {data.episode_count > 0 && (
                                <span>{data.episode_count} {data.episode_count === 1 ? "Episode" : "Episodes"}</span>
                            )}
                            {data.available_audio_languages && data.available_audio_languages.length > 0 && (
                                <div className="flex items-center gap-1">
                                    {data.available_audio_languages.includes("ja") && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-neutral-600 text-neutral-300">SUB</span>
                                    )}
                                    {data.available_audio_languages.includes("en") && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-neutral-600 text-neutral-300">DUB</span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="text-[13px] md:text-lg text-white leading-relaxed whitespace-pre-wrap">
                            {synopsisExpanded ? (
                                <>
                                    {cleanSynopsis}
                                    {(cleanSynopsis?.length || 0) > 300 && (
                                        <button
                                            onClick={() => setSynopsisExpanded(false)}
                                            className="ml-1 text-neutral-400 hover:text-white font-bold transition-colors inline-block"
                                        >
                                            less
                                        </button>
                                    )}
                                </>
                            ) : (cleanSynopsis?.length || 0) <= 300 ? (
                                cleanSynopsis
                            ) : (
                                <>
                                    {cleanSynopsis?.slice(0, 300)}...
                                    <button
                                        onClick={() => setSynopsisExpanded(true)}
                                        className="ml-1 text-neutral-400 hover:text-white font-bold transition-colors inline-block"
                                    >
                                        more
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <span className="text-xs text-neutral-500 font-bold">Genres:</span>
                            <div className="flex flex-wrap gap-2">
                                {genreTags.map(tag => (
                                    <Link
                                        key={tag}
                                        href={`/?genres=${encodeURIComponent(tag)}`}
                                        className="text-xs text-white hover:text-ncyan hover:underline cursor-pointer transition-colors"
                                    >
                                        {tag}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <section className="space-y-4 md:space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight">
                                {filteredSeasons.length > 1 ? currentSeason?.title : "Episodes"}
                            </h2>
                        </div>
                        {filteredSeasons.length > 1 && (
                            <select
                                value={data.id}
                                onChange={(e) => {
                                    router.push(`/show/${e.target.value}`, { scroll: false });
                                }}
                                className="bg-neutral-800 text-white text-[0.65rem] md:text-xs font-black uppercase tracking-widest py-2 md:py-2.5 px-3 md:px-4 rounded border border-white/10 outline-none hover:bg-neutral-700 transition-colors cursor-pointer"
                            >
                                {filteredSeasons.map(item => (
                                    <option key={item.id} value={item.id}>{item.title}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {sortedEpisodes.length > EPISODES_PER_PAGE && (
                        <div className="flex items-center gap-2 flex-wrap">
                            {Array.from({ length: Math.ceil(sortedEpisodes.length / EPISODES_PER_PAGE) }).map((_, i) => {
                                const start = i * EPISODES_PER_PAGE + 1;
                                const end = Math.min((i + 1) * EPISODES_PER_PAGE, sortedEpisodes.length);
                                return (
                                    <button
                                        key={i}
                                        onClick={() => setEpisodePage(i)}
                                        className={`text-xs font-bold px-3 py-1.5 rounded border transition-colors ${episodePage === i ? "bg-white text-black border-white" : "border-neutral-700 text-neutral-400 hover:border-neutral-400 hover:text-white"}`}
                                    >
                                        {start}–{end}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        {sortedEpisodes.slice(episodePage * EPISODES_PER_PAGE, (episodePage + 1) * EPISODES_PER_PAGE).map((ep, idx) => {
                            const globalIdx = episodePage * EPISODES_PER_PAGE + idx;
                            const epProgress = showProgress.data?.find(p => p.episode === ep.number);
                            const progressPercent = epProgress ? Math.min(Math.max(epProgress.progress * 100, 0), 100) : 0;

                            return (
                                <Link
                                    key={ep.number}
                                    href={`/watch/${data.id}/${ep.number}`}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handlePlayWithFullscreen(`/watch/${data.id}/${ep.number}`, router);
                                    }}
                                    className="group flex items-center text-left gap-3 md:gap-6 p-3 py-4 md:p-4 rounded-lg bg-neutral-900/50 hover:bg-neutral-800 active:bg-neutral-700 transition-colors border-b border-neutral-800/50 last:border-0"
                                >
                                    <span className="text-lg md:text-2xl font-black text-neutral-600 w-6 md:w-8 text-center shrink-0">
                                        {globalIdx + 1}
                                    </span>

                                    <div className="relative aspect-video w-28 sm:w-36 md:w-48 overflow-hidden rounded bg-neutral-800 flex-shrink-0 hidden sm:block">
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 z-10">
                                            <svg viewBox="0 0 24 24" className="w-8 md:w-10 h-8 md:h-10 text-white" fill="currentColor">
                                                <path d="M6 4l15 8-15 8V4z" />
                                            </svg>
                                        </div>
                                        {data.cover_image_url && (
                                            <Image
                                                src={data.cover_image_url}
                                                alt={ep.title || `Episode ${ep.number}`}
                                                fill
                                                unoptimized
                                                sizes="192px"
                                                className="object-cover opacity-60"
                                            />
                                        )}
                                        {progressPercent > 0 && (
                                            <div className="absolute bottom-0 left-0 right-0 h-1 md:h-1.5 bg-neutral-600/50 z-20">
                                                <div
                                                    className="h-full bg-ncyan transition-all duration-300"
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0 py-1 md:py-2 flex flex-col justify-center">
                                        <div className="flex items-center justify-between gap-2 md:gap-4 mb-1 md:mb-2">
                                            <h3 className="text-sm md:text-base font-bold text-white truncate">
                                                {ep.title || `Episode ${ep.number}`}
                                            </h3>
                                            <svg viewBox="0 0 24 24" className="w-4 h-4 text-neutral-500 shrink-0 sm:hidden" fill="currentColor">
                                                <path d="M6 4l15 8-15 8V4z" />
                                            </svg>
                                        </div>
                                        {progressPercent > 0 && (
                                            <div className="mt-2 h-1 w-full bg-neutral-600/50 rounded overflow-hidden sm:hidden">
                                                <div
                                                    className="h-full bg-ncyan transition-all duration-300"
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </section>

                <section className="space-y-4 md:space-y-6">
                    <div className="space-y-1">
                        <h2 className="text-xl md:text-2xl font-black text-white">
                            More Like This
                        </h2>
                        {!moreLikeThisLoading &&
                            moreLikeThisItems.length > 0 &&
                            relatedFromSimilar.length === 0 && (
                                <p className="text-xs md:text-sm text-neutral-500 font-medium">
                                    {genreTags.length > 0
                                        ? `Based on genres: ${genreTags.slice(0, 8).join(", ")}${genreTags.length > 8 ? "…" : ""}`
                                        : "Popular right now"}
                                </p>
                            )}
                    </div>
                    {moreLikeThisLoading ? (
                        <MoreLikeThisDiscovering />
                    ) : moreLikeThisItems.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-3 gap-x-2 gap-y-4 md:gap-4">
                            {moreLikeThisItems.map((card) => (
                                <ShowCard
                                    key={card.id}
                                    show={card}
                                    isInList={
                                        getPreferenceForShow(card.id)?.in_list ?? false
                                    }
                                    onToggleList={() => handleToggleList(card.id)}
                                    widthClassName="w-full"
                                    variant="simple"
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-white/5 bg-neutral-900/30 px-4 py-8">
                            <p className="text-center text-sm text-neutral-500">
                                No suggestions available yet.
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
