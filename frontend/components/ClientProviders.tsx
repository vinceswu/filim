"use client";

import { ReactNode, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { Persister, PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ProfileProvider, useProfile } from "@/lib/profile-context";
import { SplashLoader } from "./SplashLoader";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1
        }
    }
});

const noopPersister: Persister = {
    persistClient: () => {},
    restoreClient: () => undefined,
    removeClient: () => {},
};

function SplashManager({ children }: { children: ReactNode }) {
    const { isReady: profileReady } = useProfile();
    const [splashDone, setSplashDone] = useState(false);

    return (
        <>
            {!splashDone && (
                <SplashLoader
                    isLoading={!profileReady}
                    onComplete={() => setSplashDone(true)}
                />
            )}
            {children}
        </>
    );
}

export function ClientProviders({ children }: { children: ReactNode }) {
    const [persister] = useState<Persister>(() => {
        if (typeof window === "undefined") return noopPersister;
        return createSyncStoragePersister({
            storage: window.localStorage,
            key: "filim-query-cache",
        });
    });

    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
                persister,
                maxAge: 30 * 60 * 1000,
                buster: "v1",
            }}
        >
            <ProfileProvider>
                <SplashManager>
                    {children}
                </SplashManager>
            </ProfileProvider>
        </PersistQueryClientProvider>
    );
}
