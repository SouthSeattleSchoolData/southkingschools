// One place that defines every measure the site shows: its label, unit and how to read it.
// `get` pulls the raw value (number, suppressed string, or null) from a school or district record.

export const METRICS = {
  enrollment: { label: 'Enrollment', short: 'Students', unit: '', get: (s) => s.enrollment },
  pct_low_income: { label: 'Low-income', short: 'Low-inc %', unit: '%', get: (s) => s.pct_low_income },
  pct_english_learners: { label: 'English learners', unit: '%', get: (s) => s.pct_english_learners },
  pct_disability: { label: 'Students with disabilities', unit: '%', get: (s) => s.pct_disability },
  pct_highly_capable: { label: 'Highly capable', unit: '%', get: (s) => s.pct_highly_capable },
  pct_homeless: { label: 'Experiencing homelessness', unit: '%', get: (s) => s.pct_homeless },
  students_per_teacher: { label: 'Students per teacher', unit: '', get: (s) => s.students_per_teacher },

  ela_proficient: { label: 'Reading proficiency', short: 'Reading %', unit: '%', better: 'high', get: (s) => s.ela_proficient },
  math_proficient: { label: 'Math proficiency', short: 'Math %', unit: '%', better: 'high', get: (s) => s.math_proficient },
  science_proficient: { label: 'Science proficiency', short: 'Science %', unit: '%', better: 'high', get: (s) => s.science_proficient },
  ela_proficient_low_income: { label: 'Reading, low-income students', unit: '%', better: 'high', get: (s) => s.ela_proficient_low_income },
  math_proficient_low_income: { label: 'Math, low-income students', unit: '%', better: 'high', get: (s) => s.math_proficient_low_income },
  growth_ela: { label: 'Reading growth (50 = typical)', short: 'Growth rdg', unit: '', better: 'high', get: (s) => s.growth_ela },
  growth_math: { label: 'Math growth (50 = typical)', unit: '', better: 'high', get: (s) => s.growth_math },
  regular_attendance: { label: 'Regular attendance', short: 'Attend. %', unit: '%', better: 'high', get: (s) => s.regular_attendance },
  grad_rate_4yr: { label: '4-year graduation', short: 'Grad %', unit: '%', better: 'high', get: (s) => s.grad_rate_4yr },
  ninth_grade_on_track: { label: '9th graders on track', unit: '%', better: 'high', get: (s) => s.ninth_grade_on_track },
  dual_credit: { label: 'Earned dual credit', unit: '%', better: 'high', get: (s) => s.dual_credit },

  discipline_all: { label: 'Suspended or expelled', short: 'Suspend. %', unit: '%', better: 'low', get: (s) => s.discipline?.all },
  discipline_disability: { label: 'Students with disabilities suspended', short: 'Disab. susp. %', unit: '%', better: 'low', get: (s) => s.discipline?.disability },
  discipline_black: { label: 'Black students suspended', unit: '%', better: 'low', get: (s) => s.discipline?.black },
  discipline_hispanic: { label: 'Hispanic students suspended', unit: '%', better: 'low', get: (s) => s.discipline?.hispanic },
  discipline_white: { label: 'White students suspended', unit: '%', better: 'low', get: (s) => s.discipline?.white },
  discipline_asian: { label: 'Asian students suspended', unit: '%', better: 'low', get: (s) => s.discipline?.asian },
  discipline_low_income: { label: 'Low-income students suspended', unit: '%', better: 'low', get: (s) => s.discipline?.low_income },

  teachers_new_pct: { label: 'Teachers in their first 5 years', short: 'New teachers %', unit: '%', get: (s) => s.teachers_new_pct },
  per_pupil_spending: { label: 'Spending per student', short: 'Spending', unit: '$', get: (s) => s.per_pupil_spending },
  students_per_counselor: { label: 'Students per counselor', short: 'Per counselor', unit: '', better: 'low', get: (s) => perStaff(s, 'counselors') },
  students_per_psychologist: { label: 'Students per psychologist', unit: '', better: 'low', get: (s) => perStaff(s, 'psychologists') },
  math_change: { label: 'Math change since 2018-19', short: 'Math vs 2019', unit: ' pts', better: 'high', get: (s) => trendChange(s, 'math') },
  ela_change: { label: 'Reading change since 2018-19', short: 'Reading vs 2019', unit: ' pts', better: 'high', get: (s) => trendChange(s, 'ela') },
};

/** Students per full-time staff member (federal CRDC staffing, current enrollment). Null when none on staff. */
export function perStaff(s, role) {
  const fte = s.crdc?.staff?.[role];
  if (fte == null || !s.enrollment) return null;
  if (fte === 0) return 'none';
  return Math.round(s.enrollment / fte);
}

/** Points gained or lost between the first and last trend year (exact values only). */
export function trendChange(s, key) {
  const t = s.trend?.[key];
  if (!t) return null;
  const first = t[0];
  const last = t[t.length - 1];
  return typeof first === 'number' && typeof last === 'number' ? Math.round((last - first) * 10) / 10 : null;
}

/** Professional association staffing recommendations, used for context on profiles. */
export const STAFF_GUIDES = {
  counselors: { per: 250, by: 'American School Counselor Association' },
  psychologists: { per: 500, by: 'National Association of School Psychologists' },
  social_workers: { per: 250, by: 'School Social Work Association of America' },
};

/** Federal Civil Rights Data Collection counts (latest collection, CRDC_YEAR). */
export const INCIDENTS = [
  ['firearm_possession', 'Firearm or explosive possession', 'Firearm poss.'],
  ['attacks_with_weapon', 'Attacks with a weapon', 'Weapon attacks'],
  ['threats', 'Threats of physical attack', 'Threats'],
  ['attacks', 'Physical attacks or fights', 'Attacks/fights'],
  ['robbery', 'Robberies', 'Robbery'],
  ['sexual_assault', 'Rape or sexual assault', 'Sexual assault'],
  ['harassment_allegations', 'Harassment or bullying allegations', 'Bullying'],
  ['arrests', 'Students arrested', 'Arrests'],
  ['police_referrals', 'Students referred to police', 'Police ref.'],
];

/** Restraint and seclusion instances (CRDC_YEAR). */
export const RESTRAINT = [
  ['restraint_physical', 'Physical restraint'],
  ['restraint_mechanical', 'Mechanical restraint'],
  ['seclusion', 'Seclusion'],
];

/** What the harassment and bullying allegations were based on. */
export const BULLYING_BASES = [
  ['race', 'race, color or national origin'],
  ['sex', 'sex'],
  ['disability', 'disability'],
  ['orientation', 'sexual orientation'],
  ['religion', 'religion'],
];

/** Support staff counted in the CRDC, full-time equivalents. */
export const STAFF_ROLES = [
  ['counselors', 'Counselors'],
  ['psychologists', 'Psychologists'],
  ['social_workers', 'Social workers'],
  ['nurses', 'Nurses'],
  ['security', 'Security guards'],
  ['police', 'Police officers'],
];

export const CRDC_YEAR = '2023-24';
export const CRDC_PREV_YEAR = '2021-22';
export const incident = (school, key) => school.crdc?.[key] ?? null;
/** The same count from the previous federal collection, for showing change. */
export const incidentPrev = (school, key) => school.crdc_prev?.[key] ?? null;

/** Student groups shown in discipline breakdowns. */
export const DISCIPLINE_GROUPS = [
  ['disability', 'Students with disabilities'],
  ['black', 'Black students'],
  ['hispanic', 'Hispanic students'],
  ['low_income', 'Low-income students'],
  ['white', 'White students'],
  ['asian', 'Asian students'],
];

/** Race/ethnicity shares used in the "Who attends" bar. */
export const DEMOGRAPHICS = [
  ['pct_asian', 'Asian'],
  ['pct_black', 'Black'],
  ['pct_hispanic', 'Hispanic'],
  ['pct_white', 'White'],
  ['pct_two_or_more', 'Two or more'],
  ['pct_pacific_islander', 'Pacific Islander'],
];
