"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, Fragment } from "react";
import { ChevronLeft, Check, Play } from "lucide-react";
import { Transition } from "@headlessui/react";

type EpisodeSummary = {
    number: string;
    title?: string | null;
    description?: string | null;
    thumbnail_url?: string | null;
    duration_seconds?: number | null;
    progress_percent?: number;
};

type EpisodesPanelProps = {
    showId: string;
    showTitle?: string;
    episodes: EpisodeSummary[];
    currentEpisode: string;
    isOpen: boolean;
    onClose: () => void;
    seasons?: { id: string; title: string }[];
};

export function EpisodesPanel({
    showId,
    showTitle,
    episodes: initialEpisodes,
    currentEpisode,
    isOpen,
    onClose,
    seasons = []
}: EpisodesPanelProps) {
    const router = useRouter();
    const [mode, setMode] = useState<"episodes" | "seasons">("episodes");
    const [focusedEpisode, setFocusedEpisode] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setMode("episodes");
            setFocusedEpisode(currentEpisode);
        }
    }, [isOpen, currentEpisode]);

    const filteredSeasons = seasons.filter(s =>
        /season|s\d+|part|cour/i.test(s.title) ||
        s.id === showId
    );

    const currentSeason = filteredSeasons.find((s) => s.id === showId) || filteredSeasons[0];

    const episodeList = (isMobile: boolean) => (
        <>
            {mode === "episodes" ? (
                <div className={`flex flex-col min-h-0 ${isMobile ? "flex-1" : ""}`}>
                    <div className={`flex items-center gap-4 border-b border-white/5 ${isMobile ? "px-4 py-4" : "px-6 py-5"}`}>
                        {filteredSeasons.length > 1 ? (
                            <button
                                onClick={() => setMode("seasons")}
                                className="group flex items-center gap-2 text-neutral-500 transition-colors hover:text-white"
                                aria-label="Select season"
                            >
                                <span className={`${isMobile ? "text-xs" : "text-xl"} font-black uppercase tracking-[0.2em]`}>
                                    {currentSeason?.title || "Season 1"}
                                </span>
                                <ChevronLeft className="h-5 w-5 stroke-[3px] text-neutral-500 group-hover:text-neutral-300 -rotate-90 transition-colors" />
                            </button>
                        ) : (
                            <span className={`${isMobile ? "text-xs" : "text-xl"} font-black uppercase tracking-[0.2em] text-neutral-500`}>
                                {currentSeason?.title || "Episodes"}
                            </span>
                        )}
                    </div>

                    <div className={`flex-1 overflow-y-auto px-2 ${isMobile ? "py-2" : "py-3"} space-y-0.5 custom-scrollbar`}>
                        {initialEpisodes.map((ep) => {
                            const isCurrent = ep.number === currentEpisode;
                            const isFocused = isMobile ? false : focusedEpisode === ep.number;

                            return (
                                <div
                                    key={ep.number}
                                    onMouseEnter={isMobile ? undefined : () => setFocusedEpisode(ep.number)}
                                    className={`group rounded-md transition-all duration-200 ${isFocused ? "bg-white/10 ring-1 ring-white/5" : ""} ${isCurrent && isMobile ? "bg-white/5" : ""}`}
                                >
                                    <Link
                                        href={`/watch/${showId}/${ep.number}`}
                                        replace
                                        className={`block ${isMobile ? "py-3.5 px-3" : "p-3"}`}
                                        onClick={onClose}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`text-sm font-bold tabular-nums shrink-0 w-5 ${isCurrent ? "text-ncyan" : "text-neutral-500"}`}>
                                                {ep.number}
                                            </span>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-sm font-bold truncate ${isCurrent ? "text-white font-black" : "text-neutral-200"}`}>
                                                        {ep.title || `Episode ${ep.number}`}
                                                    </span>
                                                    {isCurrent && <Play className="h-2.5 w-2.5 fill-ncyan text-ncyan shrink-0" />}
                                                </div>
                                            </div>
                                        </div>

                                        {!isMobile && isFocused && (
                                            <div className="mt-2 ml-8 space-y-2 animate-fade-in">
                                                {ep.thumbnail_url && (
                                                    <div className="relative aspect-video w-full rounded bg-white/5 overflow-hidden">
                                                        {/* eslint-disable-next-line @next/next/no-img-element -- remote episode thumbs; domains not configured for next/image */}
                                                        <img
                                                            src={ep.thumbnail_url}
                                                            alt={ep.title || ""}
                                                            className="h-full w-full object-cover"
                                                        />
                                                        {ep.progress_percent !== undefined && ep.progress_percent > 0 && (
                                                            <div className="absolute bottom-0 left-0 h-1 bg-neutral-600 w-full">
                                                                <div
                                                                    className="h-full bg-white"
                                                                    style={{ width: `${ep.progress_percent}%` }}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {ep.description && (
                                                    <p className="text-[0.65rem] text-neutral-500 line-clamp-2 leading-relaxed font-medium">
                                                        {ep.description}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className={`flex flex-col min-h-0 ${isMobile ? "flex-1" : ""}`}>
                    <div className={`border-b border-white/5 ${isMobile ? "px-4 py-4" : "px-6 py-6"} bg-white/5`}>
                        <h2 className="text-sm font-black text-neutral-500 uppercase tracking-[0.2em]">
                            {showTitle}
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
                        {filteredSeasons.map((s) => {
                            const isActive = s.id === showId;
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => {
                                        if (isActive) {
                                            setMode("episodes");
                                        } else {
                                            router.replace(`/watch/${s.id}/1`);
                                            onClose();
                                        }
                                    }}
                                    className={`flex items-center justify-between w-full ${isMobile ? "px-4 py-3.5" : "px-6 py-4"} text-sm font-bold transition-all uppercase tracking-wider ${isActive
                                        ? "text-white"
                                        : "text-neutral-500 hover:text-white"
                                        }`}
                                >
                                    <span>{s.title}</span>
                                    {isActive && <Check className="h-5 w-5 stroke-[4px]" />}
                                </button>
                            );
                        })}
                    </div>

                    <div className="p-4 border-t border-white/5">
                        <button
                            onClick={() => setMode("episodes")}
                            className="w-full py-2.5 rounded-md bg-white/5 text-xs text-neutral-400 font-bold hover:bg-white/10 hover:text-white transition-all uppercase tracking-[0.2em]"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </>
    );

    return (
        <>
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
                <div
                    className="hidden sm:flex flex-col absolute bottom-full right-0 mb-4 w-[400px] max-h-[70vh] player-menu-popover z-50 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {episodeList(false)}
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
                <div className="sm:hidden fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                    <div className="player-menu-scrim" />
                    <div
                        className="player-menu-sheet max-h-[75vh] min-h-0 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="player-menu-sheet-handle" />
                        {episodeList(true)}
                    </div>
                </div>
            </Transition>
        </>
    );
}
