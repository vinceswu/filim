"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http";
import { useProfile } from "@/lib/profile-context";

type Profile = {
    id: string;
    name: string;
    is_locked: boolean;
    is_guest: boolean;
};

type ProfilesResponse = {
    items: Profile[];
};

type PublicSettings = {
    allow_creating_profiles: boolean;
    guest_profile_enabled: boolean;
    max_profiles: number | null;
    require_profile_pins: boolean;
};

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

export default function ProfilesPage() {
    const { setProfile } = useProfile();
    const queryClient = useQueryClient();
    const [isCreating, setIsCreating] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createPin, setCreatePin] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);
    const [pinInput, setPinInput] = useState("");
    const [pinError, setPinError] = useState<string | null>(null);
    const [unlockingProfile, setUnlockingProfile] = useState<Profile | null>(null);
    const [settingPinProfile, setSettingPinProfile] = useState<Profile | null>(null);

    const settingsQuery = useQuery({
        queryKey: ["publicSettings"],
        queryFn: async () => {
            const res = await api.get<PublicSettings>("/admin/public");
            return res.data;
        }
    });
    const settings = settingsQuery.data;

    const profiles = useQuery({
        queryKey: ["profiles"],
        queryFn: async () => {
            const res = await api.get<ProfilesResponse>("/profiles");
            return res.data.items;
        }
    });

    const createProfile = useMutation({
        mutationFn: async (payload: { name: string; pin?: string | null }) => {
            const res = await api.post<Profile>("/profiles", {
                name: payload.name,
                pin: payload.pin ?? null
            });
            return res.data;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["profiles"] });
            setIsCreating(false);
            setCreateName("");
            setCreatePin("");
            setCreateError(null);
        }
    });

    const verifyPin = useMutation({
        mutationFn: async (payload: { profile: Profile; pin: string }) => {
            await api.post(`/profiles/${payload.profile.id}/verify-pin`, {
                pin: payload.pin
            });
        },
        onSuccess: (_data, variables) => {
            setPinError(null);
            setUnlockingProfile(null);
            setPinInput("");
            sessionStorage.setItem(`filim.pinVerified.${variables.profile.id}`, "1");
            setProfile({
                id: variables.profile.id,
                name: variables.profile.name,
                is_guest: variables.profile.is_guest
            });
            window.location.href = "/";
        },
        onError: () => {
            setPinError("Incorrect PIN. Try again.");
        }
    });

    const setPin = useMutation({
        mutationFn: async (payload: { profile: Profile; pin: string }) => {
            const res = await api.patch(`/profiles/${payload.profile.id}`, {
                pin: payload.pin
            });
            return res.data;
        },
        onSuccess: (_data, variables) => {
            setPinError(null);
            setSettingPinProfile(null);
            setPinInput("");
            sessionStorage.setItem(`filim.pinVerified.${variables.profile.id}`, "1");
            setProfile({
                id: variables.profile.id,
                name: variables.profile.name,
                is_guest: variables.profile.is_guest
            });
            window.location.href = "/";
        },
        onError: () => {
            setPinError("Failed to set PIN. Try again.");
        }
    });

    const handleSelectProfile = (p: Profile) => {
        if (p.is_locked) {
            setUnlockingProfile(p);
            setPinInput("");
            setPinError(null);
            return;
        }
        if (settings?.require_profile_pins && !p.is_guest) {
            setSettingPinProfile(p);
            setPinInput("");
            setPinError(null);
            return;
        }
        setProfile({ id: p.id, name: p.name, is_guest: p.is_guest });
        window.location.href = "/";
    };

    const handleCreateSubmit = () => {
        const trimmed = createName.trim();
        if (!trimmed) {
            setCreateError("Please enter a name.");
            return;
        }
        if (settings?.require_profile_pins && createPin.length !== 4) {
            setCreateError("A 4-digit PIN is required.");
            return;
        }
        setCreateError(null);
        createProfile.mutate({
            name: trimmed,
            pin: createPin.trim() || null
        });
    };

    const canCreate = settings?.allow_creating_profiles ?? true;
    const maxProfiles = settings?.max_profiles ?? null;
    const currentNonGuest = profiles.data?.filter(p => !p.is_guest).length ?? 0;
    const limitReached = maxProfiles !== null && currentNonGuest >= maxProfiles;
    const showCreateButton = canCreate && !limitReached;

    return (
        <main className="min-h-screen bg-background text-white flex items-center justify-center">
            <div className="w-full max-w-4xl px-4 py-10 space-y-10">
                <div className="text-center space-y-2 animate-fade-in-up">
                    <h1 className="text-3xl sm:text-4xl font-bold">Who&apos;s watching?</h1>
                </div>

                <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
                    {profiles.data?.map((p, i) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectProfile(p)}
                            className="group flex flex-col items-center gap-3 animate-fade-in-up"
                            style={{ animationDelay: `${i * 100}ms` }}
                        >
                            <div className={`h-28 w-28 sm:h-32 sm:w-32 rounded-md bg-gradient-to-br ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-4xl sm:text-5xl font-black text-white/90 transition-all duration-200 group-hover:ring-4 group-hover:ring-white group-hover:scale-105`}>
                                {p.name.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="text-sm font-medium text-neutral-400 group-hover:text-white transition-colors">
                                {p.name}
                            </div>
                            {p.is_locked && (
                                <div className="text-[0.65rem] uppercase tracking-wider text-neutral-600 flex items-center gap-1">
                                    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
                                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                                    </svg>
                                    Locked
                                </div>
                            )}
                        </button>
                    ))}

                    {showCreateButton && (
                        <button
                            type="button"
                            onClick={() => {
                                setIsCreating(true);
                                setCreateName("");
                                setCreatePin("");
                                setCreateError(null);
                            }}
                            className="group flex flex-col items-center gap-3 animate-fade-in-up"
                            style={{ animationDelay: `${(profiles.data?.length ?? 0) * 100}ms` }}
                        >
                            <div className="h-28 w-28 sm:h-32 sm:w-32 rounded-md border-2 border-dashed border-neutral-700 text-5xl text-neutral-700 flex items-center justify-center transition-all duration-200 group-hover:border-white group-hover:text-white group-hover:scale-105">
                                +
                            </div>
                            <div className="text-sm font-medium text-neutral-400 group-hover:text-white transition-colors">
                                Add Profile
                            </div>
                        </button>
                    )}
                </div>

                {isCreating && (
                    <div className="dialog-overlay-centered">
                        <div className="dialog-panel-shell w-full max-w-sm px-6 py-6 space-y-5">
                            <h2 className="text-xl font-bold text-foreground">Add Profile</h2>
                            <div className="space-y-2">
                                <label className="block text-xs text-neutral-400 font-medium">Name</label>
                                <input
                                    type="text"
                                    value={createName}
                                    onChange={(e) => setCreateName(e.target.value)}
                                    className="dialog-input"
                                    placeholder="Enter name"
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs text-neutral-400 font-medium">
                                    {settings?.require_profile_pins ? "PIN" : "PIN (optional)"}
                                </label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={4}
                                    value={createPin}
                                    onChange={(e) =>
                                        setCreatePin(
                                            e.target.value.replace(/\D/g, "").slice(0, 4)
                                        )
                                    }
                                    className="dialog-input"
                                    placeholder="••••"
                                />
                            </div>
                            {createError && (
                                <p className="text-xs text-red-400">{createError}</p>
                            )}
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCreating(false);
                                        setCreateName("");
                                        setCreatePin("");
                                        setCreateError(null);
                                    }}
                                    className="text-sm text-neutral-500 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCreateSubmit}
                                    className="rounded bg-white px-5 py-2 text-sm font-bold text-black hover:bg-neutral-200 transition-colors"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {unlockingProfile && (
                    <div className="dialog-overlay-centered animate-in fade-in duration-300">
                        <div className="dialog-panel-shell w-full max-w-xs px-8 py-10 space-y-8 scale-in-center">
                            <div className="text-center space-y-4">
                                <div className={`h-20 w-20 mx-auto rounded-md bg-gradient-to-br ${AVATAR_COLORS[profiles.data?.findIndex(p => p.id === unlockingProfile.id) ?? 0 % AVATAR_COLORS.length]} flex items-center justify-center text-3xl font-black text-white/90 shadow-xl`}>
                                    {unlockingProfile.name.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="space-y-1">
                                    <h2 className="text-xl font-bold text-foreground">Profile Lock</h2>
                                    <p className="text-sm text-neutral-400">Enter your PIN to access this profile.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={4}
                                    value={pinInput}
                                    onChange={(e) => {
                                        const next = e.target.value.replace(/\D/g, "").slice(0, 4);
                                        setPinInput(next);
                                        if (
                                            next.length === 4 &&
                                            unlockingProfile &&
                                            !verifyPin.isPending
                                        ) {
                                            verifyPin.mutate({
                                                profile: unlockingProfile,
                                                pin: next
                                            });
                                        }
                                    }}
                                    className="dialog-input-emphasis"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Enter" &&
                                            pinInput.length >= 4 &&
                                            unlockingProfile &&
                                            !verifyPin.isPending
                                        ) {
                                            verifyPin.mutate({
                                                profile: unlockingProfile,
                                                pin: pinInput
                                            });
                                        }
                                    }}
                                />
                                {pinError && (
                                    <p aria-live="polite" className="text-xs text-nred text-center font-medium motion-safe:animate-pulse">{pinError}</p>
                                )}
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    type="button"
                                    disabled={verifyPin.isPending || pinInput.length < 4}
                                    onClick={() => {
                                        if (!unlockingProfile) return;
                                        verifyPin.mutate({ profile: unlockingProfile, pin: pinInput });
                                    }}
                                    className="w-full rounded bg-white py-3 text-sm font-bold text-black hover:bg-neutral-200 disabled:opacity-50 disabled:hover:bg-white transition-all transform active:scale-95"
                                >
                                    {verifyPin.isPending ? "Unlocking..." : "Unlock"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUnlockingProfile(null);
                                        setPinInput("");
                                        setPinError(null);
                                    }}
                                    className="w-full py-2 text-sm text-neutral-500 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {settingPinProfile && (
                    <div className="dialog-overlay-centered animate-in fade-in duration-300">
                        <div className="dialog-panel-shell w-full max-w-xs px-8 py-10 space-y-8 scale-in-center">
                            <div className="text-center space-y-4">
                                <div className={`h-20 w-20 mx-auto rounded-md bg-gradient-to-br ${AVATAR_COLORS[profiles.data?.findIndex(p => p.id === settingPinProfile.id) ?? 0 % AVATAR_COLORS.length]} flex items-center justify-center text-3xl font-black text-white/90 shadow-xl`}>
                                    {settingPinProfile.name.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="space-y-1">
                                    <h2 className="text-xl font-bold text-foreground">Set PIN</h2>
                                    <p className="text-sm text-neutral-400">A PIN is required. Please set a 4-digit PIN.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={4}
                                    value={pinInput}
                                    onChange={(e) => {
                                        const next = e.target.value.replace(/\D/g, "").slice(0, 4);
                                        setPinInput(next);
                                        if (
                                            next.length === 4 &&
                                            settingPinProfile &&
                                            !setPin.isPending
                                        ) {
                                            setPin.mutate({
                                                profile: settingPinProfile,
                                                pin: next
                                            });
                                        }
                                    }}
                                    className="dialog-input-emphasis"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Enter" &&
                                            pinInput.length >= 4 &&
                                            settingPinProfile &&
                                            !setPin.isPending
                                        ) {
                                            setPin.mutate({
                                                profile: settingPinProfile,
                                                pin: pinInput
                                            });
                                        }
                                    }}
                                />
                                {pinError && (
                                    <p aria-live="polite" className="text-xs text-nred text-center font-medium motion-safe:animate-pulse">{pinError}</p>
                                )}
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    type="button"
                                    disabled={setPin.isPending || pinInput.length < 4}
                                    onClick={() => {
                                        if (!settingPinProfile) return;
                                        setPin.mutate({ profile: settingPinProfile, pin: pinInput });
                                    }}
                                    className="w-full rounded bg-white py-3 text-sm font-bold text-black hover:bg-neutral-200 disabled:opacity-50 disabled:hover:bg-white transition-all transform active:scale-95"
                                >
                                    {setPin.isPending ? "Setting..." : "Set PIN"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSettingPinProfile(null);
                                        setPinInput("");
                                        setPinError(null);
                                    }}
                                    className="w-full py-2 text-sm text-neutral-500 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
