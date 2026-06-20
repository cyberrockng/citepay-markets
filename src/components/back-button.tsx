"use client";
import { useRouter } from "next/navigation";

export function BackButton({ label = "Back" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-1 text-[#8b8b9e] hover:text-[#f0f0f5] text-sm transition-colors"
    >
      ← {label}
    </button>
  );
}
