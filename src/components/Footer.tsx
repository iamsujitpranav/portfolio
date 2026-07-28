const STACK = [
  "Next.js",
  "three.js / R3F",
  "Framer Motion",
  "Lenis",
  "cmdk",
  "FastAPI",
  "Claude",
];

export default function Footer() {
  return (
    <footer>
      <div className="wrap frow">
        <span>© {new Date().getFullYear()} Sujit Pranav Reddy</span>
        <div className="stackline">
          {STACK.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <a href="#top" data-cursor>↑ back to top</a>
      </div>
    </footer>
  );
}
