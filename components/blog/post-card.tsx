import Link from "next/link";
import { PostMeta, formatDate } from "@/lib/mdx";

interface PostCardProps {
  post: PostMeta;
}

export function PostCard({ post }: PostCardProps) {
  return (
    <article>
      <Link
        href={`/blog/${post.slug}`}
        className="group block py-7 border-b border-line hover:bg-surface/50 -mx-6 px-6 transition-colors"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
          <h2 className="font-semibold text-ink group-hover:text-jade transition-colors leading-snug">
            {post.title}
          </h2>
          <time
            dateTime={post.date}
            className="font-mono text-xs text-ink-dim flex-shrink-0 sm:mt-1"
          >
            {formatDate(post.date)}
          </time>
        </div>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          {post.summary}
        </p>
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="font-mono text-xs text-ink-dim">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </Link>
    </article>
  );
}
