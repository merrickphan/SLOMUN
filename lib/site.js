// Committee details shown on each committee's page. Leave a field undefined
// to show "To be announced"; `guide` turns on the Topic Briefing button.
export const committees = [
  {
    slug: 'sochum',
    name: 'Social, Humanitarian & Cultural Committee',
    type: 'General Assembly',
    topic: 'Modern Slavery and Human Trafficking',
    procedure: 'General Assembly',
    image: '/images/committee-sochum.png',
  },
  {
    slug: 'crispr-genetic-engineering-ethics',
    name: 'CRISPR & Genetic Engineering Ethics',
    type: 'Crisis',
    procedure: 'Crisis',
    image: '/images/committee-crispr.png',
  },
  {
    slug: 'early-wwii-europe',
    name: 'Early WWII (Europe)',
    type: 'Crisis',
    procedure: 'Crisis',
    image: '/images/committee-wwii.png',
  },
  {
    slug: 'modern-agi-emergency-summit',
    name: 'Modern AGI Emergency Summit',
    type: 'Crisis',
    topic: 'The Nova 10.1 Crisis: Governing Artificial General Intelligence',
    procedure: 'Crisis',
    technology: 'Allowed',
    image: '/images/committee-agi.png',
    banner: '/images/committee-agi-banner.png',
    bannerPosition: 'center 12%',
    guide: '/guides/modern-agi-emergency-summit.pdf',
  },
];

export const aboutLinks = [
  { label: 'What is SLOMUN?', href: '/about' },
  { label: 'Letter from the Secretary-General', href: '/#letter' },
  { label: 'Secretariat', href: '/#secretariat' },
];

export const slomunLinks = [
  { label: 'Committees', href: '/committees' },
  { label: 'Register', href: '/register' },
  { label: 'Logistics', href: '/logistics' },
  { label: 'Position Paper', href: '/position-paper' },
  { label: 'Delegate Resources', href: '/resources' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact Us', href: '/contact' },
];
