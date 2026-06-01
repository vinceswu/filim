"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http";
import { useProfile } from "@/lib/profile-context";

type PreferenceItem = {
    show_id: string;
    in_list: boolean;
};

type PreferencesResponse = {
    items: PreferenceItem[];
};

export function usePreferences() {
    const queryClient = useQueryClient();
    const { profile } = useProfile();

    const preferences = useQuery({
        queryKey: ["preferences", profile?.id],
        enabled: !!profile?.id && !profile?.is_guest,
        queryFn: async () => {
            const res = await api.get<PreferencesResponse>("/user/preferences");
            return res.data.items;
        }
    });

    const getPreferenceForShow = (showId: string): PreferenceItem | undefined => {
        return preferences.data?.find((item) => item.show_id === showId);
    };

    const toggleList = useMutation({
        mutationFn: async (payload: { showId: string; inList: boolean }) => {
            await api.post("/user/preferences/list", {
                show_id: payload.showId,
                in_list: payload.inList
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["preferences", profile?.id] });
        }
    });

    const handleToggleList = (showId: string) => {
        if (profile?.is_guest) return;
        const current = getPreferenceForShow(showId);
        const nextInList = !current?.in_list;
        toggleList.mutate({ showId, inList: nextInList });
    };

    return {
        preferences,
        getPreferenceForShow,
        handleToggleList,
        isInList: (showId: string) => getPreferenceForShow(showId)?.in_list ?? false,
    };
}
