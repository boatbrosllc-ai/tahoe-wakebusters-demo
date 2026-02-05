/**
 * Blog posts stub. TODO: Load from CMS (Sanity/Contentful) or MDX.
 */

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author?: string;
  image?: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "best-coves-lake-travis",
    title: "Best Coves on Lake Travis for Boating",
    excerpt: "Our favorite spots to anchor, swim, and relax on Lake Travis.",
    date: "2024-06-01",
    author: "Boat Bros",
    image: "/photos/DSC09255.webp",
  },
  {
    slug: "what-to-bring-boat-day",
    title: "What to Bring for Your Boat Day",
    excerpt: "A simple checklist so you don't forget the essentials.",
    date: "2024-05-15",
    author: "Boat Bros",
    image: "/photos/DSC00539.webp",
  },
];

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
