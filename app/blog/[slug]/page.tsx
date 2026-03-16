import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllPosts, getPost, formatDate } from "@/lib/mdx";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      {/* Back */}
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted hover:text-jade transition-colors mb-12"
      >
        ← all posts
      </Link>

      {/* Header */}
      <header className="mb-12">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <time
            dateTime={post.date}
            className="font-mono text-xs text-ink-dim"
          >
            {formatDate(post.date)}
          </time>
          {post.tags.map((tag) => (
            <span key={tag} className="font-mono text-xs text-jade">
              #{tag}
            </span>
          ))}
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink mb-4 leading-tight">
          {post.title}
        </h1>
        <p className="text-ink-muted leading-relaxed">{post.summary}</p>
      </header>

      <hr className="border-line mb-12" />

      {/* Body */}
      <div className="prose">
        <MDXRemote source={post.content} />
      </div>

      {/* Footer */}
      <div className="mt-16 pt-8 border-t border-line flex items-center justify-between gap-4">
        <Link
          href="/blog"
          className="font-mono text-xs text-ink-muted hover:text-jade transition-colors"
        >
          ← back to writing
        </Link>
        <a
          href="mailto:ziyang.liu.r@outlook.com"
          className="font-mono text-xs text-ink-muted hover:text-jade transition-colors"
        >
          reply by email
        </a>
      </div>
    </div>
  );
}
