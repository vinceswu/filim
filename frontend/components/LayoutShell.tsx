"use client";

import Link from "next/link";
import { ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useProfile } from "@/lib/profile-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/http";

const NAV_ITEMS: { href: string; label: string }[] = [
    { href: "/", label: "Home" },
    { href: "/shows", label: "Shows" },
    { href: "/movies", label: "Movies" },
    { href: "/trending", label: "Trending" },
    { href: "/mylist", label: "My List" }
];

function LayoutShellInner({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { profile, isReady, logout } = useProfile();
    const [scrolled, setScrolled] = useState(false);
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isReady) return;
        if (!profile && pathname !== "/profiles" && !pathname.startsWith("/admin")) {
            router.replace("/profiles");
        }
    }, [isReady, profile, pathname, router]);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 10);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        const urlQuery = searchParams.get("q") || "";
        if (urlQuery !== searchQuery) {
            if (urlQuery) {
                setSearchQuery(urlQuery);
                setIsSearchExpanded(true);
            } else if (pathname === "/") {
                setSearchQuery("");
                setIsSearchExpanded(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- adding searchQuery clears the field while typing before the debounced URL update
    }, [searchParams, pathname]);

    useEffect(() => {
        const timer = setTimeout(() => {
            const urlQuery = searchParams.get("q") || "";
            if (searchQuery === urlQuery) return;

            if (searchQuery.trim()) {
                router.push(`/?q=${encodeURIComponent(searchQuery.trim())}`);
            } else if (urlQuery) {
                router.push("/");
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery, router]);

    useEffect(() => {
        if (isSearchExpanded) {
            searchInputRef.current?.focus();
        }
    }, [isSearchExpanded]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/?q=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    const toggleSearch = () => {
        if (!isSearchExpanded) {
            setIsSearchExpanded(true);
        } else {
            searchInputRef.current?.focus();
        }
    };

    if (pathname.startsWith("/watch/") || pathname.startsWith("/admin")) {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header
                className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled
                    ? "bg-background/95 backdrop-blur-md shadow-[0_2px_20px_rgba(0,0,0,0.5)]"
                    : "bg-gradient-to-b from-black/80 via-black/40 to-transparent"
                    }`}
            >
                <div className="flex h-12 md:h-16 items-center justify-between px-[4%]">
                    <div className="flex items-center gap-4 md:gap-6">
                        {pathname === "/profiles" ? (
                            <div className="text-ncyan text-xl md:text-2xl font-black tracking-tighter uppercase p-0 m-0 leading-none">
                                Filim
                            </div>
                        ) : (
                            <Link
                                href="/"
                                className="text-ncyan text-xl md:text-2xl font-black tracking-tighter uppercase p-0 m-0 leading-none"
                            >
                                Filim
                            </Link>
                        )}
                        {pathname !== "/profiles" && (
                            <nav className="hidden md:flex items-center gap-6 text-sm">
                                {NAV_ITEMS.filter(item => !(profile?.is_guest && item.label === "My List")).map((item) => {
                                    const isActive =
                                        item.href === "/"
                                            ? pathname === "/"
                                            : pathname.startsWith(item.href);
                                    return (
                                        <Link
                                            key={item.label}
                                            href={item.href}
                                            className={`font-medium transition-colors ${isActive
                                                ? "text-white"
                                                : "text-neutral-300 hover:text-white"
                                                }`}
                                        >
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </nav>
                        )}
                    </div>
                    <div className="flex items-center gap-3 md:gap-4">
                        {pathname !== "/profiles" && (
                            <div className={`relative flex items-center transition-all duration-300 ${isSearchExpanded ? "md:w-64 w-[calc(100vw-7rem)]" : "w-8"}`}>
                                <button
                                    type="button"
                                    onClick={toggleSearch}
                                    className="text-white hover:text-neutral-300 transition-colors p-1 z-10"
                                    aria-label="Toggle search"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="w-5 h-5"
                                    >
                                        <circle cx="11" cy="11" r="8"></circle>
                                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                    </svg>
                                </button>
                                <form
                                    onSubmit={handleSearchSubmit}
                                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-full transition-all duration-300 overflow-hidden ${isSearchExpanded ? "opacity-100 pl-8" : "opacity-0 pointer-events-none"}`}
                                >
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onBlur={() => !searchQuery && setIsSearchExpanded(false)}
                                        placeholder="Titles, genres..."
                                        className="w-full bg-black/60 border border-white/20 backdrop-blur-md rounded py-1.5 md:py-1 pl-2 pr-4 text-sm text-white focus:outline-none focus:border-white/40"
                                    />
                                </form>
                            </div>
                        )}
                        {pathname !== "/profiles" && profile && (
                            <div className="relative group">
                                <button
                                    type="button"
                                    className="focus:outline-none flex items-center group/btn"
                                >
                                    <div className="h-8 w-8 md:h-9 md:w-9 rounded bg-ncyan flex items-center justify-center text-sm md:text-base font-bold text-black transition-all">
                                        {profile.name.slice(0, 1).toUpperCase()}
                                    </div>
                                </button>

                                <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-lg bg-surface border border-neutral-800 shadow-[0_16px_60px_rgba(0,0,0,0.8)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[60] overflow-hidden">
                                    <div className="py-2">
                                        <div className="px-3 py-2 space-y-2">
                                            <p className="text-[10px] uppercase font-bold text-neutral-500 tracking-widest mb-1">Switch Profile</p>
                                            <ProfileDropdownItems currentId={profile?.id} />
                                        </div>



                                        <div className="border-t border-neutral-800 my-1" />

                                        <button
                                            onClick={() => logout()}
                                            className="w-full text-left px-4 py-3 text-sm font-medium text-white hover:bg-white/5 transition-colors"
                                        >
                                            Sign out of Filim
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            {pathname !== "/profiles" && !searchParams.get("q") && (
                <nav className="absolute top-0 left-0 right-0 z-40 flex md:hidden overflow-x-auto scrollbar-none items-center gap-3 pt-14 pb-2 px-[4%] transition-all duration-300">
                    <div className="flex items-center gap-2 flex-nowrap">
                        {NAV_ITEMS.filter(item => item.label !== "Home" && !(profile?.is_guest && item.label === "My List")).map((item) => {
                            const isActive =
                                item.href === "/"
                                    ? pathname === "/"
                                    : pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all border whitespace-nowrap ${isActive
                                        ? "bg-white text-black border-white"
                                        : "bg-black/20 text-white border-white/40 hover:bg-white/10"
                                        }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>
                </nav>
            )}
            <main>{children}</main>
        </div>
    );
}

export function LayoutShell({ children }: { children: ReactNode }) {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <LayoutShellInner>{children}</LayoutShellInner>
        </Suspense>
    );
}

const AVATAR_COLORS = [
    "from-nred to-red-800",
    "from-blue-600 to-blue-900",
    "from-emerald-600 to-emerald-900",
    "from-amber-500 to-amber-800",
    "from-purple-600 to-purple-900",
    "from-pink-600 to-pink-900",
    "from-teal-500 to-teal-800",
    "from-orange-500 to-orange-800"
];

type ProfileEntry = { id: string; name: string; is_guest: boolean; is_locked: boolean };

type PublicSettings = {
    allow_creating_profiles: boolean;
    guest_profile_enabled: boolean;
    max_profiles: number | null;
    require_profile_pins: boolean;
};

function ProfileDropdownItems({ currentId }: { currentId?: string }) {
    const { setProfile } = useProfile();
    const [unlocking, setUnlocking] = useState<ProfileEntry | null>(null);
    const [settingPinProfile, setSettingPinProfile] = useState<ProfileEntry | null>(null);
    const [pin, setPin] = useState("");
    const [pinError, setPinError] = useState<string | null>(null);

    const settingsQuery = useQuery({
        queryKey: ["publicSettings"],
        queryFn: async () => {
            const res = await api.get<PublicSettings>("/admin/public");
            return res.data;
        }
    });
    const settings = settingsQuery.data;

    const { data: profiles } = useQuery({
        queryKey: ["profiles"],
        queryFn: async () => {
            const res = await api.get<{ items: ProfileEntry[] }>("/profiles");
            return res.data.items;
        }
    });

    const verifyPin = useMutation({
        mutationFn: async (payload: { profile: ProfileEntry; pin: string }) => {
            await api.post(`/profiles/${payload.profile.id}/verify-pin`, { pin: payload.pin });
        },
        onSuccess: (_data, variables) => {
            sessionStorage.setItem(`filim.pinVerified.${variables.profile.id}`, "1");
            setProfile({ id: variables.profile.id, name: variables.profile.name, is_guest: variables.profile.is_guest });
            window.location.href = "/";
        },
        onError: () => {
            setPinError("Incorrect PIN.");
            setPin("");
        },
    });

    const setPinMutation = useMutation({
        mutationFn: async (payload: { profile: ProfileEntry; pin: string }) => {
            await api.patch(`/profiles/${payload.profile.id}`, { pin: payload.pin });
        },
        onSuccess: (_data, variables) => {
            sessionStorage.setItem(`filim.pinVerified.${variables.profile.id}`, "1");
            setProfile({ id: variables.profile.id, name: variables.profile.name, is_guest: variables.profile.is_guest });
            window.location.href = "/";
        },
        onError: () => {
            setPinError("Failed to set PIN.");
            setPin("");
        },
    });

    const handleSwitch = (p: ProfileEntry) => {
        if (p.is_locked) {
            setUnlocking(p);
            setPin("");
            setPinError(null);
            return;
        }
        if (settings?.require_profile_pins && !p.is_guest) {
            setSettingPinProfile(p);
            setPin("");
            setPinError(null);
            return;
        }
        setProfile({ id: p.id, name: p.name, is_guest: p.is_guest });
        window.location.href = "/";
    };

    const handlePinChange = (val: string) => {
        const next = val.replace(/\D/g, "").slice(0, 4);
        setPin(next);
        setPinError(null);
        if (next.length === 4) {
            if (unlocking && !verifyPin.isPending) {
                verifyPin.mutate({ profile: unlocking, pin: next });
            } else if (settingPinProfile && !setPinMutation.isPending) {
                setPinMutation.mutate({ profile: settingPinProfile, pin: next });
            }
        }
    };

    const others = profiles?.filter(p => p.id !== currentId) || [];

    return (
        <>
            <div className="space-y-1">
                {others.map((p, i) => (
                    <button
                        key={p.id}
                        onClick={() => handleSwitch(p)}
                        className="w-full flex items-center gap-2 group/item px-1 py-1 rounded hover:bg-white/5 transition-colors"
                    >
                        <div className={`h-6 w-6 rounded bg-gradient-to-br ${AVATAR_COLORS[(i + 1) % AVATAR_COLORS.length]} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                            {p.name.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-neutral-400 group-hover/item:text-white transition-colors truncate">
                            {p.name}
                        </span>
                        {p.is_locked && (
                            <svg viewBox="0 0 24 24" className="ml-auto w-3 h-3 shrink-0 text-neutral-600" fill="currentColor">
                                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                            </svg>
                        )}
                    </button>
                ))}
            </div>

            {unlocking && typeof document !== "undefined" && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => { setUnlocking(null); setPin(""); setPinError(null); }}
                >
                    <div
                        className="dialog-panel-shell w-full max-w-xs px-8 py-10 space-y-8"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="text-center space-y-3">
                            <div className={`h-16 w-16 mx-auto rounded-md bg-gradient-to-br ${AVATAR_COLORS[(others.findIndex(p => p.id === unlocking.id) + 1) % AVATAR_COLORS.length]} flex items-center justify-center text-2xl font-black text-white/90`}>
                                {unlocking.name.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">{unlocking.name}</h2>
                                <p className="text-xs text-neutral-400 mt-1">Enter PIN to switch profile</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <input
                                type="password"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={4}
                                value={pin}
                                onChange={e => handlePinChange(e.target.value)}
                                className="dialog-input-emphasis"
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === "Enter" && pin.length >= 4 && !verifyPin.isPending) {
                                        verifyPin.mutate({ profile: unlocking, pin });
                                    }
                                }}
                            />
                            {pinError && (
                                <p aria-live="polite" className="text-xs text-nred text-center font-medium">{pinError}</p>
                            )}
                        </div>

                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                disabled={verifyPin.isPending || pin.length < 4}
                                onClick={() => verifyPin.mutate({ profile: unlocking, pin })}
                                className="w-full rounded bg-white py-2.5 text-sm font-bold text-black hover:bg-neutral-200 disabled:opacity-50 transition-all active:scale-95"
                            >
                                {verifyPin.isPending ? "Unlocking…" : "Unlock"}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setUnlocking(null); setPin(""); setPinError(null); }}
                                className="w-full py-2 text-sm text-neutral-500 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {settingPinProfile && typeof document !== "undefined" && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => { setSettingPinProfile(null); setPin(""); setPinError(null); }}
                >
                    <div
                        className="dialog-panel-shell w-full max-w-xs px-8 py-10 space-y-8"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="text-center space-y-3">
                            <div className={`h-16 w-16 mx-auto rounded-md bg-gradient-to-br ${AVATAR_COLORS[(others.findIndex(p => p.id === settingPinProfile.id) + 1) % AVATAR_COLORS.length]} flex items-center justify-center text-2xl font-black text-white/90`}>
                                {settingPinProfile.name.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">Set PIN</h2>
                                <p className="text-xs text-neutral-400 mt-1">A PIN is required. Please set a 4-digit PIN.</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <input
                                type="password"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={4}
                                value={pin}
                                onChange={e => handlePinChange(e.target.value)}
                                className="dialog-input-emphasis"
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === "Enter" && pin.length >= 4 && !setPinMutation.isPending) {
                                        setPinMutation.mutate({ profile: settingPinProfile, pin });
                                    }
                                }}
                            />
                            {pinError && (
                                <p aria-live="polite" className="text-xs text-nred text-center font-medium">{pinError}</p>
                            )}
                        </div>

                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                disabled={setPinMutation.isPending || pin.length < 4}
                                onClick={() => setPinMutation.mutate({ profile: settingPinProfile, pin })}
                                className="w-full rounded bg-white py-2.5 text-sm font-bold text-black hover:bg-neutral-200 disabled:opacity-50 transition-all active:scale-95"
                            >
                                {setPinMutation.isPending ? "Setting…" : "Set PIN"}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setSettingPinProfile(null); setPin(""); setPinError(null); }}
                                className="w-full py-2 text-sm text-neutral-500 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
