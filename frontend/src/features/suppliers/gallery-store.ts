"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface GalleryImage {
  id: string;
  dataUrl: string;
  title?: string;
}

interface GalleryState {
  images: GalleryImage[];
  addImage: (image: GalleryImage) => void;
  removeImage: (id: string) => void;
}

/**
 * گالری محصولات قطعه‌ساز در حالت دمو (localStorage).
 * در افزایش ۲ به آپلود S3 با presigned URL متصل می‌شود.
 */
export const useGalleryStore = create<GalleryState>()(
  persist(
    (set) => ({
      images: [],
      addImage: (image) =>
        set((state) => ({ images: [image, ...state.images] })),
      removeImage: (id) =>
        set((state) => ({
          images: state.images.filter((img) => img.id !== id),
        })),
    }),
    { name: "partmachine-demo-gallery" },
  ),
);
