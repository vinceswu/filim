"use client";

type FilimLoadingSurfaceProps = {
    show: boolean;
    /** e.g. z-[95] for watch (below session splash z-[100]) */
    className?: string;
    /** Cover the positioned parent (e.g. player shell) instead of the viewport */
    fillParent?: boolean;
};

export function FilimLoadingSurface({
    show,
    className = "",
    fillParent = false
}: FilimLoadingSurfaceProps) {
    const visibility = show
        ? "opacity-100 pointer-events-auto"
        : "opacity-0 pointer-events-none";
    const position = fillParent ? "absolute inset-0" : "fixed inset-0";
    const transition = fillParent
        ? "transition-opacity duration-150 ease-out"
        : "transition-opacity duration-300 ease-in-out";
    return (
        <div
            className={`${position} flex items-center justify-center bg-black ${transition} ${visibility} ${className}`.trim()}
            aria-hidden={!show}
        >
            <div className="flex flex-col items-center justify-center">
                <h1 className="text-ncyan text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter uppercase drop-shadow-[0_0_25px_rgba(6,182,212,0.6)] animate-splash-logo will-change-transform">
                    Filim
                </h1>
            </div>
        </div>
    );
}
