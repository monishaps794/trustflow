export default function Topbar({ title, subtitle }) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="topbar-tag">
        <span className="dot" />
        System Online
      </div>
    </header>
  );
}
