// "Report a mistake" links. By default they open a prefilled GitHub issue; set
// feedback.form_url in content/meta.json to send people to a Google Form that needs no account.

import { store } from './data.js';

const REPO = 'SouthSeattleSchoolData/southkingschools';

export function reportUrl(school) {
  const f = store.meta.feedback || {};
  const what = school ? `${school.name} (${school.code})` : 'the site';
  if (f.form_url) {
    // With form_page_field (a Google Forms prefill key like "entry.123456789"), the form opens with
    // the school and page already filled in.
    if (!f.form_page_field || !/^entry\.\d+$/.test(f.form_page_field)) return f.form_url;
    const url = new URL(f.form_url);
    url.searchParams.set('usp', 'pp_url');
    url.searchParams.set(f.form_page_field, `${what} — ${location.href}`);
    return url.toString();
  }
  if (f.email) return `mailto:${f.email}?subject=${encodeURIComponent(`Correction: ${what}`)}`;
  const body = `Page: ${location.href}\n\nWhat looks wrong:\n\nWhere the correct information comes from (link if you have one):\n`;
  return `https://github.com/${f.github_repo || REPO}/issues/new?title=${encodeURIComponent(`Correction: ${what}`)}&body=${encodeURIComponent(body)}`;
}
