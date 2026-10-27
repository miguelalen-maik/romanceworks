"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./BackgroundImage.module.css";

export default function BackgroundImage({ className }: { className: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    let cancelled = false;
    let decoding = false;
    let firstFrame = 0;
    let secondFrame = 0;

    const reveal = async () => {
      if (decoding || !image.naturalWidth) return;
      decoding = true;
      try {
        await image.decode();
        if (cancelled) return;
        // Paint the transparent initial state even when the image is cached.
        firstFrame = requestAnimationFrame(() => {
          secondFrame = requestAnimationFrame(() => {
            if (!cancelled) setReady(true);
          });
        });
      } catch {
        // Keep the black base visible if loading or decoding fails.
      }
    };

    image.addEventListener("load", reveal);
    if (image.complete) void reveal();
    return () => {
      cancelled = true;
      image.removeEventListener("load", reveal);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  return (
    <Image
      ref={imageRef}
      src="/coming-soon/background.png"
      alt=""
      fill
      sizes="100vw"
      preload
      className={`${className} ${styles.image}`}
      data-ready={ready}
    />
  );
}
