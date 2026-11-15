import { Page } from '@/components/ui';

export const metadata = { title: 'Logistics | SLOMUN' };

export default function Logistics() {
  return (
    <Page title="Logistics" image="/images/hero-slohs.png">
      <div className="prose">
        <h2 className="heading">Venue</h2>
        <p>San Luis Obispo High School, San Luis Obispo, CA</p>
        <h2 className="heading">Schedule</h2>
        <p>SLOMUN will be held on April 3, 2027. The full conference schedule will be posted soon.</p>
        <h2 className="heading">More Information</h2>
        <p>Parking, food, and other details will be posted closer to the conference.</p>
      </div>
      <hr />
    </Page>
  );
}
