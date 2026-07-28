/**
 * Seamless infinite marquee. A single flex track holds the item set twice and
 * slides -50%, so the wrap-around is invisible. Pauses on hover; frozen by the
 * reduced-motion CSS rule.
 */
export default function Marquee({ items }: { items: { label: string; star?: boolean }[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="marquee" role="presentation">
      <div className="track">
        {doubled.map((it, i) => (
          <span
            className={`item${it.star ? " star" : ""}`}
            key={i}
            aria-hidden={i >= items.length}
          >
            {it.label}
          </span>
        ))}
      </div>
    </div>
  );
}
