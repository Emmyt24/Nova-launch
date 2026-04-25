/**
 * Shown when a critical integration dependency is missing at boot time.
 * Replaces the full app so users see a clear message instead of a blank screen.
 */
interface Props {
  errors: string[];
}

export function IntegrationBootError({ errors }: Props) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        background: '#0f0f0f',
        color: '#f5f5f5',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
        ⚠️ Configuration Error
      </h1>
      <p style={{ color: '#aaa', marginBottom: '1.5rem', textAlign: 'center' }}>
        Nova Launch could not start because required configuration is missing.
      </p>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          width: '100%',
          maxWidth: '480px',
        }}
      >
        {errors.map((err, i) => (
          <li
            key={i}
            style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '6px',
              padding: '0.75rem 1rem',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              color: '#f87171',
              fontFamily: 'monospace',
            }}
          >
            {err}
          </li>
        ))}
      </ul>
      <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#666' }}>
        Set the missing variables in your <code>.env</code> file and reload.
      </p>
    </div>
  );
}
