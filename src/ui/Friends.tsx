/* Friends: the people he links to, in a header menu (HeaderMenu.tsx).
 *
 * In the header it is the word and a stack of small faces, one per friend, overlapping as on a
 * group chat. On a phone the header has no room for another word, so only the faces show.
 *
 * The faces are grey until pointed at. The page has no colour anywhere else, and a row of
 * colour photographs would be the loudest thing on it. */

import { FRIENDS } from "./friendList";
import { HeaderMenu } from "./HeaderMenu";

/** Faces in the header before the stack says "+n". */
const FACES = 3;

export function Friends() {
  const more = FRIENDS.length - FACES;
  return (
    <HeaderMenu
      title="Friends"
      count
      button={
        <>
          <span className="friends-word">Friends</span>
          <span className="friends-faces" aria-hidden="true">
            {FRIENDS.slice(0, FACES).map((f) => (
              <img className="friends-face" src={f.avatar} alt="" key={f.href} width={22} height={22} />
            ))}
            {more > 0 && <span className="friends-more">+{more}</span>}
          </span>
        </>
      }
      rows={FRIENDS.map((f) => ({
        href: f.href,
        face: <img className="menu-face" src={f.avatar} alt="" width={40} height={40} />,
        name: f.name,
        line: f.bio,
        dest: new URL(f.href).host.replace(/^www\./, ""),
      }))}
    />
  );
}
