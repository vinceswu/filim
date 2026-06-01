"use client";

import { ShowCard, type ShowSummaryCard as ShowSummary } from "./ShowCard";
import { UseInfiniteQueryResult } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";
import { usePreferences } from "@/hooks/usePreferences";

interface GridViewProps {
    title: string;
    infiniteQuery: UseInfiniteQueryResult<any>;
    emptyMessage?: string;
}

export function GridView({
    title,
    infiniteQuery,
    emptyMessage = "No titles found.",
}: GridViewProps) {
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        isError,
    } = infiniteQuery;

    const { handleToggleList, isInList } = usePreferences();

    const { ref, inView } = useInView({
        threshold: 0,
        rootMargin: "400px",
    });

    useEffect(() => {
        if (inView && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
        }
    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

    const allItems: ShowSummary[] = (() => {
        const raw: ShowSummary[] = data?.pages?.flatMap((page: any) => {
            if (Array.isArray(page)) return page;
            if (page && typeof page === 'object' && 'items' in page) return page.items;
            return [];
        }) || [];
        // Deduplicate by id to prevent repeated cards across pages
        const seen = new Set<string>();
        return raw.filter((item) => {
            if (!item.id || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
    })();

    const isSearchTitle = title.toLowerCase().includes("search");

    return (
        <div className={`px-[4%] ${isSearchTitle ? "pt-16" : "pt-28"} md:pt-24 pb-12`}>
            <h2 className={`${title.toLowerCase().includes("search") ? "block" : "hidden md:block"} text-xl md:text-2xl font-black text-white mb-6`}>
                {title}
            </h2>

            {isLoading && allItems.length === 0 ? (
                <div className="flex items-center gap-2 py-4">
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-ncyan rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1.5 h-1.5 bg-ncyan rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 bg-ncyan rounded-full animate-bounce"></div>
                    </div>
                </div>
            ) : isError ? (
                <p className="text-sm text-red-400">Something went wrong. Please try again.</p>
            ) : allItems.length > 0 ? (
                <>
                    <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-2 gap-y-6 md:gap-4">
                        {allItems.map((row: ShowSummary) => (
                            <ShowCard
                                key={row.id}
                                show={row}
                                isInList={isInList(row.id)}
                                onToggleList={() => handleToggleList(row.id)}
                                widthClassName="w-full"
                            />
                        ))}
                    </div>

                    <div ref={ref} className="min-h-[80px] flex items-center justify-center w-full mt-8">
                        {isFetchingNextPage ? (
                            <div className="flex flex-col items-center gap-2 py-4">
                                <div className="flex gap-1">
                                    <div className="w-1.5 h-1.5 bg-ncyan rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-1.5 h-1.5 bg-ncyan rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-1.5 h-1.5 bg-ncyan rounded-full animate-bounce"></div>
                                </div>
                            </div>
                        ) : !hasNextPage && allItems.length > 0 ? (
                            <div className="py-8 text-center animate-fade-in w-full max-w-2xl mx-auto px-4">
                                <div className="h-px w-full bg-gradient-to-r from-transparent via-neutral-800 to-transparent mb-6" />
                                <div className="space-y-2">
                                    <h3 className="text-base md:text-lg font-bold text-white/70">
                                        That’s all for now.
                                    </h3>
                                    <p className="text-[10px] md:text-xs text-neutral-600 font-medium max-w-md mx-auto uppercase tracking-widest">
                                        You&apos;ve reached the end
                                    </p>
                                </div>
                                <button
                                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                                    className="mt-6 text-[10px] font-bold text-neutral-500 hover:text-ncyan transition-colors uppercase tracking-[0.2em] border border-neutral-800/50 px-4 py-1.5 rounded-full"
                                >
                                    Back to Top ↑
                                </button>
                            </div>
                        ) : null}
                    </div>
                </>
            ) : !isLoading ? (
                <p className="text-sm text-neutral-500">{emptyMessage}</p>
            ) : null}
        </div>
    );
}
