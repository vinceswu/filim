"use client";

import { useEffect, useState } from "react";
import { FilimLoadingSurface } from "./FilimLoadingSurface";

export function SplashLoader({
    onComplete,
    isLoading = false
}: {
    onComplete?: () => void;
    isLoading?: boolean;
}) {
    const [isVisible, setIsVisible] = useState(true);
    const [shouldRender, setShouldRender] = useState(true);
    const [minTimePassed, setMinTimePassed] = useState(false);
    const [stableLoading, setStableLoading] = useState(true);

    useEffect(() => {
        if (isLoading) {
            setStableLoading(true);
        } else {
            const timer = setTimeout(() => {
                setStableLoading(false);
            }, 80);
            return () => clearTimeout(timer);
        }
    }, [isLoading]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setMinTimePassed(true);
        }, 150);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!stableLoading && minTimePassed) {
            setIsVisible(false);

            const doneTimer = setTimeout(() => {
                if (onComplete) onComplete();
                setShouldRender(false);
            }, 300);

            return () => clearTimeout(doneTimer);
        }
    }, [stableLoading, minTimePassed, onComplete]);

    if (!shouldRender) return null;

    return <FilimLoadingSurface show={isVisible} className="z-[100]" />;
}
