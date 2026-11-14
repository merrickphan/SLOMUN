import Intro from '@/components/Intro';
import { Button, CommitteeTile } from '@/components/ui';
import { committees } from '@/lib/site';

export default function Home() {
  return (
    <>
      <Intro />
      <section className="hero">
        <div className="hero-content">
          <p className="hero-eyebrow roll" style={{ '--d': '0s' }}>The Second Session</p>
          <h1 className="hero-title roll" style={{ '--d': '.08s' }}>San Luis Obispo Model United Nations</h1>
          <p className="hero-meta roll" style={{ '--d': '.5s' }}>April 3, 2027</p>
          <div className="roll" style={{ '--d': '.6s' }}>
            <Button href="/register" variant="white" arrow={false}>Register Here</Button>
          </div>
          <p className="hero-tagline roll" style={{ '--d': '.7s' }}>
            The second session of San Luis Obispo Model United Nations will be held at San Luis Obispo High School.
          </p>
        </div>
      </section>

      <section className="section" id="letter">
        <h2 className="display">Hello Esteemed Delegates and Advisors,</h2>
        <p className="serif">
          It is our honor to welcome you to the second session of San Luis Obispo Model United Nations, hosted at San
          Luis Obispo High School. This session features four committees: the Social, Humanitarian &amp; Cultural
          Committee on Modern Slavery and Human Trafficking, and three crisis committees on CRISPR &amp; Genetic
          Engineering Ethics, Early WWII (Europe), and a Modern AGI Emergency Summit.
        </p>
        <div className="letter">
          <div className="letter-text">
            <p className="serif muted">
              [Secretary-General’s welcome message. Introduce yourself, share what delegates can expect at SLOMUN, and
              invite advisors to reach out with questions.]
            </p>
            <p className="serif">Sincerely,</p>
            <p className="signature">[Name]</p>
            <p className="small muted">Secretary-General, SLOMUN II</p>
          </div>
          <div className="portrait">
            <div className="portrait-accent" />
            <div className="photo-placeholder">Secretary-General photo</div>
          </div>
        </div>
      </section>

      <section className="section section-yellow" id="secretariat">
        <div className="secretariat">
          <div className="photo-placeholder secretariat-photo">Secretariat photo</div>
          <div className="secretariat-card">
            <h2 className="display">Meet the Secretariat</h2>
            <p>Get to know the students organizing the second session of SLOMUN.</p>
            <Button href="/about" arrow={false}>Learn More</Button>
          </div>
        </div>
      </section>

      <section className="section center">
        <h2 className="display">Committees</h2>
        <div className="tiles tiles-4">
          {committees.map((c) => (
            <CommitteeTile
              key={c.name}
              committee={c}
              line={c.topic ? `${c.type} · ${c.topic}` : `${c.type} Committee`}
            />
          ))}
        </div>
        <Button href="/committees" variant="light">View Committee List</Button>
      </section>

      <section className="section section-gray center">
        <h2 className="display">Registration</h2>
        <p className="lead">Registration details for the second session will be posted soon.</p>
        <Button href="/register">Register</Button>
      </section>
    </>
  );
}
