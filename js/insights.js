// "Reading this school": plain-language interpretations generated from fixed rules.
// Each rule returns at most one note, tagged 'pos' (encouraging), 'neg' (worth asking about) or 'neu'.
// Thresholds are named so they're easy to review and adjust.

import { num, exact } from './util.js';
import { perStaff, trendChange } from './metrics.js';
import { volatility, SMALL } from './trends.js';

const T = {
  residHigh: 8, // points above the income trend
  residLow: -8,
  growthHigh: 56, // median growth percentile
  growthLow: 44,
  lowIncomeGapWide: 22, // reading points between low-income students and the school
  lowIncomeGapNarrow: 6,
  disabilityRatioHigh: 2.5, // × the school's suspension rate
  blackRatioHigh: 2,
  attendanceLow: 65,
  attendanceHigh: 88,
  englishLearnersHigh: 35,
  highlyCapableHigh: 25,
  smallSchool: SMALL.enrollment,
  counselorLoad: 400, // students per counselor that's well past the 250 guideline
  restraintPer100: 5, // restraint + seclusion uses per 100 students
  newTeachersHigh: 35, // % of teachers in their first five years
  recoveredBy: 2, // points above 2018-19 that count as recovered
  fellBy: -12, // points below 2018-19 that count as a large drop
};

export function interpretSchool(s, state) {
  const notes = [];
  const add = (tone, html) => notes.push({ tone, html });

  if (s.isProgram) {
    add('neu', `This is a ${s.tags.join(', ').toLowerCase() || 'special'} program, so it serves students with different needs than a neighborhood school. Comparing its scores with regular schools isn't fair to it.`);
  }

  // Results relative to the income trend
  if (s.resid != null) {
    const r = s.resid;
    if (r >= T.residHigh) {
      add('pos', `Reading and math results are <b>${r.toFixed(0)} points higher</b> than schools with a similar share of low-income students. That gap usually reflects teaching and school culture, not just who enrolls.`);
    } else if (r <= T.residLow) {
      add('neg', `Reading and math results are <b>${Math.abs(r).toFixed(0)} points lower</b> than schools with a similar share of low-income students. Ask what the school is changing and how it measures progress during the year.`);
    } else {
      add('neu', `Reading and math results are about what you'd expect for a school with ${num(s.pct_low_income)}% low-income students (within ${Math.abs(r).toFixed(0)} points of the trend).`);
    }
  }

  // Growth
  const ge = num(s.growth_ela);
  const gm = num(s.growth_math);
  if (ge != null && gm != null) {
    const g = (ge + gm) / 2;
    if (g >= T.growthHigh) add('pos', `Students are improving faster than similar students statewide (median growth ${g.toFixed(0)}; 50 is typical). Strong growth means students are learning here, wherever they started.`);
    else if (g <= T.growthLow) add('neg', `Students are improving more slowly than similar students statewide (median growth ${g.toFixed(0)}; 50 is typical). Slow growth is more telling than a low score, because it tracks this school's own effect.`);
  }

  // Gap between low-income students and the school
  const ela = exact(s.ela_proficient);
  const elaLI = exact(s.ela_proficient_low_income);
  if (ela != null && elaLI != null) {
    if (ela - elaLI >= T.lowIncomeGapWide) {
      add('neg', `Low-income students trail the school overall by ${(ela - elaLI).toFixed(0)} points in reading (${elaLI}% vs ${ela}%). A wide internal gap means the school serves some students much better than others.`);
    } else if (ela - elaLI <= T.lowIncomeGapNarrow && num(s.pct_low_income) >= 20) {
      add('pos', `Low-income students read at nearly the same level as the school overall (${elaLI}% vs ${ela}%). That's uncommon, and a good sign the school serves all its students.`);
    }
  }

  // Discipline disparities
  if (s.disabilityRatio != null && s.disabilityRatio >= T.disabilityRatioHigh) {
    add('neg', `Students with disabilities are suspended or expelled at <b>${s.disabilityRatio.toFixed(1)}×</b> the school's overall rate. In psychological terms, repeated removal usually means a behavior plan isn't working, and it compounds learning loss and disengagement.`);
  }
  const black = exact(s.discipline?.black);
  const all = exact(s.discipline?.all);
  if (black != null && all && black / all >= T.blackRatioHigh) {
    add('neg', `Black students are suspended at ${(black / all).toFixed(1)}× the school's overall rate. Ask how the school reviews discipline decisions for bias and what it uses instead of removal.`);
  }

  // Overall exclusion
  const disc = num(s.discipline?.all);
  if (disc != null && all != null && disc >= state.discipline_all * 2) {
    add('neg', `${disc}% of students were suspended or expelled at least once last year, about ${(disc / state.discipline_all).toFixed(1)}× the state rate. High exclusion is linked to lower attendance and a weaker sense of belonging for everyone, not just the students removed.`);
  } else if (disc != null && disc < 1 && !s.isProgram && s.district !== 'Bellevue School District') {
    add('pos', 'Fewer than 1% of students were suspended or expelled. Pair that with attendance and the school\'s reputation: low exclusion is good when it comes from prevention, not from under-reporting.');
  }

  // Attendance
  const att = num(s.regular_attendance);
  if (att != null) {
    if (att < T.attendanceLow) add('neg', `Only ${att}% of students attend regularly, so roughly ${Math.round(100 - att)}% miss 10% or more of school days. Chronic absence is one of the earliest signals of disengagement, anxiety, unstable housing or a climate where students don't feel they belong.`);
    else if (att >= T.attendanceHigh) add('pos', `${att}% of students attend regularly, well above the state's ${state.regular_attendance}%. Steady attendance tracks closely with students feeling safe and connected.`);
  }

  // Context that changes how to read the scores
  if (num(s.pct_english_learners) >= T.englishLearnersHigh) add('neu', `${num(s.pct_english_learners)}% of students are learning English. Proficiency tests are in English, so growth scores are a fairer measure here than proficiency.`);
  if (num(s.pct_highly_capable) >= T.highlyCapableHigh) add('neu', `${num(s.pct_highly_capable)}% of students are in the highly capable program. Scores partly reflect that selection, so look at growth and the low-income students' results to judge the teaching.`);

  // Recovery since the pandemic
  const mathChange = trendChange(s, 'math');
  const elaChange = trendChange(s, 'ela');
  if (!s.isProgram && mathChange != null && elaChange != null && (volatility(s) ?? 0) < SMALL.jump) {
    if (mathChange >= T.recoveredBy && elaChange >= T.recoveredBy) add('pos', `Reading and math are both above their 2018-19 levels (${elaChange > 0 ? '+' : ''}${elaChange} and ${mathChange > 0 ? '+' : ''}${mathChange} points), which most schools here haven't managed since the pandemic.`);
    else if (Math.min(mathChange, elaChange) <= T.fellBy) add('neg', `${mathChange <= elaChange ? 'Math' : 'Reading'} is ${Math.abs(Math.min(mathChange, elaChange))} points below its 2018-19 level, a bigger drop than most schools here. Ask what the school is doing to catch students up.`);
  }

  // Serious incidents and how the school responds to distress (2021-22 federal data)
  const c = s.crdc;
  if (c && (num(c.firearm_possession) || num(c.attacks_with_weapon))) {
    const parts = [
      c.firearm_possession ? `${c.firearm_possession} firearm possession incident${c.firearm_possession > 1 ? 's' : ''}` : '',
      c.attacks_with_weapon ? `${c.attacks_with_weapon} attack${c.attacks_with_weapon > 1 ? 's' : ''} with a weapon` : '',
    ].filter(Boolean);
    add('neg', `In 2021-22 the school reported ${parts.join(' and ')} to the federal government. Ask for the current weapons and threat-assessment counts.`);
  }
  if (c) {
    const uses = (c.restraint_physical || 0) + (c.restraint_mechanical || 0) + (c.seclusion || 0);
    const per100 = s.enrollment ? (100 * uses) / s.enrollment : 0;
    if (uses >= 10 && per100 >= T.restraintPer100) add('neg', `Staff reported ${uses} uses of restraint or seclusion in 2021-22, about ${Math.round(per100)} per 100 students. Being held or isolated is frightening for children and rarely teaches calmer behavior; ask how often it happens now and what the school does instead.`);
    const perCounselor = perStaff(s, 'counselors');
    if (perCounselor === 'none' && s.enrollment >= 200 && !s.isProgram) add('neg', `The school reported no counselor in 2021-22. Ask who students talk to when they're struggling, and how quickly they can be seen.`);
    else if (typeof perCounselor === 'number' && perCounselor >= T.counselorLoad && !s.isProgram) add('neg', `One counselor per ${perCounselor} students, well past the recommended 250. Heavy caseloads leave little time for prevention, so problems tend to surface as discipline instead.`);
  }
  if (num(s.teachers_new_pct) >= T.newTeachersHigh && (s.teachers_total || 0) >= 10) add('neu', `${num(s.teachers_new_pct)}% of teachers are in their first five years. Ask how many teachers left last year and how new teachers are mentored; steady relationships with adults matter a lot to students.`);

  // Known data quirks
  if (s.code === '3385') add('neu', 'The 10.7% science result is likely a test-participation issue (many students not tested), not achievement. The school\'s reading and math scores are high.');
  // (Small-school cautions appear as a banner at the top of the profile.)

  return notes;
}

/** Up to six tour questions, chosen from what the numbers flag. */
export function tourQuestions(s) {
  const q = [];
  if (s.disabilityRatio != null && s.disabilityRatio >= 2) q.push('How do you support students with IEPs or 504 plans before suspension becomes an option?');
  if (num(s.regular_attendance) != null && num(s.regular_attendance) < 75) q.push('What do you do when a student starts missing school? Who calls home, and when?');
  if (s.resid != null && s.resid <= T.residLow) q.push('What changed in instruction this year, and how do you measure progress before the state test?');
  const ela = exact(s.ela_proficient);
  const elaLI = exact(s.ela_proficient_low_income);
  if (ela != null && elaLI != null && ela - elaLI >= 20) q.push('What extra support do low-income students get in reading and math?');
  if (s.level === 'High' || s.level === 'Middle') q.push('How many threat assessments were opened last year, and how are families told about threats?');
  q.push('How many bullying (HIB) complaints were filed last year, and how many were substantiated?');
  q.push('How many counselors, psychologists or social workers are on site, and how many students does each serve?');
  if (s.lead?.over5 && !(s.lead.retests && !s.lead.retests_over5)) q.unshift('Which drinking-water outlets tested above 5 ppb for lead, and have they been fixed and retested?');
  if (s.level === 'Elementary') q.push('How do teachers handle conflict and big emotions in class without sending kids out?');
  return q.slice(0, 6);
}
