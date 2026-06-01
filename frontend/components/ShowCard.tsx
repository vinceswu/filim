"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http";
import { useProfile } from "@/lib/profile-context";
import { handlePlayWithFullscreen } from "@/lib/fullscreen";

export type ShowSummaryCard = {
    id: string;
    title: string;
    english_title?: string | null;
    episode_count?: number;
    poster_image_url?: string | null;
    banner_image_url?: string | null;
    synopsis?: string | null;
    tags?: string[];
    available_audio_languages?: string[];
    related_shows?: Array<{ relation: string; showId: string }>;
};

type ShowCardProps = {
    show: ShowSummaryCard;
    href?: string;
    isInList?: boolean;
    onToggleList?: () => void;
    widthClassName?: string;
    variant?: "standard" | "simple";
};

export function ShowCard({
    show,
    isInList,
    onToggleList,
    variant = "standard",
    widthClassName = "w-[calc(92vw/3)] sm:w-[calc(92vw/3)] md:w-[calc(92vw/4)] lg:w-[calc(92vw/5)] xl:w-[calc(92vw/6)]"
}: ShowCardProps) {
    const queryClient = useQueryClient();
    const router = useRouter();
    const { profile } = useProfile();
    const playHref = `/watch/${show.id}/1`;
    const infoHref = `/show/${show.id}`;

    const prefetchDetails = () => {
        if (queryClient.getQueryData(["show", show.id])) return;
        void queryClient.prefetchQuery({
            queryKey: ["show", show.id],
            queryFn: async () => {
                const res = await api.get(`/catalog/${show.id}`);
                return res.data;
            },
            staleTime: 5 * 60 * 1000,
        });
    };

    const subtitle =
        typeof show.episode_count === "number" && show.episode_count > 0
            ? `${show.episode_count} episodes`
            : undefined;

    const [imageFailed, setImageFailed] = useState(false);

    const handleCardClick = () => {
        if (typeof window !== "undefined" && window.innerWidth < 768) {
            router.push(infoHref);
        } else {
            router.push(playHref);
        }
    };

    return (
        <div
            className={`group/card relative flex-shrink-0 ${widthClassName} transition-all duration-300 ${variant === 'standard' ? 'md:hover:z-50' : ''} cursor-pointer active:scale-[0.97] md:active:scale-100`}
            onClick={handleCardClick}
            onMouseEnter={prefetchDetails}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleCardClick(); }}
            aria-label={show.title}
        >
            <div className={`relative aspect-[2/3] w-full overflow-hidden rounded-[4px] bg-surface transition-transform duration-300 ease-out ${variant === 'standard' ? 'md:group-hover/card:scale-[1.25] md:group-hover/card:z-30 md:group-hover/card:delay-[100ms]' : ''}`}>
                {show.poster_image_url && !imageFailed ? (
                    <Image
                        src={show.poster_image_url}
                        alt={show.title}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 31vw, (max-width: 1024px) 23vw, 15vw"
                        className="object-cover"
                        onError={() => setImageFailed(true)}
                    />
                ) : (
                    <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                        <span className="text-8xl font-black text-neutral-700">{show.title.slice(0, 1)}</span>
                    </div>
                )}

                <div className="absolute inset-0 opacity-0 hidden md:flex md:group-hover/card:opacity-100 transition-opacity duration-300 flex-col justify-between p-3 bg-gradient-to-t from-black/90 via-black/10 to-transparent z-40">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 scale-[0.8] origin-top-left">
                            <span className="text-ncyan font-black text-sm tracking-tighter">FILIM</span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handlePlayWithFullscreen(playHref, router);
                                    }}
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black text-xs hover:bg-neutral-200 transition-colors pl-0.5"
                                >
                                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                                        <path d="M6 4l15 8-15 8V4z" />
                                    </svg>
                                </button>
                                {onToggleList && !profile?.is_guest && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onToggleList();
                                        }}
                                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs transition-colors ${isInList
                                            ? "border-white bg-white text-black"
                                            : "border-neutral-500 text-neutral-400 hover:border-white hover:text-white"
                                            }`}
                                    >
                                        {isInList ? (
                                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                                                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                                            </svg>
                                        ) : (
                                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                                                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                                            </svg>
                                        )}
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(infoHref);
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-neutral-500 text-neutral-400 hover:border-white hover:text-white transition-colors"
                                title="More Info"
                            >
                                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                        </div>

                        <div className={`space-y-1 ${variant === 'simple' ? 'hidden' : 'block'}`} onClick={(e) => e.stopPropagation()}>
                            <p className="text-[0.65rem] font-black text-white leading-tight line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                                {show.title}
                            </p>
                            {show.tags && show.tags.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 text-[0.55rem] text-neutral-300">
                                    {show.tags.slice(0, 2).map((tag: string, i: number) => (
                                        <span key={tag} className="flex items-center gap-1.5">
                                            {i > 0 && <span className="text-neutral-600 text-[8px]">•</span>}
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {variant === "standard" && (
                    <>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent h-1/3 hidden md:block md:opacity-100 md:group-hover/card:opacity-0 transition-opacity duration-200 group-hover/card:pointer-events-none" />
                        <div className="absolute inset-x-0 bottom-0 p-2.5 hidden md:block md:opacity-100 md:group-hover/card:opacity-0 transition-opacity duration-200 group-hover/card:pointer-events-none">
                            <p className="text-[0.75rem] font-semibold text-white line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{show.title}</p>
                        </div>
                    </>
                )}

            </div>

            <div className={`mt-1.5 px-0.5 ${variant === 'standard' ? 'md:hidden' : 'block'}`}>
                <p className="text-[0.7rem] font-semibold text-neutral-200 line-clamp-2 leading-tight">{show.title}</p>
                {subtitle && (
                    <p className="text-[0.6rem] text-neutral-500 mt-0.5">{subtitle}</p>
                )}
            </div>
        </div>
    );
}
