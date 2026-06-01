/** Match episode identifiers across URL segments, catalog, and stored progress (e.g. "1" vs "01", "E3" vs "3"). */
export function episodesMatchForProgress(a: string, b: string): boolean {
    const norm = (raw: string) => String(raw).toLowerCase().replace(/^e/, "").trim();
    const na = norm(a);
    const nb = norm(b);
    if (na === nb) return true;
    return na.padStart(2, "0") === nb.padStart(2, "0");
}
