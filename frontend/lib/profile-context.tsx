import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    ReactNode
} from "react";
import { useRouter } from "next/navigation";

type ActiveProfile = {
    id: string;
    name: string;
    is_guest?: boolean;
};

type ProfileContextValue = {
    profile: ActiveProfile | null;
    setProfile: (profile: ActiveProfile | null) => void;
    logout: () => void;
    isReady: boolean;
};

const STORAGE_KEY = "filim.activeProfile";

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
    const [profile, setProfileState] = useState<ActiveProfile | null>(null);
    const [isReady, setIsReady] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (typeof window === "undefined") return;

        async function init() {
            try {
                const raw = window.localStorage.getItem(STORAGE_KEY);
                if (!raw) {
                    setIsReady(true);
                    return;
                }

                const parsed = JSON.parse(raw) as ActiveProfile;
                if (!parsed?.id || !parsed?.name) {
                    setIsReady(true);
                    return;
                }

                // Optimistically set profile from localStorage so UI unblocks immediately,
                // then validate in background and revert if server rejects.
                setProfileState(parsed);
                setIsReady(true);

                const res = await fetch(`/api/v1/profiles/${parsed.id}`, {
                    headers: { "X-Profile-Id": parsed.id }
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.is_locked) {
                        // sessionStorage survives hard reloads but clears when tab closes,
                        // so PIN is required once per tab session.
                        const verified = sessionStorage.getItem(
                            `filim.pinVerified.${parsed.id}`
                        );
                        if (!verified) {
                            window.localStorage.removeItem(STORAGE_KEY);
                            setProfileState(null);
                        } else {
                            setProfileState({
                                id: data.id,
                                name: data.name,
                                is_guest: data.is_guest
                            });
                        }
                    } else {
                        setProfileState({
                            id: data.id,
                            name: data.name,
                            is_guest: data.is_guest
                        });
                    }
                } else {
                    window.localStorage.removeItem(STORAGE_KEY);
                    setProfileState(null);
                }
            } catch (err) {
                console.error("Profile initialization failed. If you switched tunnel URLs, your active profile selection may have been reset by the browser.", err);
                setIsReady(true);
            }
        }

        void init();
    }, []);

    const setProfile = useCallback((next: ActiveProfile | null) => {
        setProfileState(next);
        if (typeof window === "undefined") return;
        if (next) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } else {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    const logout = useCallback(() => {
        setProfile(null);
        router.push("/profiles");
    }, [setProfile, router]);

    return (
        <ProfileContext.Provider value={{ profile, setProfile, logout, isReady }}>
            {children}
        </ProfileContext.Provider>
    );
}

export function useProfile(): ProfileContextValue {
    const ctx = useContext(ProfileContext);
    if (!ctx) {
        throw new Error("useProfile must be used within a ProfileProvider");
    }
    return ctx;
}

export function getActiveProfileIdFromStorage(): string | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ActiveProfile;
        return parsed?.id ?? null;
    } catch {
        return null;
    }
}

