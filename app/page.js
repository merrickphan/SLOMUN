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
        <h2 className="display">Dear Delegates and Faculty Advisors,</h2>
        <div className="letter">
          <div className="letter-text">
            <p className="serif">
              It is our great pleasure to invite you to the Second Session of San Luis Obispo Model United Nations! We are
              Merrick Han and Diya Menon, sophomores at San Luis Obispo High School, and we are honored to serve as your
              Co-Secretary Generals. Together with our secretariat, we have spent months preparing a conference that will
              challenge, inspire, and help you explore complex topics.
            </p>
            <p className="serif">
              At San Luis Obispo High School, SLOMUN exists to make Model United Nations accessible and enjoyable to all
              students on the Central Coast. We believe the skills delegates build in committee matter far beyond just Model
              UN. This two day session is open to delegates of every experience level, whether you are attending your very
              first conference or have been debating for years.
            </p>
            <p className="serif">
              This session features four committees that span the past, present, and future. Delegates in <b>SOCHUM</b> will
              take on questions of human rights, while our <b>CRISPR</b> committee will confront the ethics of genetic
              engineering. In our <b>Early WWII</b> crisis committee, delegates will step into the roles of real commanders in
              1939, where every decision plays out live on an interactive map. At the <b>AGI Summit</b>, delegates will race
              to set guardrails on artificial intelligence before it outpaces the world&rsquo;s ability to govern it. Across
              all four scopes, we hope that delegates will leave with a broader view of the world, and the confidence to lead!
            </p>
            <p className="serif">
              Above all, we are committed to creating an environment where every delegate feels respected and encouraged to
              share their ideas. Should you have any questions or concerns before the conference, please do not hesitate to
              reach out to us!
            </p>
            <p className="serif">We look forward to welcoming you to San Luis Obispo MUN II on April 3, 2027!</p>
            <p className="serif">Sincerely,</p>
            <p className="signature">Merrick Han and Diya Menon</p>
            <p className="small muted">
              Co-Secretary Generals
              <br />
              San Luis Obispo Model United Nations, Session II
              <br />
              <a href="mailto:merrickphan2011@gmail.com">merrickphan2011@gmail.com</a>
              <br />
              <a href="mailto:diyavinilm@gmail.com">diyavinilm@gmail.com</a>
            </p>
          </div>
          <div className="portrait">
            <div className="portrait-accent" />
            {/* The two portraits fade into each other; with reduced motion they sit side by side. */}
            <div className="sg-photos">
              <figure className="sg-photo">
                <img src="/images/sg-merrick-han.jpg" alt="Merrick Han, Co-Secretary General" />
                <figcaption>Merrick Han<span>Co-Secretary General</span></figcaption>
              </figure>
              <figure className="sg-photo">
                <img src="/images/sg-diya-menon.jpg" alt="Diya Menon, Co-Secretary General" />
                <figcaption>Diya Menon<span>Co-Secretary General</span></figcaption>
              </figure>
            </div>
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
        <p className="lead">Registration for the second session is open. Fill out the delegate registration form to sign up.</p>
        <Button href="/register">Register</Button>
      </section>
    </>
  );
}
