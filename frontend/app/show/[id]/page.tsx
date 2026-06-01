"use client";

import { ShowDetailView } from "@/components/ShowDetailView";
import { useParams } from "next/navigation";

export default function ShowDetailsPage() {
    const params = useParams<{ id: string }>();

    return (
        <div className="min-h-screen bg-background pt-20 pb-12">
            <div className="max-w-4xl mx-auto rounded-xl overflow-hidden shadow-2xl bg-neutral-900/40">
                <ShowDetailView key={params.id} id={params.id as string} />
            </div>
        </div>
    );
}
