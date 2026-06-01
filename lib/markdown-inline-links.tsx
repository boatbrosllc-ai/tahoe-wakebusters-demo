import Link from "next/link";

const linkClass =
  "text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded";

export function parseInlineLinks(
  content: string
): (string | { text: string; href: string; external: boolean })[] {
  const segments: (string | { text: string; href: string; external: boolean })[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) segments.push(content.slice(lastIndex, match.index));
    segments.push({
      text: match[1],
      href: match[2],
      external: match[2].startsWith("http"),
    });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) segments.push(content.slice(lastIndex));
  return segments.length ? segments : [content];
}

export function InlineMarkdownLinks({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const segments = parseInlineLinks(content);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        typeof seg === "string" ? (
          <span key={i}>{seg}</span>
        ) : seg.external ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {seg.text}
          </a>
        ) : (
          <Link key={i} href={seg.href} className={linkClass}>
            {seg.text}
          </Link>
        )
      )}
    </span>
  );
}
