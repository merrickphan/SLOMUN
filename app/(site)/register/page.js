import { Page } from '@/components/ui';

export const metadata = { title: 'Register | SLOMUN' };

// Delegate registration runs on Google Forms; responses go straight to the form's owner.
const FORM = 'https://docs.google.com/forms/d/1VGidEJs3Z0M3SArkq6Rnh8Cen8mx0AGdoZ5csB1fefU/viewform';

export default function Register() {
  return (
    <Page title="Register" image="/images/register-banner.png">
      <div className="prose">
        <p>Register for the second session of SLOMUN by filling out the delegate registration form below. Fees and deadlines will be posted on this page.</p>
      </div>
      <hr />
      <div className="formhead">
        <h2 className="heading">Delegate Registration Form</h2>
        <a className="btn btn-light" href={FORM} target="_blank" rel="noopener noreferrer">Open the form in a new tab</a>
      </div>
      <div className="formembed">
        <iframe src={`${FORM}?embedded=true`} title="SLOMUN delegate registration form" loading="lazy">Loading the registration form…</iframe>
      </div>
      <p className="formnote-site">Trouble with the form? <a href={FORM} target="_blank" rel="noopener noreferrer">Open it directly on Google Forms</a>.</p>
    </Page>
  );
}
