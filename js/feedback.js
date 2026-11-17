// "Report a mistake" links. By default they open a prefilled GitHub issue; set
// feedback.form_url in content/meta.json to send people to a form that needs no account.

import { store } from './data.js';

const REPO = 'SouthSeattleSchoolData/southkingschools';

export function reportUrl(school) {
  const f = store.meta.feedback || {};
  const what = school ? `${school.name} (${school.code})` : 'the site';
  if (f.form_url) return f.form_url;
  if (f.email) return `mailto:${f.email}?subject=${encodeURIComponent(`Correction: ${what}`)}`;
  const body = `Page: ${location.href}\n\nWhat looks wrong:\n\nWhere the correct information comes from (link if you have one):\n`;
  return `https://github.com/${f.github_repo || REPO}/issues/new?title=${encodeURIComponent(`Correction: ${what}`)}&body=${encodeURIComponent(body)}`;
}
