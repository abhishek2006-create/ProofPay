/** SVG paths sit behind the cards, so each pulse travels from port to port. */
export default function GraphConnections() {
  return (
    <>
      <svg
        className="graph-connections graph-links-wide"
        viewBox="0 0 1000 300"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {['M125 150 H375', 'M375 150 H625', 'M625 150 H875'].map((d, i) => (
          <g key={d} className={i === 1 ? 'connection-warning' : ''}>
            <path className="connection-track" d={d} />
            <path className="connection-pulse" d={d} style={{ animationDelay: `${i * 0.7}s` }} />
          </g>
        ))}
      </svg>
      <svg
        className="graph-connections graph-links-compact"
        viewBox="0 0 1000 300"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {['M250 75 H750', 'M750 75 V150 H250 V225', 'M250 225 H750'].map((d, i) => (
          <g key={d} className={i === 1 ? 'connection-warning' : ''}>
            <path className="connection-track" d={d} />
            <path className="connection-pulse" d={d} style={{ animationDelay: `${i * 0.7}s` }} />
          </g>
        ))}
      </svg>
    </>
  );
}
