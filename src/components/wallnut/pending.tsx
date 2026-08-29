"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Spinner } from "./icons";

export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(false);
  }, [pathname]);

  useEffect(() => {
    if (!active) return;
    const timeout = window.setTimeout(() => setActive(false), 12_000);
    return () => window.clearTimeout(timeout);
  }, [active]);

  useEffect(() => {
    document.documentElement.classList.toggle("cursor-progress", active);
    return () => document.documentElement.classList.remove("cursor-progress");
  }, [active]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = (event.target as HTMLElement | null)?.closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      if (target.getAttribute("target") && target.getAttribute("target") !== "_self") return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === pathname && url.search === window.location.search) return;
      setActive(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[80] h-[2px] overflow-hidden transition-opacity ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className={`h-full w-1/3 bg-white ${active ? "wallnut-progress" : ""}`} />
    </div>
  );
}

export function PendingLink({
  pendingLabel,
  children,
  className,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { pendingLabel?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const href =
    typeof props.href === "string" ? props.href : props.href.toString();

  function handleClick(event: ReactMouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <Link
      {...props}
      className={className}
      aria-busy={pending}
      onClick={handleClick}
    >
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <Spinner />
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </Link>
  );
}
