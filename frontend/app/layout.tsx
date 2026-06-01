import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";
import { LayoutShell } from "@/components/LayoutShell";
import { ClientProviders } from "@/components/ClientProviders";

export const viewport: Viewport = {
    viewportFit: "cover",
};

export const metadata: Metadata = {
    title: {
        default: "Filim",
        template: "%s | Filim"
    },
    description: "A streaming platform for anime, shows, and movies."
};

export default function RootLayout({
    children,
    modal
}: {
    children: ReactNode;
    modal: ReactNode;
}) {
    return (
        <html lang="en">
            <body className="bg-background text-foreground min-h-screen antialiased">
                <ClientProviders>
                    <LayoutShell>
                        {children}
                    </LayoutShell>
                    {modal}
                </ClientProviders>
            </body>
        </html>
    );
}

