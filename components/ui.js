import Link from 'next/link';

export function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Button({ href, children, variant = 'gold', arrow = true, ...rest }) {
  const cls = `btn btn-${variant}`;
  const inner = (
    <>
      {children}
      {arrow && <Arrow />}
    </>
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button className={cls} {...rest}>{inner}</button>;
}

export function PageBanner({ title, image, position }) {
  return (
    <div className="banner" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,.66), rgba(0,0,0,.66)), url(${image})`, ...(position ? { backgroundPosition: position } : {}) }}>
      <h1>{title}</h1>
    </div>
  );
}

export function Page({ title, image, position, children }) {
  return (
    <div className="page">
      <PageBanner title={title} image={image} position={position} />
      {children}
    </div>
  );
}

export function CommitteeTile({ committee, line }) {
  const style = { backgroundImage: `linear-gradient(rgba(0,0,0,.6), rgba(0,0,0,.6)), url(${committee.image})` };
  const inner = (
    <>
      <img src="/images/crest.png" alt="" className="tile-crest" />
      <div>
        <h3>{committee.name}</h3>
        {line && <p>{line}</p>}
        <p className="tile-cta">View committee →</p>
      </div>
    </>
  );
  return (
    <Link className="tile tile-link" href={`/committees/${committee.slug}`} style={style}>
      {inner}
    </Link>
  );
}
