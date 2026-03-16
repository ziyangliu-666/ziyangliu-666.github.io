import type { Metadata } from "next";
import { getAllPosts } from "@/lib/mdx";
import { PostCard } from "@/components/blog/post-card";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Writing on systems engineering, virtualization, debugging, and AI tooling.",
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-12">
        <p className="font-mono text-xs text-jade tracking-widest uppercase mb-4">
          writing
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink mb-3">
          Blog
        </h1>
        <p className="text-ink-muted text-sm max-w-md">
          Notes on systems work, debugging, and the engineering behind building
          reliable infrastructure and AI tooling.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-ink-muted text-sm">No posts yet.</p>
      ) : (
        <div>
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
