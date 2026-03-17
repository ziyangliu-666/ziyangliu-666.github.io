import Link from "next/link";
import { getAllPosts, formatDate } from "@/lib/mdx";

export function WritingPreview() {
  const posts = getAllPosts().slice(0, 3);

  return (
    <section className="border-t border-line bg-surface">
      <div className="mx-auto max-w-5xl px-6 lg:px-10 py-16">
        <div className="flex items-center justify-between mb-6">
          <p className="font-mono text-xs text-jade tracking-widest uppercase">
            writing
          </p>
          <Link
            href="/blog"
            className="font-mono text-xs text-ink-muted hover:text-jade transition-colors"
            aria-label="View all blog posts"
          >
            all posts →
          </Link>
        </div>

        {posts.length === 0 ? (
          <p className="text-ink-muted text-sm">No posts yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {posts.map((post) => (
              <article key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-x-8 gap-y-2 py-6"
                >
                  <div>
                    <h3 className="font-medium text-ink group-hover:text-jade transition-colors mb-1.5">
                      {post.title}
                    </h3>
                    <p className="text-sm text-ink-muted leading-relaxed">
                      {post.summary}
                    </p>
                    {post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-3 mt-2">
                        {post.tags.map((tag) => (
                          <span key={tag} className="font-mono text-xs text-ink-dim">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <time
                    dateTime={post.date}
                    className="font-mono text-xs text-ink-dim self-start lg:text-right whitespace-nowrap"
                  >
                    {formatDate(post.date)}
                  </time>
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
