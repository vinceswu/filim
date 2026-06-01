export function requestFullscreen(element: HTMLElement) {
    if (element.requestFullscreen) {
        return element.requestFullscreen();
    } else if ((element as any).webkitRequestFullscreen) {
        return (element as any).webkitRequestFullscreen();
    } else if ((element as any).mozRequestFullScreen) {
        return (element as any).mozRequestFullScreen();
    } else if ((element as any).msRequestFullscreen) {
        return (element as any).msRequestFullscreen();
    }
    return Promise.reject("Fullscreen not supported");
}

export function isMobile() {
    if (typeof navigator === "undefined") return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (window.innerWidth < 768);
}

export function handlePlayWithFullscreen(href: string, router: any) {
    router.push(href);
    if (isMobile()) {
        requestFullscreen(document.documentElement).catch(() => {});
    }
}
