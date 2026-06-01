"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/http";
import { GridView } from "@/components/GridView";
import type { ShowSummaryCard as ShowSummary } from "@/components/ShowCard";

export default function MoviesPage() {
    const infiniteQuery = useInfiniteQuery({
        queryKey: ["movies"],
        queryFn: async ({ pageParam = 1 }) => {
            const res = await api.get<{ items: ShowSummary[] }>("/catalog/movies", {
                params: { page: pageParam }
            });
            return res.data;
        },
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage || lastPage.items.length === 0) return undefined;
            if (allPages.length >= 500) return undefined;
            return allPages.length + 1;
        },
        initialPageParam: 1,
    });

    return (
        <GridView
            title="Movies"
            infiniteQuery={infiniteQuery as any}
            emptyMessage="No movies found."
        />
    );
}
