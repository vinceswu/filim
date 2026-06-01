"use client";

import { createContext, useContext, useState, ReactNode, useCallback, useMemo } from "react";

type StreamVariant = {
    id: string;
    resolution?: string | null;
    provider?: string | null;
    bitrate_kbps?: number | null;
    kind: string;
};

type StreamResponse = {
    manifest_url: string;
    variants: StreamVariant[];
    audio_languages?: {
        id: string;
        code?: string | null;
        label: string;
        is_default?: boolean;
    }[];
};

type WatchState = {
    manifestUrl: string | null;
    variants: StreamVariant[];
    audioLanguages: StreamResponse["audio_languages"] | undefined;
    resumePositionSeconds: number | null;
    error: string | null;
    isPageLoading: boolean;
};

type WatchContextType = {
    state: WatchState;
    setEpisodeData: (data: Partial<WatchState>) => void;
};

const WatchContext = createContext<WatchContextType | undefined>(undefined);

export function WatchProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<WatchState>({
        manifestUrl: null,
        variants: [],
        audioLanguages: undefined,
        resumePositionSeconds: null,
        error: null,
        isPageLoading: true,
    });

    const setEpisodeData = useCallback((data: Partial<WatchState>) => {
        setState((prev) => ({ ...prev, ...data }));
    }, []);

    const contextValue = useMemo(() => ({ state, setEpisodeData }), [state, setEpisodeData]);

    return (
        <WatchContext.Provider value={contextValue}>
            {children}
        </WatchContext.Provider>
    );
}

export function useWatch() {
    const context = useContext(WatchContext);
    if (!context) {
        throw new Error("useWatch must be used within a WatchProvider");
    }
    return context;
}
