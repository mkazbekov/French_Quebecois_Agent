"use client";

import { useEffect, useState } from "react";

type VersionInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  checkedAt: string;
  howToUpdate: string;
};

/**
 * Small footer badge: plain "vX.Y.Z" normally, or an emerald/amber pill
 * "vX.Y.Z available" when a newer version has been published. Renders
 * nothing but the plain version while loading or on any fetch error — never
 * blocks or breaks the footer it lives in.
 */
export default function VersionBadge() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/version")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.current !== "string") return;
        setInfo(data as VersionInfo);
      })
      .catch(() => {
        // Stay in the "plain version, no data" state.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) return null;

  if (!info.updateAvailable || !info.latest) {
    return <span> · v{info.current}</span>;
  }

  return (
    <span
      className="ml-1 inline-flex cursor-pointer items-center gap-1 rounded-full bg-due-tint px-2 py-0.5 text-due"
      title={info.howToUpdate}
      onClick={() => setExpanded((e) => !e)}
    >
      v{info.latest} available
      {expanded ? <span className="font-normal">— {info.howToUpdate}</span> : null}
    </span>
  );
}
