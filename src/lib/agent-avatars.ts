/**
 * Agent Avatar Fixture & SVG Profile Generator
 * 
 * Provides deterministic 100 high-fidelity profile avatars for synthetic audience agents.
 * Integrates avatar graphics, skin tones, archetype colors, and profile metadata.
 */

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  company: string;
  avatarUrl: string;
  accentColor: string;
}

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Elena', 'Marcus', 'Sophia', 'David', 'Amara', 'Chen',
  'Maya', 'Liam', 'Sarah', 'Devon', 'Priya', 'Nikolai', 'Aaliyah', 'Lucas',
  'Zoe', 'Tariq', 'Chloe', 'Mateo', 'Aisha', 'Kaito', 'Olivia', 'Ethan',
  'Yuki', 'Gabriel', 'Fatima', 'Hannah', 'Dante', 'Mei', 'Julian', 'Nia'
];

const LAST_NAMES = [
  'Vance', 'Chen', 'Okonjo', 'Kowalski', 'Gupta', 'Silva', 'Lindqvist', 'Nakamura',
  'Patel', 'Dubois', 'Al-Mansoor', 'O\'Connor', 'Zhang', 'Mercer', 'Kim', 'Bhatt',
  'Sorensen', 'Reyes', 'Takahashi', 'Moreau', 'Ibrahim', 'Novak', 'Abebe', 'Rossi'
];

const TITLES = [
  'Staff Engineer', 'Principal Architect', 'VP of Product', 'Growth Lead',
  'Senior DevOps Manager', 'Founder & CEO', 'Security Auditor', 'Tech Lead',
  'Engineering Director', 'Design Systems Lead', 'Data Platform Engineer',
  'Infrastructure Lead', 'Solutions Architect', 'Full Stack Developer'
];

const COMPANIES = [
  'Vercel', 'Stripe', 'Datadog', 'Cloudflare', 'Linear', 'Snowflake',
  'Retool', 'Supabase', 'Figma', 'Postman', 'Sentry', 'Neon', 'Resend'
];

const AVATAR_GRADIENTS = [
  ['#00F0FF', '#0072FF'],
  ['#7000FF', '#FF007A'],
  ['#00FF87', '#60EFFF'],
  ['#FF9900', '#FF0055'],
  ['#3B82F6', '#1E40AF'],
  ['#10B981', '#047857'],
  ['#8B5CF6', '#6D28D9'],
  ['#F59E0B', '#B45309']
];

/**
 * Returns a deterministic full agent profile for an agent ID (0..99 or custom string).
 */
export function getAgentProfile(agentId: string | number): AgentProfile {
  const numId = typeof agentId === 'number' ? agentId : hashString(agentId);
  const idx = Math.abs(numId) % 100;
  
  const firstName = FIRST_NAMES[idx % FIRST_NAMES.length] ?? 'Alex';
  const lastName = LAST_NAMES[(idx * 3) % LAST_NAMES.length] ?? 'Vance';
  const name = `${firstName} ${lastName}`;
  const role = TITLES[(idx * 7) % TITLES.length] ?? 'Senior Architect';
  const company = COMPANIES[(idx * 5) % COMPANIES.length] ?? 'Vercel';
  
  const pair = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length] ?? ['#00F0FF', '#0072FF'];
  const c1 = pair[0] ?? '#00F0FF';
  const c2 = pair[1] ?? '#0072FF';
  
  const svg = createSvgAvatar(name, c1, c2, idx);
  const avatarUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  
  return {
    id: typeof agentId === 'string' ? agentId : `agent-${agentId}`,
    name,
    role,
    company,
    avatarUrl,
    accentColor: c1
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSvgAvatar(name: string, c1: string, c2: string, seed: number): string {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2);
    
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="g_${seed}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="100%" stop-color="${c2}" />
      </linearGradient>
      <filter id="f_${seed}" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <rect width="100" height="100" rx="28" fill="url(#g_${seed})" />
    <circle cx="50" cy="38" r="18" fill="rgba(255,255,255,0.22)" />
    <path d="M22 82 C22 62, 36 54, 50 54 C64 54, 78 62, 78 82 Z" fill="rgba(255,255,255,0.25)" />
    <text x="50" y="58" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-weight="700" font-size="28" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central" letter-spacing="1">${initials}</text>
  </svg>`;
}
