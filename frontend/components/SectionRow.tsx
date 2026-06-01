"use client";

import { Children, ReactNode, useEffect, useRef, useState } from "react";

type SectionRowProps = {
    title: string;
    children: ReactNode;
    browseLabel?: string;
};

export function SectionRow({
    title,
    children,
    browseLabel = "Explore more"
}: SectionRowProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [showLeft, setShowLeft] = useState(false);
    const [showRight, setShowRight] = useState(false);
    const [scrollProgress, setScrollProgress] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const hasItems = Children.count(children) > 0;

    const checkScroll = () => {
        const el = scrollRef.current;
        if (!el) return;

        setShowLeft(el.scrollLeft > 5);
        const scrollable = el.scrollWidth - el.clientWidth;
        setShowRight(el.scrollLeft < scrollable - 5);

        if (scrollable > 0) {
            const progress = (el.scrollLeft / scrollable) * 100;
            setScrollProgress(progress);
        }
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener("resize", checkScroll);
        return () => window.removeEventListener("resize", checkScroll);
    }, [children]);

    const scroll = (direction: "left" | "right") => {
        const el = scrollRef.current;
        if (!el) return;
        const amount = el.clientWidth * 0.8;
        el.scrollBy({
            left: direction === "left" ? -amount : amount,
            behavior: "smooth"
        });
        setTimeout(checkScroll, 500);
    };

    return (
        <>
            <section className={`relative -my-6 md:-my-10 group/row transition-[z-index] duration-0 ${isOpen ? "z-50" : "z-40 hover:z-[60]"}`}>
                <div className="flex items-center justify-between px-[4%] pb-2 md:pb-3 pt-5 md:pt-7 relative z-10">
                    <div className="flex items-center gap-2 md:gap-3">
                        <h2 className="text-[0.9rem] md:text-base lg:text-lg font-bold text-white leading-none">{title}</h2>
                        {hasItems && (
                            <button
                                type="button"
                                onClick={() => setIsOpen(true)}
                                className="text-[0.6rem] md:text-xs text-ncyan font-medium inline-block"
                            >
                                {browseLabel} ›
                            </button>
                        )}
                    </div>

                    {(showLeft || showRight) && (
                        <div className="w-16 sm:w-24 h-[1.5px] bg-neutral-800 rounded-full relative overflow-hidden opacity-0 group-hover/row:opacity-100 transition-opacity duration-300 mb-1 pointer-events-none hidden md:block">
                            <div
                                className="h-full bg-neutral-500 transition-transform duration-75 rounded-full absolute top-0 left-0 w-[30%] origin-left"
                                style={{ transform: `translateX(${scrollProgress * 2.3333}%)` }}
                            />
                        </div>
                    )}
                </div>
                <div className="relative group/row">
                    {showLeft && <div className="row-fade-left" />}
                    {showRight && <div className="row-fade-right" />}

                    <div
                        ref={scrollRef}
                        onScroll={checkScroll}
                        className="group/row-inner flex gap-2 md:gap-1.5 overflow-x-auto overflow-y-clip scrollbar-none px-[4%] py-6 md:py-10 -my-6 md:-my-10 scroll-smooth"
                    >
                        {children}
                    </div>

                    <button
                        onClick={() => scroll("left")}
                        className={`absolute left-0 top-0 bottom-0 z-40 hidden md:flex w-[4%] items-center justify-center transition-opacity duration-300 opacity-0 disabled:hidden ${showLeft ? "group-hover/row:opacity-100" : "pointer-events-none"}`}
                        aria-label="Scroll left"
                    >
                        <svg viewBox="0 0 24 24" className="w-8 h-8 text-white hover:scale-125 transition-transform drop-shadow-lg" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </button>
                    <button
                        onClick={() => scroll("right")}
                        className={`absolute right-0 top-0 bottom-0 z-40 hidden md:flex w-[4%] items-center justify-center transition-opacity duration-300 opacity-0 disabled:hidden ${showRight ? "group-hover/row:opacity-100" : "pointer-events-none"}`}
                        aria-label="Scroll right"
                    >
                        <svg viewBox="0 0 24 24" className="w-8 h-8 text-white hover:scale-125 transition-transform drop-shadow-lg" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                        </svg>
                    </button>
                </div>
            </section>

            {isOpen && (
                <div className="dialog-overlay-centered">
                    <div className="dialog-panel-shell relative flex h-full max-h-[85vh] w-full max-w-7xl flex-col overflow-hidden">
                        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
                            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">{title}</h2>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                aria-label="Close"
                                className="h-9 w-9 rounded-full bg-surface-light flex items-center justify-center text-neutral-300 hover:bg-neutral-600 hover:text-white transition-colors"
                            >
                                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                                </svg>
                            </button>
                        </div>
                        <div className="relative flex-1 overflow-y-auto px-6 py-8">
                            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-2 gap-y-12 [&_>_div]:w-full">
                                {children}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
