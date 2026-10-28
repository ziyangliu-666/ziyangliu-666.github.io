/* The people in the Friends panel of the header (Friends.tsx).
 *
 * To add a friend: put a square avatar in public/friends/ (128 px WebP is plenty), and add a
 * line here. The bio is one sentence in English, from the friend's own site, in the third
 * person. The avatar is a copy in this repository, not a link to the friend's site, so a
 * change on their side never leaves a broken image here. */

export interface Friend {
  name: string;
  href: string;
  /** One sentence, from their own site. */
  bio: string;
  /** Under /friends/. */
  avatar: string;
}

export const FRIENDS: Friend[] = [
  {
    name: "Yiyang Suen",
    href: "https://suenyiyang.com/",
    bio: "A frontend engineer in China, now building agents. He writes about agent harnesses, the web and travel.",
    avatar: "/friends/suenyiyang.webp",
  },
];
