"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/http";
import Link from "next/link";
import Image from "next/image";
import { ShowCard, type ShowSummaryCard as ShowSummary } from "@/components/ShowCard";
import { SectionRow } from "@/components/SectionRow";
import { useSearchParams, useRouter } from "next/navigation";
import { handlePlayWithFullscreen } from "@/lib/fullscreen";
import { ContinueCard } from "@/components/ContinueCard";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { usePreferences } from "@/hooks/usePreferences";
import { useProfile } from "@/lib/profile-context";

type ContinueWatchingItem = {
    show_id: string;
    episode: string;
    progress: number;
    position_seconds?: number;
    duration_seconds?: number;
    show_title?: string | null;
    cover_image_url?: string | null;
};

type RecommendationSection = {
    id: string;
    title: string;
    items: ShowSummary[];
};

type DiscoveryPage = {
    sections: RecommendationSection[];
    next_cursor: number | null;
};

import { GridView } from "@/components/GridView";
import { FilimLoadingSurface } from "@/components/FilimLoadingSurface";

function genreKey(title: string): string {
    return title
        .toLowerCase()
        .replace(/^(top|best|popular|trending|new|classic|must.watch|hidden|great|all|more)\s+/g, "")
        .replace(/\s+(shows?|anime|series|titles?|picks?|finds?|content|films?)$/g, "")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .join(" ");
}

export default function HomePage() {
    const router = useRouter();
    const { profile, isReady } = useProfile();
    const searchParams = useSearchParams();
    const urlQuery = searchParams.get("q") || "";
    const urlGenres = searchParams.get("genres") || "";

    const [billboardImageReady, setBillboardImageReady] = useState(false);
    const prevFeaturedIdRef = useRef<string | undefined>();

    const continueWatching = useQuery({
        queryKey: ["continue-watching", profile?.id],
        enabled: isReady && !!profile?.id && !profile?.is_guest,
        queryFn: async () => {
            const res = await api.get<{ items: ContinueWatchingItem[] }>(
                "/user/continue-watching"
            );
            return res.data.items;
        },
        staleTime: 30 * 1000,
    });

    const recommendations = useQuery({
        queryKey: ["recommendations", profile?.id],
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const res = await api.get<{ sections: RecommendationSection[] }>(
                "/user/recommendations"
            );
            return res.data.sections;
        }
    });

    const discovery = useInfiniteQuery({
        queryKey: ["discovery", profile?.id],
        enabled: isReady,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        maxPages: 50,
        queryFn: async ({ pageParam = 0 }) => {
            const res = await api.get<DiscoveryPage>(
                "/user/recommendations/discovery",
                { params: { cursor: pageParam, limit: 5 } }
            );
            return res.data;
        },
        getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
        initialPageParam: 0,
    });

    // Recs: stable, item-dedup only. Separate memo so discovery page loads don't recompute this.
    const deduplicatedRecommendations = useMemo(() => {
        const seenItems = new Set<string>();
        return (recommendations.data ?? [])
            .map((s): RecommendationSection | null => {
                const items = s.items.filter((item) => {
                    if (seenItems.has(item.id)) return false;
                    seenItems.add(item.id);
                    return true;
                });
                return items.length > 0 ? { ...s, items } : null;
            })
            .filter((s): s is RecommendationSection => s !== null);
    }, [recommendations.data]);

    // Discovery: incremental accumulation — only process new pages, never recompute old ones.
    // This prevents existing carousels from blinking or re-rendering when a new page loads.
    const [discoverySections, setDiscoverySections] = useState<RecommendationSection[]>([]);
    const discoveryDedupeRef = useRef({
        seenItems: new Set<string>(),
        seenGenreKeys: new Set<string>(),
        seenSectionIds: new Set<string>(),
        processedPageCount: 0,
    });

    // When recs load/change, seed the discovery dedup state and reset accumulated sections.
    useEffect(() => {
        const state = discoveryDedupeRef.current;
        state.seenItems = new Set(
            (recommendations.data ?? []).flatMap((s) => s.items.map((i) => i.id))
        );
        state.seenGenreKeys = new Set(
            (recommendations.data ?? []).map((s) => genreKey(s.title))
        );
        state.seenSectionIds = new Set();
        state.processedPageCount = 0;
        setDiscoverySections([]);
    }, [recommendations.data]);

    // Append only new pages — never touch already-rendered sections.
    useEffect(() => {
        const pages = discovery.data?.pages ?? [];
        const state = discoveryDedupeRef.current;
        const newPages = pages.slice(state.processedPageCount);
        if (newPages.length === 0) return;

        const newSections: RecommendationSection[] = [];
        for (const page of newPages) {
            for (const s of page.sections) {
                if (state.seenSectionIds.has(s.id)) continue;
                state.seenSectionIds.add(s.id);
                const gk = genreKey(s.title);
                if (state.seenGenreKeys.has(gk)) continue;
                state.seenGenreKeys.add(gk);
                const items = s.items.filter((item) => {
                    if (state.seenItems.has(item.id)) return false;
                    state.seenItems.add(item.id);
                    return true;
                });
                if (items.length > 0) newSections.push({ ...s, items });
            }
        }
        state.processedPageCount = pages.length;
        if (newSections.length > 0) {
            setDiscoverySections((prev) => [...prev, ...newSections]);
        }
    }, [discovery.data?.pages]);

    const { ref, inView } = useInView({
        threshold: 0,
        rootMargin: "700px",
    });

    const { fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: discoveryLoading, data: discoveryData } = discovery;

    useEffect(() => {
        if (!inView || !discoveryData || discoveryLoading || !hasNextPage || isFetchingNextPage) return;
        void fetchNextPage();
    }, [inView, discoveryData, discoveryLoading, hasNextPage, isFetchingNextPage, fetchNextPage]);

    const searchResults = useInfiniteQuery({
        queryKey: ["search", urlQuery, urlGenres],
        enabled: urlQuery.length > 0 || urlGenres.length > 0,
        queryFn: async ({ pageParam = 1 }) => {
            const res = await api.get<{ items: ShowSummary[] }>("/catalog/search", {
                params: {
                    q: urlQuery,
                    genres: urlGenres,
                    mode: "sub",
                    page: pageParam
                }
            });
            return res.data;
        },
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage || lastPage.items.length === 0) return undefined;
            return allPages.length + 1;
        },
        initialPageParam: 1,
    });

    const { handleToggleList, isInList } = usePreferences();

    const lockedFeaturedShowRef = useRef<ShowSummary | undefined>();
    useEffect(() => { lockedFeaturedShowRef.current = undefined; }, [profile?.id]);
    const featuredShow = useMemo(() => {
        // Once locked in, never change — prevents billboard from blinking on discovery page loads.
        if (lockedFeaturedShowRef.current) return lockedFeaturedShowRef.current;
        // Prefer recs; discovery items are intentionally excluded to avoid dep on discoverySections.
        const items = recommendations.data?.flatMap((s) => s.items) ?? [];
        if (items.length === 0) return undefined;
        const inProgressIds = new Set(continueWatching.data?.map((i) => i.show_id) ?? []);
        const candidates = items.filter((a) => !inProgressIds.has(a.id));
        if (candidates.length === 0) return undefined;
        const withBanners = candidates.filter((a) => a.banner_image_url?.startsWith("http"));
        const withPosters = candidates.filter((a) => a.poster_image_url?.startsWith("http"));
        const pool = withBanners.length > 0 ? withBanners : withPosters.length > 0 ? withPosters : candidates;
        const dayIndex = Math.floor(Date.now() / 86_400_000);
        const profileSeed = profile?.id
            ? profile.id.charCodeAt(0) + profile.id.charCodeAt(profile.id.length - 1)
            : 0;
        const result = pool[(dayIndex + profileSeed) % Math.min(pool.length, 5)];
        lockedFeaturedShowRef.current = result;
        return result;
    }, [recommendations.data, continueWatching.data, profile?.id]);

    useEffect(() => {
        if (featuredShow?.id !== prevFeaturedIdRef.current) {
            prevFeaturedIdRef.current = featuredShow?.id;
            setBillboardImageReady(false);
        }
    }, [featuredShow?.id]);

    const billboardResumeHref = (() => {
        if (!featuredShow) return "#";
        const progress = continueWatching.data?.find(item => item.show_id === featuredShow.id);
        if (progress && progress.episode) {
            return `/watch/${featuredShow.id}/${progress.episode}`;
        }
        return `/watch/${featuredShow.id}/1`;
    })();

    const handleBillboardPlay = (e: React.MouseEvent) => {
        if (billboardResumeHref.startsWith("/watch/")) {
            e.preventDefault();
            handlePlayWithFullscreen(billboardResumeHref, router);
        }
    };

    const isInitialLoading = recommendations.isLoading;
    const hasImageToLoad = !!featuredShow && !!(featuredShow.banner_image_url || featuredShow.poster_image_url);
    const billboardReady = billboardImageReady || !hasImageToLoad;
    const showSplash = isInitialLoading || (hasImageToLoad && !billboardImageReady);

    return (
        <div className="min-h-screen">
            {urlQuery || urlGenres ? (
                <GridView
                    title={urlGenres ? `Genre: ${urlGenres}` : `Search results for "${urlQuery}"`}
                    infiniteQuery={searchResults as any}
                    emptyMessage="No results found."
                />
            ) : (
                <>
                    <FilimLoadingSurface show={showSplash} className="z-[90]" />

                    {featuredShow ? (
                        <section className="relative w-full h-[56vh] md:h-[80vh] min-h-[320px] md:min-h-[500px]">
                            <div className={`absolute inset-0 transition-opacity duration-500 ease-out ${billboardReady ? "opacity-100" : "opacity-0"}`}>
                                {featuredShow.banner_image_url || featuredShow.poster_image_url ? (
                                    <Image
                                        src={featuredShow.banner_image_url || (featuredShow.poster_image_url as string)}
                                        alt={featuredShow.title}
                                        fill
                                        priority
                                        sizes="100vw"
                                        className="object-cover"
                                        onLoad={() => setBillboardImageReady(true)}
                                        onError={() => setBillboardImageReady(true)}
                                    />
                                ) : null}
                                <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
                                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
                                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
                            </div>
                            <div className={`relative z-10 flex h-full items-end pb-16 md:pb-24 lg:pb-32 px-[4%] transition-opacity duration-300 ease-out ${billboardReady ? "opacity-100" : "opacity-0"}`}>
                                <div className="max-w-lg animate-fade-in-up space-y-3 md:space-y-4">
                                    <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1.1] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                                        {featuredShow.title}
                                    </h1>
                                    {featuredShow.synopsis && (
                                        <p className="text-xs md:text-sm lg:text-base text-neutral-200 line-clamp-2 md:line-clamp-3 leading-relaxed">
                                            {featuredShow.synopsis}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-2 md:gap-3 pt-1">
                                        <Link
                                            href={billboardResumeHref}
                                            onClick={handleBillboardPlay}
                                            className="inline-flex items-center gap-2 rounded bg-ncyan px-5 md:px-6 py-2.5 md:py-2.5 text-sm font-bold text-black hover:bg-ncyan-light transition-colors shadow-lg shadow-ncyan/20 min-h-[44px]"
                                        >
                                            <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5 shrink-0" fill="currentColor">
                                                <path d="M6 4l15 8-15 8V4z" />
                                            </svg>
                                            Play
                                        </Link>
                                        <Link
                                            href={`/show/${featuredShow.id}`}
                                            className="flex items-center gap-2 rounded bg-neutral-500/50 px-4 md:px-6 py-2.5 md:py-2.5 text-xs md:text-sm font-bold text-white transition hover:bg-neutral-500/70 backdrop-blur-md min-h-[44px]"
                                        >
                                            <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="16" x2="12" y2="12" />
                                                <line x1="12" y1="8" x2="12.01" y2="8" />
                                            </svg>
                                            More Info
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </section>
                    ) : !isInitialLoading ? (
                        <div className="w-full h-[20vh] min-h-[120px]" />
                    ) : null}

                    <div className="relative z-10 -mt-10 md:-mt-16 space-y-4 md:space-y-6 pb-4">
                        {continueWatching.data && continueWatching.data.length > 0 && (
                            <div className="animate-fade-in-up">
                                <SectionRow title="Continue Watching">
                                    {continueWatching.data
                                        .filter(
                                            (item) =>
                                                item.show_id &&
                                                item.show_id !== "undefined" &&
                                                item.episode &&
                                                item.episode !== "undefined"
                                        )
                                        .map((item) => {
                                            return (
                                                <ContinueCard
                                                    key={`${item.show_id}-${item.episode}`}
                                                    title={
                                                        item.show_title && item.show_title.length > 0
                                                            ? item.show_title
                                                            : `Episode ${item.episode}`
                                                    }
                                                    subtitle={`Episode ${item.episode}`}
                                                    href={`/watch/${item.show_id}/${item.episode}`}
                                                    coverImageUrl={item.cover_image_url ?? undefined}
                                                    progress={item.progress}
                                                    positionSeconds={item.position_seconds}
                                                    durationSeconds={item.duration_seconds}
                                                    isInList={isInList(item.show_id)}
                                                    onToggleList={() => handleToggleList(item.show_id)}
                                                    showId={item.show_id}
                                                />
                                            );
                                        })}
                                </SectionRow>
                            </div>
                        )}

                        {deduplicatedRecommendations.map((section, index) => (
                            <div
                                key={section.id}
                                className="animate-fade-in-up"
                                style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
                            >
                                <SectionRow title={section.title}>
                                    {section.items.map((row) => (
                                        <ShowCard
                                            key={row.id}
                                            show={row}
                                            isInList={isInList(row.id)}
                                            onToggleList={() => handleToggleList(row.id)}
                                        />
                                    ))}
                                </SectionRow>
                            </div>
                        ))}

                        {discoverySections.map((section) => (
                            <div
                                key={section.id}
                                className="animate-fade-in"
                            >
                                <SectionRow title={section.title}>
                                    {section.items.map((row) => (
                                        <ShowCard
                                            key={row.id}
                                            show={row}
                                            isInList={isInList(row.id)}
                                            onToggleList={() => handleToggleList(row.id)}
                                        />
                                    ))}
                                </SectionRow>
                            </div>
                        ))}

                        <div ref={ref} className="min-h-[100px] flex items-center justify-center w-full">
                            {!discovery.hasNextPage && discovery.data && discoverySections.length > 0 ? (
                                <div className="py-12 text-center animate-fade-in w-full max-w-2xl mx-auto px-4">
                                    <div className="h-px w-full bg-gradient-to-r from-transparent via-neutral-800 to-transparent mb-8" />
                                    <div className="space-y-3">
                                        <h3 className="text-lg md:text-xl font-black text-white/80">
                                            That&apos;s all for now.
                                        </h3>
                                        <p className="text-[10px] md:text-xs text-neutral-600 font-bold max-w-md mx-auto uppercase tracking-[0.3em]">
                                            Catalog Exhausted
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                                        className="mt-8 text-[10px] font-bold text-neutral-500 hover:text-ncyan transition-all uppercase tracking-[0.2em] border border-neutral-800 hover:border-ncyan/30 px-6 py-2 rounded-full bg-neutral-900/50"
                                    >
                                        Back to Top ↑
                                    </button>
                                </div>
                            ) : (
                                <div className={`flex flex-col items-center gap-2 py-8 transition-opacity duration-300 ${discovery.isFetchingNextPage ? "opacity-100" : "opacity-0"}`}>
                                    <div className="flex gap-1.5">
                                        <div className="w-2 h-2 bg-ncyan rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                        <div className="w-2 h-2 bg-ncyan rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                        <div className="w-2 h-2 bg-ncyan rounded-full animate-bounce"></div>
                                    </div>
                                    <p className="text-[10px] font-bold text-ncyan/50 uppercase tracking-[0.2em] mt-2">Discovering</p>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
