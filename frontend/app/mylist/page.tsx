"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/http";
import { GridView } from "@/components/GridView";
import type { ShowSummaryCard as ShowSummary } from "@/components/ShowCard";

export default function MyListPage() {
    const infiniteQuery = useInfiniteQuery({
        queryKey: ["watchlist"],
        queryFn: async () => {
            const res = await api.get<{ items: ShowSummary[] }>("/user/list");
            return res.data;
        },
        getNextPageParam: () => undefined,
        initialPageParam: 1,
    });

    return (
        <GridView
            title="My List"
            infiniteQuery={infiniteQuery as any}
            emptyMessage="You haven't added anything to your list yet."
        />
    );
}
