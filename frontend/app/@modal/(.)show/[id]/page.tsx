"use client";

import { Modal } from "@/components/Modal";
import { ShowDetailView } from "@/components/ShowDetailView";
import { useRouter, usePathname } from "next/navigation";

export default function ShowDetailModal({ params }: { params: { id: string } }) {
    const router = useRouter();
    const pathname = usePathname();
    const isVisible = pathname === `/show/${params.id}`;

    return (
        <Modal isOpen={isVisible} onClose={() => router.back()}>
            <div className="max-h-[90vh] overflow-y-auto scrollbar-none rounded-xl">
                <ShowDetailView key={params.id} id={params.id} />
            </div>
        </Modal>
    );
}
