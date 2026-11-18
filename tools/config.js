// Settings for the data updater (tools/update-data.html).
// Edit this file to change which schools are included or to fix a school's location.

/** Districts included, with the short code the site uses and the area they belong to. */
export const DISTRICTS = [
  { name: 'Renton School District', code: 'R', area: 'Renton', leaid: '5307230' },
  { name: 'Kent School District', code: 'K', area: 'Kent', leaid: '5303960' },
  { name: 'Issaquah School District', code: 'I', area: 'Issaquah', leaid: '5303750' },
  { name: 'Bellevue School District', code: 'B', area: 'Bellevue', leaid: '5300390' },
  // Tahoma serves Maple Valley plus parts of Covington, Black Diamond, Ravensdale and Hobart.
  { name: 'Tahoma School District', code: 'T', area: 'Maple Valley', leaid: '5308760' },
  // Seattle schools are split into West/South Seattle by ZIP code (see SEATTLE_AREAS); others are dropped.
  { name: 'Seattle School District No. 1', code: 'S', area: null, leaid: '5307710' },
];

/** Seattle ZIP codes that count as each area. */
export const SEATTLE_AREAS = {
  'West Seattle': ['98106', '98116', '98126', '98136', '98146'],
  'South Seattle': ['98108', '98118', '98144', '98178'],
};

/** Charter schools to include (each is its own "district" in OSPI data) and their area. */
export const CHARTERS = {
  'Rainier Valley Leadership Academy': 'South Seattle',
  'Summit Public School: Atlas': 'West Seattle',
  'Impact | Salish Sea Elementary': 'South Seattle',
  'Impact | Black River Elementary': 'Renton',
};

/**
 * Locations for schools the King County layer doesn't match (new schools, charters).
 * Key = OSPI school code.
 */
export const MANUAL_LOCATIONS = {
  5469: { lat: 47.5165, lon: -122.377, address: '9601 35th Ave SW', zip: '98126' }, // Summit Atlas
  5468: { lat: 47.5503, lon: -122.2766, address: '6020 Rainier Ave S', zip: '98118' }, // Rainier Valley Leadership Academy
  5608: { lat: 47.54, lon: -122.2817, address: '3900 Holly Park Dr S', zip: '98118' }, // Impact Salish Sea
  5736: { lat: 47.4528, lon: -122.1866, address: '16950 116th Ave SE', zip: '98058' }, // Impact Black River
  3434: { lat: 47.4655, lon: -122.2206, address: '2403 Jones Ave S', zip: '98055' }, // Nelsen Middle
};

/**
 * Schools whose King County point is out of date (the county layer still has the building they
 * left); these take their location from the NCES directory instead. Key = OSPI school code.
 */
export const USE_NCES_LOCATION = [
  '3937', // Maple View Middle: county point is the Sweeney Rd building (now Cedar River Elementary)
  '3341', // Summit Trail Middle: county point is the SE 216th St building (now Tahoma Elementary)
];

/** King County school sites (ArcGIS feature layer). */
/** Cleaner display names, keyed by OSPI school code (OSPI's own names stay in the raw files). */
export const DISPLAY_NAMES = {
  '3630': "Hazen High",
  '3741': "Lindbergh High",
  '3962': "Liberty High",
  '3282': "Sammamish High",
  '3486': "Newport High",
  '3588': "Interlake High",
  '2475': "Renton High",
  '2849': "Tahoma High",
  '2392': "Cleveland STEM High",
  '5469': "Summit Atlas",
  '5608': "Impact Salish Sea Elementary",
  '5736': "Impact Black River Elementary",
  '4356': "Neely-O'Brien Elementary",
  '3522': "International School",
  '1648': "Out-of-District Facility",
};

export const SCHOOL_SITES_URL = 'https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services/SCHSITE_POINT_107/FeatureServer/0/query';
export const SCHOOL_SITE_DISTRICTS = ['RENTON', 'KENT', 'ISSAQUAH', 'BELLEVUE', 'SEATTLE', 'TUKWILA', 'HIGHLINE', 'TAHOMA'];

/**
 * data.wa.gov dataset IDs by school year. For a new year, the updater looks them up by name;
 * if that fails, add the IDs here (find them by searching data.wa.gov for "Report Card ... 2025-26").
 */
export const DATASETS = {
  '2024-25': {
    enrollment: '2rwv-gs2e',
    assessment: 'h5d9-vgwi',
    discipline: 'c9tq-ntbq',
    graduation: 'isxb-523t',
    sqss: 'f7j6-nk2h',
    growth: 'hv7j-ib7g',
    wakids: '35cj-2iym',
  },
};

/** Dataset names on data.wa.gov, used to find a new year's IDs. {year} is replaced. */
export const DATASET_NAMES = {
  enrollment: 'Report Card Enrollment {year} School Year',
  assessment: 'Report Card Assessment Data {year} School Year',
  discipline: 'Report Card Discipline for {year}',
  graduation: 'Report Card Graduation {year}',
  sqss: 'Report Card SQSS for {year}',
  growth: 'Report Card Growth for {year}',
  wakids: 'Report Card WaKids {year} School Year',
};

/** Multi-year student–teacher ratio file (filtered by year). */
export const RATIO_DATASET = 'gks4-v7ka';

/**
 * Public address of the site, used for search-engine pages, the sitemap and share previews.
 * If you move to a custom domain, change this and run the updater (or the GitHub Action).
 */
export const SITE_URL = 'https://southseattleschooldata.github.io/southkingschools/';
