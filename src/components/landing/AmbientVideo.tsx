"use client";

import Image, { getImageProps } from "next/image";
import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { MediaSet } from "./data";
import css from "./landing.module.css";

/* Video suasana tanpa suara.
   - Gambar diam (poster, atau foto lokal bila poster belum ada) selalu dirender lebih dulu: elemen LCP, tanpa lompatan tata letak.
   - Video baru dipasang setelah hidrasi, hanya bila pengguna tidak meminta "kurangi gerak" dan tidak dalam mode hemat data.
   - Video memudar masuk saat benar-benar berputar. Bila semua sumber gagal (404), gambar diam tetap tampil.
   - Berhenti saat keluar layar. Tombol jeda selalu ada (WCAG 2.2.2). */

type Props = MediaSet & {
  className?: string;
  imgClassName?: string;
  sizes?: string;
  priority?: boolean;
  /** Posisi tombol jeda di dalam bingkai. */
  controlClassName?: string;
  label?: string;
};

export function AmbientVideo({ sources, poster, posterMobile, fallback, alt, className = "", imgClassName = "", sizes = "100vw", priority = false, controlClassName = "bottom-4 right-4", label = "video latar" }: Props) {
  const reduce = useReducedMotion();
  const [allowed, setAllowed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [stillFailed, setStillFailed] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    setAllowed(!reduce && !conn?.saveData && sources.length > 0);
  }, [reduce, sources.length]);

  // Jeda otomatis saat keluar layar; lanjut lagi saat terlihat (kecuali pengguna menjeda).
  useEffect(() => {
    const v = ref.current;
    const el = box.current;
    if (!allowed || !v || !el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !userPaused) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [allowed, userPaused, failed]);

  // Hanya anggap gagal bila memang tidak ada sumber yang bisa diputar (bukan karena muatan dibatalkan/ditunda peramban).
  const checkFailed = () => {
    setTimeout(() => {
      const v = ref.current;
      if (!v) return;
      const noSource = v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE;
      const fatal = v.error && v.error.code !== MediaError.MEDIA_ERR_ABORTED;
      if (noSource || fatal) setFailed(true);
    }, 0);
  };

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      setUserPaused(false);
      v.play().catch(() => {});
    } else {
      setUserPaused(true);
      v.pause();
    }
  };

  const still = !stillFailed && poster ? poster : fallback;
  const common = { alt, sizes, fill: true, ...(priority ? { preload: true, fetchPriority: "high" as const } : {}) };
  const imgCls = `object-cover ${imgClassName}`;

  let stillEl;
  if (still === poster && posterMobile) {
    // Arah seni: poster potret untuk HP, lanskap untuk layar lebar.
    const { props: desk } = getImageProps({ ...common, src: poster });
    const { props: mob, } = getImageProps({ ...common, src: posterMobile });
    const { srcSet: deskSet, ...rest } = desk;
    stillEl = (
      <picture>
        <source media="(min-width: 768px)" srcSet={deskSet} />
        <source media="(max-width: 767px)" srcSet={mob.srcSet} />
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img {...rest} className={imgCls} onError={() => setStillFailed(true)} />
      </picture>
    );
  } else {
    stillEl = <Image {...common} src={still} className={imgCls} onError={() => setStillFailed(true)} />;
  }

  const showVideo = allowed && !failed;

  return (
    <div ref={box} className={`relative h-full w-full overflow-hidden ${className}`}>
      {stillEl}
      {showVideo && (
        <video
          ref={ref}
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          poster={poster}
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={checkFailed}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[900ms] ease-out-expo ${imgClassName} ${playing ? "opacity-100" : "opacity-0"}`}
        >
          {sources.map((s) => (
            <source key={s.src} src={s.src} media={s.media} type="video/mp4" onError={checkFailed} />
          ))}
        </video>
      )}
      {showVideo && (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? `Jeda ${label}` : `Putar ${label}`}
          className={`absolute z-10 grid h-11 w-11 place-items-center rounded-full text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${css.glass} ${controlClassName}`}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="1.5" width="3" height="11" rx="1" fill="currentColor" /><rect x="8.5" y="1.5" width="3" height="11" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 1.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L4.4 1.3a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>
          )}
        </button>
      )}
    </div>
  );
}
