"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/utils";
import { useProfile } from "@/lib/profile-context";
import { handlePlayWithFullscreen } from "@/lib/fullscreen";

type ContinueCardProps = {
    title: string;
    href: string;
    subtitle?: string;
    coverImageUrl?: string;
    progress?: number;
    positionSeconds?: number;
    durationSeconds?: number;
    isInList?: boolean;
    onToggleList?: () => void;
    showId?: string;
    widthClassName?: string;
};

export function ContinueCard({
    title,
    href,
    subtitle,
    coverImageUrl,
    progress,
    positionSeconds,
    durationSeconds,
    isInList,
    onToggleList,
    showId,
    widthClassName = "w-[calc(92vw/3)] sm:w-[calc(92vw/3)] md:w-[calc(92vw/4)] lg:w-[calc(92vw/5)] xl:w-[calc(92vw/6)]"
}: ContinueCardProps) {
    const router = useRouter();
    const { profile } = useProfile();
    const [imageFailed, setImageFailed] = useState(false);

    const handleCardClick = () => {
        handlePlayWithFullscreen(href, router);
    };

    return (
        <>
            <div
                className={`group/card relative flex-shrink-0 ${widthClassName} transition-all duration-300 hover:z-50 cursor-pointer hidden md:block`}
                onClick={handleCardClick}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleCardClick(); }}
                aria-label={title}
            >
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[4px] bg-surface transition-transform duration-300 ease-out group-hover/card:scale-[1.25] group-hover/card:z-30 group-hover/card:delay-[100ms]">
                    {coverImageUrl && !imageFailed ? (
                        <Image
                            src={coverImageUrl}
                            alt={title}
                            fill
                            unoptimized
                            sizes="(max-width: 1024px) 23vw, 15vw"
                            className="object-cover"
                            onError={() => setImageFailed(true)}
                        />
                    ) : (
                        <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                            <span className="text-7xl font-black text-neutral-700">{title.slice(0, 1)}</span>
                        </div>
                    )}

                    <div className="absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3 bg-gradient-to-t from-black/90 via-black/10 to-transparent z-40">
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
                                            handlePlayWithFullscreen(href, router);
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
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/show/${showId}`);
                                        }}
                                        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-neutral-500 text-neutral-400 hover:border-white hover:text-white transition-colors"
                                    >
                                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3">
                                            <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                                <p className="text-[0.65rem] font-black text-white leading-tight line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                                    {title}
                                </p>
                                {subtitle && (
                                    <p className="text-[0.6rem] text-neutral-300 font-medium">{subtitle}</p>
                                )}
                                {typeof positionSeconds === "number" &&
                                    typeof durationSeconds === "number" &&
                                    durationSeconds > 0 && (
                                        <p className="text-[0.55rem] text-neutral-400 font-medium tracking-tight">
                                            {formatTime(positionSeconds)} of {formatTime(durationSeconds)}
                                        </p>
                                    )}
                            </div>
                        </div>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent h-1/3 opacity-100 group-hover/card:opacity-0 transition-opacity duration-200 group-hover/card:pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 p-2.5 opacity-100 group-hover/card:opacity-0 transition-opacity duration-200 group-hover/card:pointer-events-none">
                        <p className="text-[0.75rem] font-semibold text-white line-clamp-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{title}</p>
                        {subtitle && (
                            <p className="text-[0.6rem] text-neutral-300 mt-0.5">{subtitle}</p>
                        )}
                        {typeof progress === "number" && (
                            <div className="mt-1.5 h-[3px] w-full rounded-full bg-neutral-700 overflow-hidden">
                                <div
                                    className="h-full bg-ncyan rounded-full transition-all"
                                    style={{ width: `${Math.round(progress * 100)}%` }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div
                className={`relative flex-shrink-0 ${widthClassName} cursor-pointer md:hidden active:scale-[0.97] transition-transform duration-150`}
                onClick={handleCardClick}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleCardClick(); }}
                aria-label={title}
            >
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[4px] bg-surface">
                    {coverImageUrl && !imageFailed ? (
                        <Image
                            src={coverImageUrl}
                            alt={title}
                            fill
                            sizes="(max-width: 640px) 31vw, (max-width: 1024px) 23vw, 15vw"
                            className="object-cover"
                            onError={() => setImageFailed(true)}
                        />
                    ) : (
                        <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                            <span className="text-5xl font-black text-neutral-700">{title.slice(0, 1)}</span>
                        </div>
                    )}

                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex items-center justify-center h-11 w-11 rounded-full bg-black/50 backdrop-blur-sm border border-white/20">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white ml-0.5" fill="currentColor">
                                <path d="M6 4l15 8-15 8V4z" />
                            </svg>
                        </div>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

                    {showId && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/show/${showId}`);
                            }}
                            className="absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm border border-white/20 text-neutral-300 active:scale-95 transition-transform"
                            aria-label="More Info"
                        >
                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="16" x2="12" y2="12"></line>
                                <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                        </button>
                    )}

                    {typeof progress === "number" && (
                        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-neutral-700/80">
                            <div
                                className="h-full bg-ncyan transition-all"
                                style={{ width: `${Math.round(progress * 100)}%` }}
                            />
                        </div>
                    )}
                </div>

                <div className="mt-2 px-0.5">
                    <p className="text-[0.7rem] font-semibold text-neutral-200 line-clamp-2 leading-tight">{title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        {subtitle && (
                            <p className="text-[0.6rem] text-neutral-500">{subtitle}</p>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
