"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    adminFetch,
    clearAdminToken,
    getAdminToken,
    setAdminToken,
} from "@/lib/admin-context";

// ── Types ─────────────────────────────────────────────────────────────────────

type Settings = {
    allow_creating_profiles: boolean;
    guest_profile_enabled: boolean;
    max_profiles: number | null;
    require_profile_pins: boolean;
    max_concurrent_streams: number | null;
};

type ProfileEntry = {
    id: string;
    name: string;
    is_locked: boolean;
    is_guest: boolean;
    max_concurrent_streams: number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
    "bg-violet-700", "bg-blue-700", "bg-emerald-700",
    "bg-amber-700", "bg-rose-700", "bg-teal-700",
    "bg-orange-700", "bg-indigo-700",
];

function avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Toggle({
    checked,
    onChange,
    disabled,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => !disabled && onChange(!checked)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ncyan ${
                disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
            } ${checked ? "bg-ncyan" : "bg-neutral-700"}`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    checked ? "translate-x-6" : "translate-x-1"
                }`}
            />
        </button>
    );
}

function Card({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-surface border border-neutral-800 rounded-xl overflow-hidden">
            {children}
        </div>
    );
}

function SectionHeader({ title }: { title: string }) {
    return (
        <div className="px-5 pt-5 pb-2">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{title}</p>
        </div>
    );
}

function FieldRow({ label, sub, children, className }: { label: string; sub?: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={`flex items-center justify-between gap-4 px-5 py-4 ${className ?? ""}`}>
            <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                {sub && <p className="text-xs text-neutral-500 mt-0.5 leading-snug">{sub}</p>}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

function Divider() {
    return <div className="border-t border-neutral-800 mx-5" />;
}

function SkeletonCard() {
    return (
        <div className="bg-surface border border-neutral-800 rounded-xl p-5 space-y-5 animate-pulse">
            <div className="h-2.5 w-20 bg-neutral-800 rounded" />
            {[40, 52, 36].map((w, i) => (
                <div key={i} className="flex justify-between items-center">
                    <div className="space-y-2">
                        <div className={`h-3 w-${w} bg-neutral-800 rounded`} />
                        <div className="h-2 w-48 bg-neutral-800 rounded" />
                    </div>
                    <div className="h-6 w-11 bg-neutral-800 rounded-full" />
                </div>
            ))}
        </div>
    );
}

// ── Login ─────────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!password || loading) return;
        setLoading(true);
        setError(null);
        try {
            const data = await adminFetch<{ token: string }>("/login", {
                method: "POST",
                body: JSON.stringify({ password }),
            });
            setAdminToken(data.token);
            onLogin();
        } catch (e: any) {
            setError(e.status === 401 ? "Incorrect password" : "Connection error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-6">
            <div className="w-full max-w-xs space-y-8 text-center">
                <div>
                    <div className="text-ncyan text-3xl font-black tracking-tighter uppercase mb-1">Filim</div>
                    <p className="text-neutral-400 text-sm">Admin Panel</p>
                </div>
                <div className="space-y-3">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(null); }}
                        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                        className="dialog-input text-center"
                        placeholder="Admin password"
                        autoFocus
                    />
                    {error && (
                        <p className="text-nred text-xs font-medium flex items-center justify-center gap-1.5">
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {error}
                        </p>
                    )}
                </div>
                <button
                    onClick={handleLogin}
                    disabled={loading || !password}
                    className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-neutral-200 disabled:opacity-40 transition-all active:scale-95"
                >
                    {loading ? "Signing in…" : "Sign In"}
                </button>
                <Link href="/" className="block text-xs text-neutral-600 hover:text-neutral-400 transition-colors">
                    ← Back to Filim
                </Link>
            </div>
        </div>
    );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ onLogout }: { onLogout: () => void }) {
    const [tab, setTab] = useState<"settings" | "profiles">("settings");
    const [settings, setSettings] = useState<Settings | null>(null);
    const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
    const [loadingSettings, setLoadingSettings] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchSettings = async () => {
        try {
            const data = await adminFetch<Settings>("/settings");
            setSettings(data);
        } catch {
            showToast("Failed to load settings", false);
        } finally {
            setLoadingSettings(false);
        }
    };

    const fetchProfiles = async () => {
        try {
            const data = await adminFetch<{ items: ProfileEntry[] }>("/profiles");
            setProfiles(data.items);
        } catch {}
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        void fetchSettings();
        void fetchProfiles();
    }, []);

    const patchSettings = async (patch: Partial<Record<string, unknown>>) => {
        setSaving(true);
        try {
            const res = await adminFetch<{ status: string; password_changed?: boolean }>(
                "/settings",
                { method: "PATCH", body: JSON.stringify(patch) }
            );
            if (res.password_changed) {
                showToast("Password changed — please sign in again");
                clearAdminToken();
                setTimeout(onLogout, 1500);
                return;
            }
            await fetchSettings();
            showToast("Saved");
        } catch (e: any) {
            showToast(e.message ?? "Error", false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-neutral-800">
                <div className="flex items-center justify-between px-5 h-14">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/"
                            className="text-neutral-500 hover:text-white transition-colors p-1 -ml-1 rounded-md hover:bg-white/5"
                            aria-label="Back to app"
                        >
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </Link>
                        <div className="flex items-center gap-2">
                            <span className="text-ncyan font-black tracking-tighter uppercase text-lg leading-none">Filim</span>
                            <span className="text-neutral-700 text-sm">/</span>
                            <span className="text-neutral-400 text-sm font-medium">Admin</span>
                        </div>
                    </div>
                    <button
                        onClick={() => { clearAdminToken(); onLogout(); }}
                        className="text-xs text-neutral-500 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-white/5"
                    >
                        Sign out
                    </button>
                </div>
            </header>

            {/* Tab bar */}
            <div className="px-5 pt-4 pb-0">
                <div className="flex gap-1 p-1 bg-neutral-900 rounded-xl max-w-xl mx-auto">
                    {(["settings", "profiles"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`flex-1 py-2 text-sm font-medium capitalize rounded-lg transition-all ${
                                tab === t
                                    ? "bg-surface text-white shadow-sm"
                                    : "text-neutral-500 hover:text-neutral-300"
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-xl mx-auto px-5 py-5 space-y-4">
                {loadingSettings ? (
                    <>
                        <SkeletonCard />
                        <SkeletonCard />
                    </>
                ) : !settings ? (
                    <div className="flex flex-col items-center gap-4 py-12 text-center">
                        <div className="w-12 h-12 rounded-full bg-nred/10 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-6 h-6 text-nred" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">Failed to load settings</p>
                            <p className="text-xs text-neutral-500 mt-1">Check your connection and try again</p>
                        </div>
                        <button
                            onClick={() => { void fetchSettings(); void fetchProfiles(); }}
                            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-bold hover:bg-neutral-200 transition-all"
                        >
                            Retry
                        </button>
                    </div>
                ) : tab === "settings" ? (
                    <SettingsTab settings={settings} onPatch={patchSettings} saving={saving} />
                ) : (
                    <ProfilesTab
                        settings={settings}
                        profiles={profiles}
                        onRefreshProfiles={fetchProfiles}
                        showToast={showToast}
                    />
                )}
            </div>

            {toast && (
                <div
                    className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2 transition-all ${
                        toast.ok ? "bg-ncyan text-black" : "bg-nred text-white"
                    }`}
                >
                    {toast.ok ? (
                        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    )}
                    {toast.msg}
                </div>
            )}
        </div>
    );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function NumberStepper({
    value,
    onChange,
    min = 1,
    max = 99,
}: {
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
}) {
    return (
        <div className="flex items-center gap-0 border border-neutral-700 rounded-lg overflow-hidden">
            <button
                type="button"
                onClick={() => onChange(Math.max(min, value - 1))}
                disabled={value <= min}
                className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
            </button>
            <input
                type="number"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || min)))}
                className="w-12 h-9 bg-transparent text-center text-sm font-medium text-foreground focus:outline-none border-x border-neutral-700"
            />
            <button
                type="button"
                onClick={() => onChange(Math.min(max, value + 1))}
                disabled={value >= max}
                className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
            </button>
        </div>
    );
}

function SettingsTab({
    settings,
    onPatch,
    saving,
}: {
    settings: Settings;
    onPatch: (patch: Record<string, unknown>) => Promise<void>;
    saving: boolean;
}) {
    const [allowCreating, setAllowCreating] = useState(settings.allow_creating_profiles);
    const [guestEnabled, setGuestEnabled] = useState(settings.guest_profile_enabled);
    const [requirePins, setRequirePins] = useState(settings.require_profile_pins);
    const [limitProfiles, setLimitProfiles] = useState(settings.max_profiles !== null);
    const [maxProfiles, setMaxProfiles] = useState(settings.max_profiles ?? 5);
    const [limitStreams, setLimitStreams] = useState(settings.max_concurrent_streams !== null);
    const [maxStreams, setMaxStreams] = useState(settings.max_concurrent_streams ?? 2);

    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [pwError, setPwError] = useState<string | null>(null);

    useEffect(() => {
        setAllowCreating(settings.allow_creating_profiles);
        setGuestEnabled(settings.guest_profile_enabled);
        setRequirePins(settings.require_profile_pins);
        setLimitProfiles(settings.max_profiles !== null);
        setMaxProfiles(settings.max_profiles ?? 5);
        setLimitStreams(settings.max_concurrent_streams !== null);
        setMaxStreams(settings.max_concurrent_streams ?? 2);
    }, [settings]);

    const profileSettingsChanged =
        allowCreating !== settings.allow_creating_profiles ||
        guestEnabled !== settings.guest_profile_enabled ||
        requirePins !== settings.require_profile_pins ||
        limitProfiles !== (settings.max_profiles !== null) ||
        (limitProfiles && maxProfiles !== (settings.max_profiles ?? 5)) ||
        limitStreams !== (settings.max_concurrent_streams !== null) ||
        (limitStreams && maxStreams !== (settings.max_concurrent_streams ?? 2));

    const saveProfileSettings = async () => {
        const patch: Record<string, unknown> = {
            allow_creating_profiles: allowCreating,
            guest_profile_enabled: guestEnabled,
            require_profile_pins: requirePins,
        };
        if (limitProfiles) {
            patch.max_profiles = maxProfiles;
        } else {
            patch.clear_max_profiles = true;
        }
        if (limitStreams) {
            patch.max_concurrent_streams = maxStreams;
        } else {
            patch.clear_max_concurrent_streams = true;
        }
        await onPatch(patch);
    };

    const savePassword = async () => {
        if (!newPw) return;
        if (newPw !== confirmPw) { setPwError("Passwords don't match"); return; }
        if (newPw.length < 4) { setPwError("Min 4 characters"); return; }
        setPwError(null);
        await onPatch({ admin_password: newPw });
        setNewPw("");
        setConfirmPw("");
    };

    return (
        <>
            {/* Access */}
            <Card>
                <SectionHeader title="Access" />
                <FieldRow label="Allow creating profiles" sub="Users can create profiles from the profiles page">
                    <Toggle checked={allowCreating} onChange={setAllowCreating} />
                </FieldRow>
                <Divider />
                <FieldRow label="Guest profile" sub="Show the Guest profile on the profile picker">
                    <Toggle checked={guestEnabled} onChange={setGuestEnabled} />
                </FieldRow>
                <Divider />
                <FieldRow label="Require PINs" sub="All non-guest profiles must have a PIN">
                    <Toggle checked={requirePins} onChange={setRequirePins} />
                </FieldRow>
            </Card>

            {/* Limits */}
            <Card>
                <SectionHeader title="Limits" />
                <FieldRow label="Limit profiles" sub="Maximum number of profiles (excluding guest)">
                    <Toggle checked={limitProfiles} onChange={setLimitProfiles} />
                </FieldRow>
                {limitProfiles && (
                    <div className="flex items-center justify-between px-5 pb-4">
                        <span className="text-sm text-neutral-400">Max profiles</span>
                        <NumberStepper value={maxProfiles} onChange={setMaxProfiles} min={1} max={50} />
                    </div>
                )}
                <Divider />
                <FieldRow label="Simultaneous streams" sub="Max concurrent streams per profile (global default)">
                    <Toggle checked={limitStreams} onChange={setLimitStreams} />
                </FieldRow>
                {limitStreams && (
                    <div className="flex items-center justify-between px-5 pb-4">
                        <span className="text-sm text-neutral-400">Streams per profile</span>
                        <NumberStepper value={maxStreams} onChange={setMaxStreams} min={1} max={20} />
                    </div>
                )}
                <div className="px-5 pb-5 pt-2">
                    <button
                        onClick={saveProfileSettings}
                        disabled={saving || !profileSettingsChanged}
                        className="w-full py-2.5 rounded-lg bg-white text-black text-sm font-bold hover:bg-neutral-200 disabled:opacity-40 transition-all active:scale-[0.98]"
                    >
                        {saving ? "Saving…" : "Save Changes"}
                    </button>
                </div>
            </Card>

            {/* Admin Password */}
            <Card>
                <SectionHeader title="Admin Password" />
                <div className="px-5 pb-5 space-y-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-neutral-400">New password</label>
                        <input
                            type="password"
                            value={newPw}
                            onChange={(e) => { setNewPw(e.target.value); setPwError(null); }}
                            className="dialog-input"
                            placeholder="Enter new password"
                            autoComplete="new-password"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-neutral-400">Confirm password</label>
                        <input
                            type="password"
                            value={confirmPw}
                            onChange={(e) => { setConfirmPw(e.target.value); setPwError(null); }}
                            className="dialog-input"
                            placeholder="Repeat new password"
                            autoComplete="new-password"
                        />
                    </div>
                    {pwError && (
                        <p className="text-nred text-xs flex items-center gap-1.5">
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {pwError}
                        </p>
                    )}
                    <button
                        onClick={savePassword}
                        disabled={saving || newPw.length < 4 || confirmPw.length < 4}
                        className="w-full py-2.5 rounded-lg bg-white text-black text-sm font-bold hover:bg-neutral-200 disabled:opacity-40 transition-all active:scale-[0.98]"
                    >
                        {saving ? "Saving…" : "Change Password"}
                    </button>
                </div>
            </Card>
        </>
    );
}

// ── Stream Limit Cell ─────────────────────────────────────────────────────────

function StreamLimitCell({
    profile,
    globalLimit,
    onSave,
}: {
    profile: ProfileEntry;
    globalLimit: number | null;
    onSave: (profileId: string, value: number | null) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(profile.max_concurrent_streams ?? globalLimit ?? 2);
    const [saving, setSaving] = useState(false);

    const handleSave = async (saveValue: number | null) => {
        setSaving(true);
        await onSave(profile.id, saveValue);
        setSaving(false);
        setEditing(false);
    };

    if (!editing) {
        const hasOverride = profile.max_concurrent_streams !== null;
        return (
            <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors group"
                aria-label="Edit stream limit"
            >
                {hasOverride ? (
                    <span className="text-xs font-semibold text-ncyan tabular-nums">{profile.max_concurrent_streams}</span>
                ) : (
                    <span className="text-xs text-neutral-600">global</span>
                )}
                <svg viewBox="0 0 24 24" className="w-3 h-3 text-neutral-700 group-hover:text-neutral-400 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
            </button>
        );
    }

    return (
        <div className="flex items-center gap-1.5 py-1">
            <input
                type="number"
                min={1}
                max={20}
                value={value}
                onChange={(e) => setValue(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 h-7 bg-neutral-800 border border-neutral-700 rounded-md px-2 text-xs text-white text-center focus:outline-none focus:border-ncyan"
                autoFocus
            />
            <button
                onClick={() => handleSave(value)}
                disabled={saving}
                className="h-7 px-2.5 rounded-md bg-ncyan text-black text-xs font-bold hover:bg-ncyan/80 disabled:opacity-40 transition-all"
            >
                {saving ? "…" : "Save"}
            </button>
            {profile.max_concurrent_streams !== null && (
                <button
                    onClick={() => handleSave(null)}
                    disabled={saving}
                    className="h-7 px-2 rounded-md text-xs text-neutral-500 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-colors"
                    title="Use global limit"
                >
                    Global
                </button>
            )}
            <button
                onClick={() => setEditing(false)}
                className="h-7 w-7 flex items-center justify-center rounded-md text-neutral-600 hover:text-white hover:bg-white/5 transition-colors"
            >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
}

// ── Profiles Tab ──────────────────────────────────────────────────────────────

function ProfilesTab({
    settings,
    profiles,
    onRefreshProfiles,
    showToast,
}: {
    settings: Settings;
    profiles: ProfileEntry[];
    onRefreshProfiles: () => Promise<void>;
    showToast: (msg: string, ok?: boolean) => void;
}) {
    const [newName, setNewName] = useState("");
    const [createPin, setCreatePin] = useState("");
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const createProfile = async () => {
        if (!newName.trim() || creating) return;
        if (settings.require_profile_pins && createPin.length !== 4) {
            showToast("A 4-digit PIN is required", false);
            return;
        }
        setCreating(true);
        try {
            await adminFetch("/profiles", {
                method: "POST",
                body: JSON.stringify({
                    name: newName.trim(),
                    pin: createPin.trim() || null
                }),
            });
            setNewName("");
            setCreatePin("");
            await onRefreshProfiles();
            showToast("Profile created");
        } catch (e: any) {
            showToast(e.message ?? "Error", false);
        } finally {
            setCreating(false);
        }
    };

    const deleteProfile = async (id: string) => {
        setDeletingId(id);
        setConfirmDeleteId(null);
        try {
            await adminFetch(`/profiles/${id}`, { method: "DELETE" });
            await onRefreshProfiles();
            showToast("Profile deleted");
        } catch (e: any) {
            showToast(e.message ?? "Error", false);
        } finally {
            setDeletingId(null);
        }
    };

    const updateStreamLimit = async (profileId: string, value: number | null) => {
        try {
            const body = value === null
                ? { clear_max_concurrent_streams: true }
                : { max_concurrent_streams: value };
            await adminFetch(`/profiles/${profileId}`, {
                method: "PATCH",
                body: JSON.stringify(body),
            });
            await onRefreshProfiles();
            showToast("Saved");
        } catch (e: any) {
            showToast(e.message ?? "Error", false);
        }
    };

    return (
        <>
            {/* Create profile */}
            <Card>
                <SectionHeader title="New Profile" />
                <div className="px-5 pb-5 space-y-3">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="dialog-input"
                        placeholder="Profile name"
                        maxLength={30}
                    />
                    <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={createPin}
                        onChange={(e) => setCreatePin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        onKeyDown={(e) => e.key === "Enter" && createProfile()}
                        className="dialog-input"
                        placeholder={settings.require_profile_pins ? "PIN" : "PIN (optional)"}
                    />
                    <button
                        onClick={createProfile}
                        disabled={creating || !newName.trim() || (settings.require_profile_pins && createPin.length !== 4)}
                        className="w-full py-2.5 rounded-lg bg-ncyan text-black text-sm font-bold hover:bg-ncyan/80 disabled:opacity-40 transition-all active:scale-[0.98]"
                    >
                        {creating ? "Creating…" : "Create Profile"}
                    </button>
                </div>
            </Card>

            {/* Profile list */}
            <Card>
                <SectionHeader title={`Profiles (${profiles.length})`} />

                {profiles.length === 0 ? (
                    <div className="px-5 pb-8 pt-4 flex flex-col items-center gap-3 text-center">
                        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                            </svg>
                        </div>
                        <p className="text-sm text-neutral-600">No profiles yet</p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center text-[10px] uppercase font-bold text-neutral-600 tracking-widest px-5 pb-2">
                            <span className="flex-1">Profile</span>
                            <span className="mr-3">Streams</span>
                            <span className="w-8" />
                        </div>
                        <div className="divide-y divide-neutral-800">
                            {profiles.map((p) => (
                                <div key={p.id}>
                                    <div className="flex items-center gap-3 px-5 py-3.5">
                                        {/* Avatar */}
                                        <div className={`h-9 w-9 rounded-lg ${avatarColor(p.name)} flex items-center justify-center text-sm font-bold text-white shrink-0`}>
                                            {p.name.slice(0, 1).toUpperCase()}
                                        </div>

                                        {/* Name + badges */}
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-medium text-foreground truncate block">{p.name}</span>
                                            <div className="flex gap-1 mt-0.5">
                                                {p.is_guest && (
                                                    <span className="text-[10px] px-1.5 py-px rounded bg-neutral-800 text-neutral-500 font-medium border border-neutral-700">Guest</span>
                                                )}
                                                {p.is_locked && (
                                                    <span className="text-[10px] px-1.5 py-px rounded bg-ncyan/10 text-ncyan font-medium border border-ncyan/20">PIN</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Stream limit */}
                                        <StreamLimitCell
                                            profile={p}
                                            globalLimit={settings.max_concurrent_streams}
                                            onSave={updateStreamLimit}
                                        />

                                        {/* Delete */}
                                        <div className="w-8 flex justify-center shrink-0">
                                            {!p.is_guest ? (
                                                confirmDeleteId === p.id ? null : (
                                                    <button
                                                        onClick={() => setConfirmDeleteId(p.id)}
                                                        disabled={deletingId === p.id}
                                                        className="p-1.5 rounded-md text-neutral-600 hover:text-nred hover:bg-nred/10 transition-colors disabled:opacity-40"
                                                        aria-label={`Delete ${p.name}`}
                                                    >
                                                        {deletingId === p.id ? (
                                                            <span className="text-xs w-4 block text-center">…</span>
                                                        ) : (
                                                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="3 6 5 6 21 6" />
                                                                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                                                <path d="M10 11v6M14 11v6" />
                                                                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                )
                                            ) : (
                                                <span className="text-neutral-800 text-xs w-8 text-center">—</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Inline delete confirm */}
                                    {confirmDeleteId === p.id && (
                                        <div className="flex items-center justify-between px-5 py-2.5 bg-nred/5 border-t border-nred/10">
                                            <p className="text-xs text-nred font-medium">Delete &quot;{p.name}&quot;?</p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setConfirmDeleteId(null)}
                                                    className="px-3 py-1 rounded-md text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => deleteProfile(p.id)}
                                                    disabled={deletingId === p.id}
                                                    className="px-3 py-1 rounded-md text-xs font-bold bg-nred text-white hover:bg-nred/80 disabled:opacity-40 transition-all"
                                                >
                                                    {deletingId === p.id ? "Deleting…" : "Delete"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="h-1" />
                    </>
                )}
            </Card>
        </>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
    const [authed, setAuthed] = useState<boolean | null>(null);

    useEffect(() => {
        setAuthed(!!getAdminToken());
    }, []);

    if (authed === null) return <div className="min-h-screen bg-background" />;
    if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;
    return <Dashboard onLogout={() => setAuthed(false)} />;
}
