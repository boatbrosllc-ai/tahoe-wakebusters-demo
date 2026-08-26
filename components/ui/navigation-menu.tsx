"use client";

import * as React from "react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type NavItemType = {
  title: string;
  href: string;
  description?: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  image?: string;
  imageAlt?: string;
};

function NavigationMenu({
  className,
  children,
  viewport = true,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean;
}) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      data-viewport={viewport}
      className={cn(
        // static so mega-menu panels can position against the header
        "group/navigation-menu flex flex-1 items-center justify-center",
        viewport && "relative",
        className
      )}
      {...props}
    >
      {children}
      {viewport && <NavigationMenuViewport />}
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn(
        "group flex flex-1 list-none items-center justify-center gap-1",
        className
      )}
      {...props}
    />
  );
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
}

function NavigationMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(
        "group inline-flex w-max items-center justify-center rounded-lg px-4 py-3 text-base font-semibold text-white outline-none transition-colors hover:bg-white/20 hover:text-white focus:bg-white/20 focus:text-white focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-white/25 data-[state=open]:text-white",
        className
      )}
      {...props}
    >
      {children}{" "}
      <ChevronDownIcon
        className="relative top-[1px] ml-1.5 size-4 transition duration-300 group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const syncToHeader = React.useCallback(() => {
    const header =
      contentRef.current?.closest("[data-site-header]") ??
      document.querySelector("[data-site-header]");
    if (!header) return;
    const rect = header.getBoundingClientRect();
    setBox({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  React.useLayoutEffect(() => {
    syncToHeader();
    window.addEventListener("resize", syncToHeader);
    window.addEventListener("scroll", syncToHeader, true);
    return () => {
      window.removeEventListener("resize", syncToHeader);
      window.removeEventListener("scroll", syncToHeader, true);
    };
  }, [syncToHeader]);

  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      ref={contentRef}
      {...props}
      style={
        box
          ? {
              ...((props.style as React.CSSProperties | undefined) ?? {}),
              position: "fixed",
              top: box.top,
              left: box.left,
              width: box.width,
              maxWidth: box.width,
              // Kill Radix enter/exit transforms — they fight fixed full-width panels
              transform: "none",
              animation: "none",
            }
          : props.style
      }
      className={cn(
        "z-50 overflow-hidden rounded-2xl border border-brand-dark/10 bg-white text-brand-dark shadow-premium",
        // Instant show/hide — no crossfade/slide between Fleet ↔ Company
        "data-[state=closed]:hidden data-[state=open]:block",
        "data-[motion]:!animate-none data-[motion]:!transition-none",
        className
      )}
    />
  );
}

function NavigationMenuViewport({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  return (
    <div className="absolute left-1/2 top-full z-50 flex w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 justify-center">
      <NavigationMenuPrimitive.Viewport
        data-slot="navigation-menu-viewport"
        className={cn(
          "relative mt-2 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-xl border border-brand-dark/10 bg-white/95 text-brand-dark shadow-premium backdrop-blur-xl md:w-[var(--radix-navigation-menu-viewport-width)]",
          className
        )}
        {...props}
      />
    </div>
  );
}

function NavigationMenuLink({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(
        "flex flex-col justify-center gap-1 rounded-lg px-4 py-2 text-sm text-brand-dark/80 outline-none transition-all hover:bg-brand-bg hover:text-brand-dark focus:bg-brand-bg focus:text-brand-dark focus-visible:ring-2 focus-visible:ring-brand-primary data-[active=true]:bg-brand-primary/10 data-[active=true]:text-brand-primary [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-brand-muted",
        className
      )}
      {...props}
    />
  );
}

function NavigationMenuIndicator({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
  return (
    <NavigationMenuPrimitive.Indicator
      data-slot="navigation-menu-indicator"
      className={cn(
        "top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-brand-dark/15 shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  );
}

function NavGridCard({
  link,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  link: NavItemType;
}) {
  if (link.image) {
    return (
      <NavigationMenuPrimitive.Link asChild>
        <a
          href={link.href}
          className={cn(
            "group relative block h-full min-h-[11rem] overflow-hidden rounded-xl border border-brand-dark/10 bg-brand-dark shadow-soft outline-none transition focus-visible:ring-2 focus-visible:ring-brand-primary",
            className
          )}
        >
          <img
            src={link.image}
            alt={link.imageAlt || link.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628]/90 via-[#0a1628]/35 to-transparent" />
          <div className="relative z-10 flex h-full min-h-[11rem] flex-col justify-end p-4 sm:p-5">
            <span className="font-display text-lg font-extrabold text-white">{link.title}</span>
            {link.description ? (
              <p className="mt-1 text-sm text-white/80">{link.description}</p>
            ) : null}
          </div>
        </a>
      </NavigationMenuPrimitive.Link>
    );
  }

  return (
    <NavigationMenuPrimitive.Link asChild>
      <a
        href={link.href}
        className={cn(
          "group flex h-full min-h-[7.5rem] flex-col justify-between rounded-xl border border-brand-dark/10 bg-brand-bg/40 p-5 outline-none transition-colors hover:border-brand-primary/40 hover:bg-brand-bg focus-visible:ring-2 focus-visible:ring-brand-primary",
          className
        )}
      >
        {link.icon ? (
          <link.icon className="size-6 text-brand-primary" aria-hidden />
        ) : (
          <span />
        )}
        <div>
          <span className="text-base font-semibold text-brand-dark">{link.title}</span>
          {link.description ? (
            <p className="mt-1.5 text-sm leading-snug text-brand-muted">{link.description}</p>
          ) : null}
        </div>
      </a>
    </NavigationMenuPrimitive.Link>
  );
}

function NavSmallItem({
  item,
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuLink> & {
  item: Omit<NavItemType, "description">;
}) {
  return (
    <NavigationMenuLink
      className={cn(
        "group relative h-max flex-row items-center gap-x-3 px-2 py-2",
        className
      )}
      {...props}
    >
      {item.icon && <item.icon className="size-4 text-brand-primary" />}
      <p className="text-sm font-medium">{item.title}</p>
      <div className="relative ml-auto flex h-full w-4 items-center">
        <ArrowRightIcon className="size-4 -translate-x-2 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
      </div>
    </NavigationMenuLink>
  );
}

function NavLargeItem({
  link,
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuLink> & {
  link: NavItemType;
}) {
  return (
    <NavigationMenuLink
      className={cn(
        "group relative flex flex-col justify-center border border-brand-dark/10 bg-white p-0",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <div className="space-y-1">
          <span className="text-sm font-medium leading-none">{link.title}</span>
          {link.description && (
            <p className="line-clamp-1 text-xs text-brand-muted">{link.description}</p>
          )}
        </div>
        {link.icon && <link.icon className="size-6 text-brand-muted" />}
      </div>
    </NavigationMenuLink>
  );
}

function NavItemMobile({
  item,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  item: NavItemType;
}) {
  return (
    <a
      className={cn(
        "group relative flex gap-x-2 rounded-lg p-2 text-sm text-brand-dark outline-none transition-all hover:bg-brand-bg focus-visible:ring-2 focus-visible:ring-brand-primary",
        className
      )}
      {...props}
    >
      <div className="flex size-10 items-center justify-center rounded-lg border border-brand-dark/10 bg-brand-bg/60">
        {item.icon && <item.icon className="size-4 text-brand-primary" />}
      </div>
      <div className="flex h-10 flex-col justify-center">
        <p className="text-sm font-medium">{item.title}</p>
        <span className="line-clamp-1 text-xs leading-snug text-brand-muted">
          {item.description}
        </span>
      </div>
    </a>
  );
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  NavGridCard,
  NavSmallItem,
  NavLargeItem,
  NavItemMobile,
  type NavItemType,
};
