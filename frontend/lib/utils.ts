export function formatTime(totalSeconds: number): string {
    if (!Number.isFinite(totalSeconds)) return "0:00";
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const two = (n: number) => n.toString().padStart(2, "0");

    if (h > 0) {
        return `${h}:${two(m)}:${two(s)}`;
    }
    return `${m}:${two(s)}`;
}
