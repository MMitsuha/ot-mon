"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface ChartCardProps {
  title: ReactNode;
  icon?: ReactNode;
  legend?: ReactNode;
  actions?: ReactNode;
  fullscreenable?: boolean;
  children: ReactNode | ((props: { isFullscreen: boolean }) => ReactNode);
}

export default function ChartCard({
  title,
  icon,
  legend,
  actions,
  fullscreenable = false,
  children,
}: ChartCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreenable) return;

    const onFs = () => {
      setIsFullscreen(document.fullscreenElement === cardRef.current);
    };

    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [fullscreenable]);

  const toggleFullscreen = useCallback(() => {
    if (!fullscreenable || !cardRef.current) return;

    if (document.fullscreenElement === cardRef.current) {
      void document.exitFullscreen();
      return;
    }

    void cardRef.current.requestFullscreen();
  }, [fullscreenable]);

  const content =
    typeof children === "function" ? children({ isFullscreen }) : children;

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 transition-all duration-300 ${
        fullscreenable && isFullscreen ? "flex h-screen w-screen flex-col" : ""
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {icon}
        <div className="min-w-0 shrink-0 text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </div>
        {legend && (
          <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
            {legend}
          </div>
        )}
        {(actions || fullscreenable) && (
          <div className="ml-auto flex items-center gap-2">
            {actions}
            {fullscreenable && (
              <button
                onClick={toggleFullscreen}
                className="rounded-lg p-1.5 text-[var(--text-dim)] transition-colors duration-200 hover:bg-[#1a1a1a] hover:text-[var(--text-primary)]"
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 1 6 6 1 6" />
                    <polyline points="10 15 10 10 15 10" />
                    <line x1="1" y1="6" x2="6" y2="1" />
                    <line x1="15" y1="10" x2="10" y2="15" />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="10 1 15 1 15 6" />
                    <polyline points="6 15 1 15 1 10" />
                    <line x1="15" y1="1" x2="10" y2="6" />
                    <line x1="1" y1="15" x2="6" y2="10" />
                  </svg>
                )}
              </button>
            )}
          </div>
        )}
      </div>
      <div
        className={
          fullscreenable && isFullscreen ? "min-h-0 flex-1" : undefined
        }
      >
        {content}
      </div>
    </div>
  );
}
