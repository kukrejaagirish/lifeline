'use strict';

/* ================= utilities ================= */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const timeStr = d => { const x = new Date(d); return pad(x.getHours()) + ':' + pad(x.getMinutes()) + ':' + pad(x.getSeconds()); };
const minsAgo = d => Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));

const PRIO = {
  critical: { label: 'Critical', dot: icon('dot', 'ic ic-sm ic-critical') },
  urgent: { label: 'Urgent', dot: icon('dot', 'ic ic-sm ic-urgent') },
  priority: { label: 'Priority', dot: icon('dot', 'ic ic-sm ic-priority') },
};
const STATUS = ['REGISTERED', 'IN TRANSIT', 'ARRIVING', 'ARRIVED', 'CANCELLED'];
const PORD = { critical: 0, urgent: 1, priority: 2 };
const ROLES = {
  sending: 'Sending Hospital', dest: 'Destination Hospital',
  attendant: 'Patient Attendant', responder: 'Responder',
  police: 'Police', traffic: 'Traffic Control',
  command: 'Command Center', admin: 'Admin',
};
const PERMS = {
  create: ['sending', 'responder', 'command'],
  advance: ['responder', 'command'],
  claim: ['responder'],
  flag: ['responder', 'command', 'traffic'],
  assign: ['command'], cancel: ['command'], escalate: ['command'],
};
const canDo = a => !!PERMS[a] && PERMS[a].includes(App.role);

/* ================= v3 constants ================= */
const TAGS = ['Ventilator', 'Isolation', 'Bariatric', 'Incubator',
  'Defibrillator', 'Blood Onboard', 'Spinal Board'];
const CHECKLIST = [
  ['patient_identity', 'Patient identity verified'],
  ['vitals_documented', 'Vitals & notes documented'],
  ['medications_handover', 'Medications handed over'],
  ['belongings_transfer', 'Personal belongings transferred'],
  ['receiving_team_briefed', 'Receiving team briefed'],
];
const BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B+', 'AB+'];
const AREA_COORDS = {
  'Fort': [18.9256, 72.8321], 'Byculla': [18.9784, 72.8340],
  'Nagpada': [18.9719, 72.8277], 'Marine Lines': [18.9446, 72.8232],
  'Charni Road': [18.9398, 72.8246], 'Girgaon': [18.9390, 72.8260],
  'Pedder Road': [18.9330, 72.8110], 'Breach Candy': [18.9221, 72.8110],
  'Tardeo': [18.9330, 72.8210], 'Mumbai Central': [18.9696, 72.8194],
  'Parel': [18.9960, 72.8370], 'Sion': [19.0400, 72.8620],
  'Lower Parel': [18.9970, 72.8280], 'Kurla West': [19.0720, 72.8840],
  'Kurla': [19.0720, 72.8840], 'Vile Parle': [19.0970, 72.8480],
  'Vile Parle West': [19.0990, 72.8420], 'Bandra West': [19.0600, 72.8310],
  'Mahim': [19.0390, 72.8410], 'Andheri West': [19.1197, 72.8460],
  'Andheri East': [19.1130, 72.8690], 'Andheri East / Marol': [19.1090, 72.8710],
  'Mira Road': [19.2820, 72.8560], 'Ghatkopar East': [19.0860, 72.9080],
  'Ghatkopar': [19.0860, 72.9080], 'Vikhroli West': [19.1080, 72.9080],
  'Chembur': [19.0520, 72.9000], 'Mulund West': [19.1720, 72.9530],
  'Vashi': [19.0770, 72.9980], 'Belapur': [19.0140, 73.0330],
  'Nerul': [19.0360, 73.0200], 'Thane': [19.2180, 72.9780],
  'Kalyan': [19.2400, 73.1300], 'Dombivli': [19.2180, 73.0870],
  'Panvel': [18.9900, 73.1170], 'Vashi / Kamothe': [19.0060, 73.1170],
};
const CITY_CENTER = [19.0760, 72.8777];
const SPECIALTY_KEYWORDS = {
  cardiac: ['bombay hospital', 'jaslok', 'lilavati', 'hinduja', 'kokilaben',
    'fortis', 'global hospital', 'breach candy', 'wockhardt'],
  neuro: ['kem', 'sion', 'j.j.', 'kokilaben', 'nanavati', 'seven hills',
    'jupiter', 'lilavati'],
  trauma: ['sion', 'rajawadi', 'trauma care', 'seven hills', 'jupiter',
    'st. george', 'lokmanya'],
  obstetric: ['cama', 'wadia', 'sion', 'j.j.', 'mgm', 'holy family',
    'holy spirit'],
  nephrology: ['kem', 'fortis', 'zen', 'terna', 'mgm', 'jaslok', 'lilavati'],
  oncology: ['tata memorial'],
  pediatric: ['wadia', 'bhabha', 'children'],
  burns: ['masina', 'j.j.', 'kasturba'],
};

function areaCoords(name) {
  const q = (name || '').trim().toLowerCase();
  if (!q) return CITY_CENTER;
  for (const [area, c] of Object.entries(AREA_COORDS)) {
    if (q === area.toLowerCase() || q.includes(area.toLowerCase())) return c;
  }
  return CITY_CENTER;
}
function hospitalCoords(h) {
  const c = areaCoords(h.area);
  return c === CITY_CENTER ? c : c;
}
function haversine(a, b) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(b[0] - a[0]), dLon = toR(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) *
    Math.cos(toR(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ================= i18n (EN / HI / MR) ================= */
const LANGS = {
  en: {
    tagline: 'Every minute matters. Every life counts.',
    new_transfer: '+ New Transfer',
    active_total: 'Active total',
    critical: 'Critical', urgent: 'Urgent', priority: 'Priority',
    min_eta: 'min ETA',
    my_runs: 'My runs', unassigned_queue: 'Unassigned queue',
    claim_run: 'Claim run', advance_status: 'Advance status',
    mark_arrived: 'Mark arrived', flag_traffic: 'Flag heavy traffic',
    open_details: 'Open details', escalate_priority: 'Escalate priority',
    cancel_case: 'Cancel case', send: 'Send',
    analytics: 'Transfer Analytics', activity_log: 'Recent Activity Log',
    notifications: 'Notifications Log', blood_bank: 'Blood Bank Board (Live)',
    mci_title: 'Mass Casualty Incident (MCI)',
    declare_mci: 'Declare Incident', close_incident: 'Close',
    incident_name: 'Incident name', location_ph: 'Location (e.g. Bandra)',
    handover_pod: 'Handover Checklist (POD)', print_sheet: 'Print handover sheet',
    csv_report: 'CSV Report', map_title: 'Live Operations Map',
    legend_beds: 'Beds available', legend_low: 'Low beds', legend_full: 'Full',
    legend_units: 'Units in transit', delayed: 'DELAYED',
    form_equipment: 'Equipment / capability requirements',
    form_link_incident: 'Link to mass-casualty incident',
    form_hint: 'On submission the destination hospital, police and traffic control are notified (demo: simulated SMS/WhatsApp). If the destination is in the directory, a bed is reserved automatically.',
    none_open: 'No open incidents',
  },
  hi: {
    tagline: 'हर मिनट मायने रखता है। हर जान कीमती है।',
    new_transfer: '+ नया ट्रांसफर',
    active_total: 'सक्रिय कुल',
    critical: 'क्रांटिकल', urgent: 'अत्यावश्यक', priority: 'प्राथमिकता',
    min_eta: 'मिनट ETA',
    my_runs: 'मेरे रन', unassigned_queue: 'असाइन नहीं किया गया कतार',
    claim_run: 'रन लें', advance_status: 'स्थिति आगे बढ़ें',
    mark_arrived: 'पहुँच गए', flag_traffic: 'भारी ट्रैफ़िक फ़्लैग करें',
    open_details: 'विवरण खोलें', escalate_priority: 'प्राथमिकता बढ़ाएँ',
    cancel_case: 'केस रद्द करें', send: 'भेजें',
    analytics: 'ट्रांसफर विश्लेषण', activity_log: 'हाल की गतिविधि',
    notifications: 'अधिसूचना लॉग', blood_bank: 'रक्त बैंक बोर्ड (लाइव)',
    mci_title: 'सामूहिक-हादसा घटनाएँ (MCI)',
    declare_mci: 'घटना घोषित करें', close_incident: 'बंद करें',
    incident_name: 'घटना का नाम', location_ph: 'स्थान (जैसे Bandra)',
    handover_pod: 'हैंडओवर चेकलिस्ट (POD)', print_sheet: 'हैंडओवर शीट प्रिंट करें',
    csv_report: 'CSV रिपोर्ट', map_title: 'लाइव ऑपरेशन मैप',
    legend_beds: 'बेड उपलब्ध', legend_low: 'कम बेड', legend_full: 'भरा हुआ',
    legend_units: 'यात्रा पर यूनिट', delayed: 'विलंबित',
    form_equipment: 'उपकरण / क्षमता आवश्यकताएँ',
    form_link_incident: 'सामूहिक-हादसा घटना से जोड़ें',
    form_hint: 'जमा करने पर गंतव्य अस्पताल, पुलिस और यातायात को सूचित किया जाता है (डेमो: सिम्युलेटेड SMS/WhatsApp)। गंतव्य निर्देशिका में होने पर बेड स्वतः आरक्षित हो जाता है।',
    none_open: 'कोई खुली घटना नहीं',
  },
  mr: {
    tagline: 'प्रत्येक मिनट महत्त्वाचा. प्रत्येक जीव मौल्यवान.',
    new_transfer: '+ नवीन ट्रान्सफर',
    active_total: 'सक्रिय एकूण',
    critical: 'गंभीर', urgent: 'तातडीचे', priority: 'प्राधान्य',
    min_eta: 'मिनिटे ETA',
    my_runs: 'माझे रन', unassigned_queue: 'नियुक्त नसलेली रांग',
    claim_run: 'रन घ्या', advance_status: 'स्थिती पुढे न्या',
    mark_arrived: 'पोहोचलो', flag_traffic: 'मोठा ट्रॅफिक फ्लॅग करा',
    open_details: 'तपशील उघडा', escalate_priority: 'प्राधान्य वाढवा',
    cancel_case: 'केस रद्द करा', send: 'पाठवा',
    analytics: 'ट्रान्सफर विश्लेषण', activity_log: 'अलीकडील क्रियाकलाप',
    notifications: 'सूचना नोंद', blood_bank: 'रक्तपेढी बोर्ड (थेट)',
    mci_title: 'मोठ्या अपघात घटना (MCI)',
    declare_mci: 'घटना घोषित करा', close_incident: 'बंद करा',
    incident_name: 'घटनेचे नाव', location_ph: 'ठिकाण (उदा. Bandra)',
    handover_pod: 'हस्तांतरण चेकलिस्ट (POD)', print_sheet: 'हस्तांतरण पत्रक प्रिंट करा',
    csv_report: 'CSV अहवाल', map_title: 'थेट ऑपरेशन नकाशा',
    legend_beds: 'बेड उपलब्ध', legend_low: 'कमी बेड', legend_full: 'भरलेले',
    legend_units: 'प्रवासावर असलेल्या युनिट', delayed: 'उशीर',
    form_equipment: 'उपकरण / क्षमता आवश्यकता',
    form_link_incident: 'मोठ्या अपघात घटनेशी जोडा',
    form_hint: 'सबमिट केल्यावर गंतव्य रुग्णालय, पोलिसे आणि वाहतूक नियंत्रणाला कळवण्यात येते (डेमो: सिम्युलेटेड SMS/WhatsApp). गंतव्य निर्देशिकेत असल्यास बेड आपोआप राखीव होते.',
    none_open: 'कोणतीही खुली घटना नाही',
  },
};
function t(key) {
  const lang = App.lang || 'en';
  return (LANGS[lang] && LANGS[lang][key]) || key.replace(/_/g, ' ');
}
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.documentElement.lang = App.lang || 'en';
}

/* ================= seed data (offline mode) ================= */
function seedRand(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff; return Math.abs(h); }

const HOSPITAL_SEED = [
  ['St. George Hospital', 'Fort', 'South', 'Govt'], ['G.T. Hospital', 'Fort', 'South', 'Govt'],
  ['Cama & Albless Hospital', 'Fort', 'South', 'Govt'], ['J.J. Hospital', 'Byculla', 'South', 'Govt'],
  ["St. Elizabeth's Hospital", 'Nagpada', 'South', 'Private'], ['Masina Hospital', 'Byculla', 'South', 'Private'],
  ['Bombay Hospital', 'Marine Lines', 'South', 'Private'], ['Saifee Hospital', 'Charni Road', 'South', 'Private'],
  ['Sir H.N. Reliance Foundation Hospital', 'Girgaon', 'South', 'Private'], ['Jaslok Hospital', 'Pedder Road', 'South', 'Private'],
  ['Breach Candy Hospital', 'Breach Candy', 'South', 'Private'], ['Bhatia Hospital', 'Tardeo', 'South', 'Private'],
  ['Wockhardt Hospital, Mumbai Central', 'Mumbai Central', 'South', 'Private'],
  ['KEM Hospital', 'Parel', 'Central', 'Govt'], ['Lokmanya Tilak Municipal Hospital (Sion Hospital)', 'Sion', 'Central', 'Govt'],
  ['Tata Memorial Hospital', 'Parel', 'Central', 'Govt'], ['Wadia Hospital (Cama & Nowrosjee)', 'Parel', 'Central', 'Private'],
  ['Global Hospital', 'Lower Parel', 'Central', 'Private'], ['Bhabha Hospital', 'Kurla West', 'Central', 'Govt'],
  ['Kohinoor Hospital', 'Kurla', 'Central', 'Private'], ['Cooper Hospital', 'Vile Parle', 'Western', 'Govt'],
  ['Lilavati Hospital', 'Bandra West', 'Western', 'Private'], ['Holy Family Hospital', 'Bandra West', 'Western', 'Private'],
  ['P.D. Hinduja Hospital', 'Mahim', 'Western', 'Private'], ['Nanavati Super Speciality Hospital', 'Vile Parle West', 'Western', 'Private'],
  ['Kokilaben Dhirubhai Ambani Hospital', 'Andheri West', 'Western', 'Private'], ['Seven Hills Hospital', 'Andheri East / Marol', 'Western', 'Private'],
  ['Apollo Spectra Hospital', 'Andheri West', 'Western', 'Private'], ['Criticare Hospital', 'Andheri West', 'Western', 'Private'],
  ['Holy Spirit Hospital', 'Andheri East', 'Western', 'Private'], ['Bhaktivedanta Hospital', 'Mira Road', 'Thane', 'Private'],
  ['Rajawadi Hospital', 'Ghatkopar East', 'Eastern', 'Govt'], ['Godrej Memorial Hospital', 'Vikhroli West', 'Eastern', 'Private'],
  ['Sushrusha Hospital', 'Chembur', 'Eastern', 'Private'], ['Zen Hospital', 'Chembur', 'Eastern', 'Private'],
  ['Fortis Hospital, Mulund', 'Mulund West', 'Eastern', 'Private'], ['Trauma Care Multispeciality Hospital', 'Andheri East', 'Eastern', 'Private'],
  ['Fortis Hiranandani Hospital', 'Vashi, Navi Mumbai', 'Navi Mumbai', 'Private'], ['Apollo Hospital', 'Belapur, Navi Mumbai', 'Navi Mumbai', 'Private'],
  ['MGM Hospital', 'Vashi / Kamothe, Navi Mumbai', 'Navi Mumbai', 'Private'], ['Terna Speciality Hospital', 'Nerul, Navi Mumbai', 'Navi Mumbai', 'Private'],
  ['Jupiter Hospital', 'Thane', 'Thane', 'Private'], ['Currae Hospital', 'Mira Road', 'Thane', 'Private'],
  ['Kalyan Hospital', 'Kalyan', 'Thane', 'Private'], ['Thane Civil Hospital', 'Thane', 'Thane', 'Govt'],
  ['Dombivli Nursing Home', 'Dombivli', 'Thane', 'Private'], ['Navi Mumbai Municipal Hospital', 'Vashi', 'Navi Mumbai', 'Govt'],
  ['Vashi General Hospital', 'Vashi', 'Navi Mumbai', 'Govt'], ['Panvel Sub-District Hospital', 'Panvel', 'Navi Mumbai', 'Govt'],
  ['Mira Road Trauma Unit', 'Mira Road', 'Thane', 'Private'], ['Ghatkopar Municipal Hospital', 'Ghatkopar', 'Eastern', 'Govt'],
  ['Andheri Nursing Home', 'Andheri East', 'Western', 'Private'], ['Chembur Nursing Home', 'Chembur', 'Eastern', 'Private'],
].map(([name, area, region, type]) => ({
  name, area, region, type,
  icuBeds: seedRand(name) % 9, genBeds: (seedRand(name) % 23) + 3,
}));

const CONTACTS_SEED = [
  { cat: 'All-in-one Emergency', items: [{ n: 'National Emergency Number', v: '112' }] },
  { cat: 'Police', items: [
    { n: 'Police Helpline', v: '100 / 112' }, { n: 'Mumbai Police Control Room', v: '022-2262-1855' },
    { n: 'Traffic WhatsApp Helpline', v: '8454999999' }, { n: 'Cyber Crime Helpline', v: '1930' }] },
  { cat: 'Fire', items: [
    { n: 'Fire Brigade', v: '101 / 112' }, { n: 'Fire Brigade Control Room', v: '022-2308-5991/92/93/94' }] },
  { cat: 'Ambulance', items: [
    { n: 'Ambulance (Govt.)', v: '102 / 108' }, { n: 'Ambulance (Private network)', v: '1298' }] },
  { cat: 'Disaster Management', items: [
    { n: 'Maharashtra Disaster Mgmt Control Room', v: '022-2202-7990' }, { n: 'National Disaster Mgmt Authority', v: '011-2670-1700 / 1078' }] },
  { cat: 'Other Essential Helplines', items: [
    { n: 'Women Helpline', v: '1091 / 022-2263-3333' }, { n: 'Child Helpline', v: '1098' },
    { n: 'Blood Bank Helpline', v: '104 / 1910' }, { n: 'Railway Accident / GRP', v: '9833331111' },
    { n: 'Gas Leakage (LPG)', v: '1906' }] },
];

const COMPLETED_SEED = [
  ['LL-2026-000981', 'Kalyan Hospital', 'Bombay Hospital', 'critical', 52, 'Kalyan → Thane → EEH → Mumbai', 26],
  ['LL-2026-000982', 'Thane Civil Hospital', 'KEM Hospital', 'urgent', 61, 'Thane → EEH → Sion → Parel', 22],
  ['LL-2026-000983', 'Dombivli Nursing Home', 'Fortis Hospital, Mulund', 'priority', 34, 'Dombivli → LBS Marg → Mulund', 20],
  ['LL-2026-000984', 'Navi Mumbai Municipal Hospital', 'Bombay Hospital', 'urgent', 71, 'Vashi → Sion Panvel Hwy → EEH', 18],
  ['LL-2026-000985', 'Vashi General Hospital', 'Fortis Hiranandani Hospital', 'priority', 22, 'Vashi → Palm Beach Rd', 16],
  ['LL-2026-000986', 'Panvel Sub-District Hospital', 'MGM Hospital', 'critical', 39, 'Panvel → Sion Panvel Hwy', 14],
  ['LL-2026-000987', 'Mira Road Trauma Unit', 'Bhaktivedanta Hospital', 'urgent', 18, 'Mira Road → Western Express Hwy', 12],
  ['LL-2026-000988', 'Ghatkopar Municipal Hospital', 'Rajawadi Hospital', 'priority', 14, 'Ghatkopar local roads', 10],
  ['LL-2026-000989', 'Andheri Nursing Home', 'Kokilaben Dhirubhai Ambani Hospital', 'critical', 26, 'Andheri West local roads', 8],
  ['LL-2026-000990', 'Kalyan Hospital', 'Bombay Hospital', 'urgent', 58, 'Kalyan → Thane → EEH → Mumbai', 6],
  ['LL-2026-000991', 'Thane Civil Hospital', 'Fortis Hospital, Mulund', 'priority', 29, 'Thane → EEH → Mulund', 4],
  ['LL-2026-000992', 'Chembur Nursing Home', 'Zen Hospital', 'urgent', 16, 'Chembur local roads', 2],
];

const UNIT_SEED = ['AMB-1024', 'AMB-1025', 'AMB-1026', 'AMB-8871', 'AMB-5510', 'AMB-2290'];

const SEED_CASES = [
  { priority: 'critical', origin: 'Kalyan Hospital', dest: 'Bombay Hospital', dept: 'Cardiac ICU', amb: 'AMB-1024', eta: 28, age: 61, reason: 'STEMI — requires cath lab', status: 1, minutes_ago: 12 },
  { priority: 'urgent', origin: 'Thane Civil Hospital', dest: 'KEM Hospital', dept: 'Neurosurgery', amb: 'AMB-8871', eta: 46, age: 34, reason: 'Head trauma, RTA', status: 0, minutes_ago: 25 },
  { priority: 'priority', origin: 'Dombivli Nursing Home', dest: 'Fortis Hospital, Mulund', dept: 'Nephrology', amb: 'AMB-5510', eta: 19, age: 72, reason: 'Dialysis unavailable on-site', status: 2, minutes_ago: 40 },
  { priority: 'urgent', origin: 'Navi Mumbai Municipal Hospital', dest: 'Bombay Hospital', dept: 'Obstetric ICU', amb: 'AMB-2290', eta: 35, age: 29, reason: 'High-risk delivery complication', status: 1, minutes_ago: 8 },
];

/* ================= app state ================= */
const LS_KEY = 'lifeline_offline_state_v2';
const App = {
  mode: 'boot', token: null, role: null, unit: '', authRequired: true,
  state: null, receivedAt: 0,
  es: null, esUp: false, esFails: 0,
  seenCritical: new Set(), seenDelayed: new Set(), firstSnap: true,
  soundOn: localStorage.getItem('lifeline_sound') !== 'off',
  voiceOn: localStorage.getItem('lifeline_voice') === 'on',
  lang: localStorage.getItem('lifeline_lang') || 'en',
  filters: { q: '', prio: 'all', sort: 'priority' },
  attCaseId: null, openCaseId: null, bc: null,
  map: null, mapLayers: null, mapOpen: false,
  selectedTags: new Set(),
};

/* ================= audio ================= */
let actx = null;
document.addEventListener('pointerdown', () => {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
}, { once: true });

function beep(kind) {
  if (!App.soundOn || !actx) return;
  const t0 = actx.currentTime;
  const seq = kind === 'critical' ? [[880, 0], [660, 0.18], [520, 0.36]] : [[720, 0]];
  seq.forEach(([f, dt]) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + dt);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.22);
    o.connect(g); g.connect(actx.destination);
    o.start(t0 + dt); o.stop(t0 + dt + 0.25);
  });
}

/* ================= toast ================= */
function toast(title, msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind === 'info' ? ' t-info' : kind === 'ok' ? ' t-ok' : '');
  t.innerHTML = `<strong>${esc(title)}</strong>${esc(msg)}`;
  $('toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 350); }, 6000);
}

/* ================= voice announcements ================= */
function speak(text) {
  if (!App.voiceOn || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = App.lang === 'hi' ? 'hi-IN' : App.lang === 'mr' ? 'mr-IN' : 'en-IN';
    u.rate = 1.02; u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch (e) { }
}

/* ================= API ================= */
async function api(path, opts, retry) {
  opts = opts || {}; retry = retry !== false;
  const headers = Object.assign(
    { 'Content-Type': 'application/json' },
    App.token ? { Authorization: 'Bearer ' + App.token } : {},
    opts.headers || {});
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  let data = {};
  try { data = await res.json(); } catch (e) { }
  if (res.status === 401 && retry && App.mode === 'live') {
    App.token = null;
    sessionStorage.removeItem('ll_token');
    sessionStorage.removeItem('ll_role');
    sessionStorage.removeItem('ll_unit');
    if ($('loginScreen')) $('loginScreen').classList.remove('hide');
  }
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

/* ================= boot ================= */
async function boot() {
  bindUI();
  if (App.lang !== 'en') applyLang();
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === '127.0.0.1' ||
       location.hostname === 'localhost')) {
    try { navigator.serviceWorker.register('sw.js'); } catch (e) { }
  }
  let live = false;
  try {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch('/api/health', { signal: ctl.signal });
    clearTimeout(tm);
    if (r.ok) {
      const health = await r.json();
      App.authRequired = health.auth_required !== false;
    }
    live = r.ok;
  } catch (e) { live = false; }
  App.mode = live ? 'live' : 'offline';
  $('loginFootnote').innerHTML = live
    ? `${icon('wifi','ic ic-sm ic-ok')} Connected to Life-Line server · real-time sync across devices &amp; tabs`
    : `${icon('wifiOff','ic ic-sm ic-urgent')} Offline demo mode · mock data · syncs across tabs of this browser only`;

  const sr = sessionStorage.getItem('ll_role');
  const su = sessionStorage.getItem('ll_unit') || '';
  const st = sessionStorage.getItem('ll_token') || '';
  const hashParts = (location.hash || '').replace('#', '').split('/');
  const hashRole = hashParts[0] || '';
  const hashUnit = hashParts[1] || '';
  if (sr && ROLES[sr]) { App.token = st || null; enterApp(sr, su); }
  else if (ROLES[hashRole]) { enterApp(hashRole, hashUnit); }
}

/* ================= session ================= */
const UNIT_RE = /^[A-Za-z0-9-]{1,24}$/;

function showLoginError(msg) {
  const el = $('loginError');
  if (el) { el.textContent = msg; el.hidden = false; }
  $('loginFootnote').innerHTML = App.mode === 'live'
    ? `${icon('wifi','ic ic-sm ic-ok')} Connected to Life-Line server · real-time sync across devices &amp; tabs`
    : `${icon('wifiOff','ic ic-sm ic-urgent')} Offline demo mode · mock data · syncs across tabs of this browser only`;
}

async function enterApp(role, unit) {
  const le = $('loginError');
  if (le) le.hidden = true;
  App.role = role; App.unit = (unit || '').trim();
  if (App.unit && !UNIT_RE.test(App.unit)) {
    showLoginError('Unit ID: letters, digits and dashes only (e.g. AMB-1024) — or leave it empty.');
    return;
  }
  sessionStorage.setItem('ll_role', role);
  sessionStorage.setItem('ll_unit', App.unit);

  if (App.mode === 'live') {
    try {
      const res = await api('/api/login', {
        method: 'POST', body: JSON.stringify({ role, unit: App.unit }),
      });
      App.token = res.token;
      sessionStorage.setItem('ll_token', App.token);
      connectSSE();
      await refresh();
    } catch (e) {
      if (e instanceof TypeError) {
        // genuine network failure — health check passed earlier but the
        // server is gone now; fall back to offline demo.
        toast('Server unreachable', 'Switched to offline demo.', 'info');
        App.mode = 'offline';
        initOffline();
      } else {
        // API rejection (validation, auth) — surface it and stay on login.
        App.role = null; App.token = null;
        sessionStorage.removeItem('ll_role');
        sessionStorage.removeItem('ll_token');
        showLoginError(e.message);
        return;
      }
    }
  } else {
    initOffline();
  }

  $('loginScreen').classList.add('hide');
  $('appRoot').style.display = 'block';
  $('siRole').textContent = ROLES[role];
  $('siId').textContent = App.unit ? '· ' + App.unit : '';
  $('sessionInfo').style.display = 'flex';
  renderAll(); updateConn();
}

function doLogout() {
  if (App.es) { App.es.close(); App.es = null; }
  if (App.mode === 'live' && App.token) {
    fetch('/api/logout', {
      method: 'POST', headers: { Authorization: 'Bearer ' + App.token },
    }).catch(() => { });
  }
  sessionStorage.removeItem('ll_role');
  sessionStorage.removeItem('ll_unit');
  sessionStorage.removeItem('ll_token');
  App.token = null; App.role = null; App.esUp = false; App.firstSnap = true;
  $('appRoot').style.display = 'none';
  $('loginScreen').classList.remove('hide');
  $('loginIdInput').value = '';
  $('loginIdInput').focus();
}

/* ================= live mode ================= */
function connectSSE() {
  if (App.es) App.es.close();
  const es = new EventSource('/api/events?token=' + encodeURIComponent(App.token));
  App.es = es; App.esUp = false; App.esFails = 0;
  es.addEventListener('state', e => {
    App.esUp = true; App.esFails = 0;
    applySnapshot(JSON.parse(e.data));
  });
  es.onerror = () => {
    App.esUp = false; updateConn();
    if (es.readyState === EventSource.CLOSED) {
      App.esFails++;
      if (App.esFails > 5) {
        toast('Connection lost', 'Could not reach the Life-Line server.', 'info');
        App.esFails = 0;
        return;
      }
      setTimeout(reconnectSSE, 3000);
    }
  };
}

async function reconnectSSE() {
  if (App.mode !== 'live' || !App.role || !App.token) return;
  connectSSE();
}

async function refresh() {
  const s = await api('/api/state');
  applySnapshot(s);
}

function applySnapshot(s) {
  const crit = new Set();
  const delayed = new Set();
  s.cases.forEach(c => {
    if (c.priority === 'critical' && c.status < 3) crit.add(c.id);
    if (c.delayed && c.status < 3) delayed.add(c.id);
  });
  if (!App.firstSnap) {
    crit.forEach(id => {
      if (!App.seenCritical.has(id)) {
        const c = s.cases.find(x => x.id === id);
        if (c) {
          toast('CRITICAL transfer registered', `${c.id} · ${c.origin} → ${c.dest}`);
          beep('critical');
          speak(`Critical transfer ${c.id} from ${c.origin} to ${c.dest}`);
        }
      }
    });
    delayed.forEach(id => {
      if (!App.seenDelayed.has(id)) {
        const c = s.cases.find(x => x.id === id);
        if (c) {
          toast('Transfer DELAYED', `${c.id} is behind its ETA estimate.`, 'info');
          beep('info');
          speak(`Warning. Transfer ${c.id} is delayed`);
        }
      }
    });
  }
  App.seenCritical = crit; App.seenDelayed = delayed; App.firstSnap = false;
  App.state = s; App.receivedAt = Date.now();
  renderAll(); updateConn();
  if (App.mapOpen) updateMap();
}

function updateConn() {
  const b = $('connBadge'), l = $('connLabel');
  if (App.mode === 'live' && App.esUp) {
    b.className = 'conn-badge live'; l.textContent = 'LIVE · SYNCED';
  } else if (App.mode === 'live') {
    b.className = 'conn-badge offline'; l.textContent = 'RECONNECTING…';
  } else {
    b.className = 'conn-badge offline'; l.textContent = 'OFFLINE DEMO';
  }
}

/* ================= offline engine ================= */
let offlineInited = false;
function initOffline() {
  if (offlineInited) return;
  offlineInited = true;
  if (!loadPersisted()) { seedOfflineState(); persistOffline(); }
  setInterval(offlineTick, 4000);
  if ('BroadcastChannel' in window) {
    App.bc = new BroadcastChannel('lifeline_offline_v2');
    App.bc.onmessage = () => { if (loadPersisted()) { renderAll(); updateConn(); } };
  }
  window.addEventListener('storage', e => {
    if (e.key === LS_KEY && loadPersisted()) { renderAll(); updateConn(); }
  });
}

function seedOfflineState() {
  const nowMs = Date.now();
  const iso = ms => new Date(ms).toISOString();
  App.state = {
    rev: 1, seq: 1027, server_time: iso(nowMs),
    hospitals: JSON.parse(JSON.stringify(HOSPITAL_SEED)),
    units: UNIT_SEED.map(id => ({ id, status: 'available', case: null })),
    completed: COMPLETED_SEED.map(([id, o, d, p, m, rt, h]) => ({
      id, origin: o, dest: d, priority: p, durationMin: m, route: rt, ts: iso(nowMs - h * 3600000),
    })),
    cases: [], audit: [], notifications: [], incidents: [],
    bloodbanks: seedBloodBanks(),
    checklist: CHECKLIST.map(([k, label]) => ({ k, label })),
    tag_options: TAGS,
    sla: { register_min: 10, delay_grace_min: 10 },
    analytics: null, contacts: CONTACTS_SEED,
  };
  SEED_CASES.forEach(sp => {
    App.state.seq++;
    const ts = iso(nowMs - sp.minutes_ago * 60000);
    const oc = areaCoords(sp.origin), dc = areaCoords(sp.dest);
    App.state.cases.push({
      id: `LL-${new Date(ts).getFullYear()}-${String(App.state.seq).padStart(6, '0')}`,
      priority: sp.priority, origin: sp.origin, dest: sp.dest, dept: sp.dept,
      amb: sp.amb, eta: sp.eta, age: sp.age, reason: sp.reason, status: sp.status,
      traffic: pickTraffic(), created_at: ts, updated_at: ts,
      reported_by: 'Sending hospital', assigned_unit: sp.amb, bed_kind: null,
      original_eta: sp.eta, delayed: false, sla_escalated: false,
      incident_id: null, tags: [], handover: {},
      o_lat: oc[0], o_lng: oc[1], d_lat: dc[0], d_lng: dc[1],
      notes: [], history: [{ ts, status: 0 }],
    });
  });
  App.state.cases.forEach(c => {
    offAudit(c.id, `Case registered · ${PRIO[c.priority].label} · ${c.origin} → ${c.dest}`);
    const u = App.state.units.find(x => x.id === c.amb);
    if (u && c.status < 3) { u.status = 'en-route'; u.case = c.id; }
  });
  App.receivedAt = Date.now();
}

function seedBloodBanks() {
  const regions = ['South', 'Central', 'Western', 'Eastern', 'Navi Mumbai', 'Thane'];
  const bb = {};
  regions.forEach(r => {
    bb[r] = {};
    BLOOD_TYPES.forEach(bt => { bb[r][bt] = Math.floor(Math.random() * 9); });
  });
  return bb;
}

function pickTraffic() {
  const r = Math.random();
  return r < 0.5 ? 'Clear' : r < 0.85 ? 'Moderate' : 'Heavy congestion';
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.cases)) return false;
    App.state = d; App.receivedAt = Date.now();
    return true;
  } catch (e) { return false; }
}

function persistOffline() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(App.state)); } catch (e) { }
  if (App.bc) { try { App.bc.postMessage('u'); } catch (e) { } }
}

function offAudit(cid, text) {
  App.state.audit.unshift({ ts: new Date().toISOString(), caseId: cid, text });
  if (App.state.audit.length > 200) App.state.audit.length = 200;
}

function actorLabel() {
  return (ROLES[App.role] || App.role) + (App.unit ? ' ' + App.unit : '');
}

function offAdvance(cid, system) {
  const c = App.state.cases.find(x => x.id === cid);
  if (!c || c.status >= 3) return;
  c.status += 1;
  c.updated_at = new Date().toISOString();
  c.history.push({ ts: c.updated_at, status: c.status });
  if (c.status === 3) {
    c.eta = 0;
    App.state.completed.push({
      id: c.id, origin: c.origin, dest: c.dest, priority: c.priority,
      durationMin: minsAgo(c.created_at), route: `${c.origin} → ${c.dest}`,
      ts: c.updated_at,
    });
    releaseBedOff(c); freeUnitOff(c);
    offAudit(cid, `Patient handover complete${system ? ' (system)' : ' by ' + actorLabel()} · total transfer time ${minsAgo(c.created_at)} min`);
  } else {
    c.eta = Math.floor(Math.random() * 15) + 8;
    offAudit(cid, `Status updated → ${STATUS[c.status]}${system ? ' (system)' : ' by ' + actorLabel()}`);
  }
}

function releaseBedOff(c) {
  const h = findHospitalObj(c.dest);
  if (h && c.bed_kind === 'icu') h.icuBeds++;
  else if (h && c.bed_kind === 'gen') h.genBeds++;
  c.bed_kind = null;
}

function freeUnitOff(c) {
  const u = App.state.units.find(x => x.id === c.assigned_unit);
  if (u && u.case === c.id) { u.status = 'available'; u.case = null; }
  c.assigned_unit = null;
}

function offlineTick() {
  if (!App.state || !App.role) return;
  let changed = false;
  App.state.cases.forEach(c => {
    if (c.status < 3 && c.eta > 0) {
      c.eta -= 1; changed = true;
      if (c.eta <= 0) offAdvance(c.id, true);
    } else if (c.status < 3 && Math.random() < 0.08) {
      const prev = c.traffic;
      c.traffic = pickTraffic();
      if (c.traffic !== prev) { changed = true; offAudit(c.id, `Traffic status → ${c.traffic} (system)`); }
    }
    if (c.status < 3 && !c.delayed) {
      const ageMin = minsAgo(c.created_at);
      if (ageMin > (c.original_eta || c.eta) + 10) {
        c.delayed = true; changed = true;
        offAudit(c.id, `Transfer DELAYED — ${ageMin} min elapsed vs ${c.original_eta} min estimate`);
        offNotify('radio', `${c.id} DELAYED beyond estimate — review route`, c.id);
      }
    }
  });
  if (App.state.bloodbanks) {
    Object.values(App.state.bloodbanks).forEach(ty => {
      Object.keys(ty).forEach(bt => {
        ty[bt] = Math.max(0, Math.min(8, ty[bt] + (Math.random() < 0.25 ?
          (Math.random() < 0.5 ? -1 : 1) : 0)));
      });
    });
    changed = true;
  }
  if (changed) {
    App.state.rev = (App.state.rev || 0) + 1;
    persistOffline();
    if (document.activeElement && document.activeElement.id === 'cmdSearch') renderCmdResults();
    else renderAll();
  }
}

/* ================= unified actions ================= */
function afterMutation() {
  if (App.mode === 'live') refresh().catch(() => { });
  else { persistOffline(); renderAll(); }
}

async function doCreate(payload) {
  if (App.mode === 'live') {
    try {
      await api('/api/cases', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      toast('Case created', 'Command Center notified · destination hospital, police & traffic alerted.', 'ok');
      await refresh();
    } catch (e) { toast('Could not create case', e.message, 'info'); }
  } else {
    offCreate(payload);
    closeModal();
    toast('Case created', 'Offline demo — stored locally.', 'ok');
    afterMutation();
  }
}

function doAdvance(id) {
  if (App.mode === 'live') {
    api(`/api/cases/${id}/status`, { method: 'POST', body: '{}' })
      .then(() => { toast(`${id} updated`, 'Status advanced.', 'ok'); return refresh(); })
      .catch(e => toast('Action failed', e.message, 'info'));
  } else {
    offAdvance(id, false); toast(`${id} updated`, 'Status advanced.', 'ok'); afterMutation();
  }
}

function doClaim(id) {
  if (App.mode === 'live') {
    api(`/api/cases/${id}/claim`, { method: 'POST', body: '{}' })
      .then(() => { toast('Run claimed', `${id} assigned to ${App.unit}.`, 'ok'); return refresh(); })
      .catch(e => toast('Could not claim', e.message, 'info'));
  } else {
    const c = App.state.cases.find(x => x.id === id);
    const u = App.state.units.find(x => x.id === App.unit);
    if (!c || !u) { toast('Could not claim', 'Set a unit ID when signing in.', 'info'); return; }
    if (u.status !== 'available') { toast('Unit busy', `${u.id} is on case ${u.case}.`, 'info'); return; }
    u.status = 'en-route'; u.case = id; c.assigned_unit = u.id;
    if (!c.amb) c.amb = u.id;
    offAudit(id, `Run claimed by ${u.id}`);
    toast('Run claimed', `${id} assigned to ${u.id}.`, 'ok');
    afterMutation();
  }
}

function doAssign(id, unit) {
  if (App.mode === 'live') {
    api(`/api/cases/${id}/assign`, { method: 'POST', body: JSON.stringify({ unit }) })
      .then(() => { toast('Unit assigned', `${unit} → ${id}`, 'ok'); return refresh(); })
      .catch(e => toast('Assignment failed', e.message, 'info'));
  } else {
    const c = App.state.cases.find(x => x.id === id);
    const u = App.state.units.find(x => x.id === unit);
    if (!c || !u) return;
    if (u.case && u.case !== id) { toast('Unit busy', `${u.id} is on case ${u.case}.`, 'info'); return; }
    freeUnitOff(c);
    u.status = 'en-route'; u.case = id; c.assigned_unit = u.id;
    if (!c.amb) c.amb = u.id;
    offAudit(id, `Assigned to ${u.id} by ${actorLabel()}`);
    toast('Unit assigned', `${unit} → ${id}`, 'ok');
    afterMutation();
  }
}

function doDispatch(id, unit) {
  unit = (unit || '').trim();
  if (!unit) {
    toast('Select an ambulance', 'Choose an available unit before dispatching.', 'info');
    return;
  }
  if (App.mode === 'live') {
    api(`/api/cases/${id}/dispatch`, { method: 'POST', body: JSON.stringify({ unit }) })
      .then(() => { toast('Ambulance dispatched', `${unit} → ${id}`, 'ok'); return refresh(); })
      .catch(e => toast('Dispatch failed', e.message, 'info'));
  } else {
    const c = App.state.cases.find(x => x.id === id);
    const u = App.state.units.find(x => x.id === unit);
    if (!c || !u) return;
    if (c.assigned_unit) { toast('Already assigned', `${id} is already assigned to ${c.assigned_unit}.`, 'info'); return; }
    if (u.status !== 'available' || u.case) { toast('Unit unavailable', `${u.id} is not available.`, 'info'); return; }
    u.status = 'en-route'; u.case = id; c.assigned_unit = u.id; c.amb = u.id;
    c.updated_at = new Date().toISOString();
    offAudit(id, `AMBULANCE DISPATCHED: ${u.id} by ${actorLabel()}`);
    App.state.notifications = App.state.notifications || [];
    App.state.notifications.unshift({
      ts: new Date().toISOString(), channel: 'radio', target: 'CMD',
      body: `DISPATCH: ${id} — ${u.id} to ${c.origin} → ${c.dest} (${c.priority.toUpperCase()})`,
      caseId: id, status: 'simulated'
    });
    toast('Ambulance dispatched', `${u.id} → ${id}`, 'ok');
    afterMutation();
  }
}

function doFlag(id) {
  if (App.mode === 'live') {
    api(`/api/cases/${id}/traffic`, { method: 'POST', body: '{}' })
      .then(() => { toast(`${id} traffic flagged`, 'Alternative route requested.', 'info'); return refresh(); })
      .catch(e => toast('Action failed', e.message, 'info'));
  } else {
    const c = App.state.cases.find(x => x.id === id);
    if (c) { c.traffic = 'Heavy congestion'; offAudit(id, 'Heavy congestion flagged on route — alternative route requested'); }
    toast(`${id} traffic flagged`, 'Alternative route requested.', 'info');
    afterMutation();
  }
}

function doNote(id, text) {
  if (!text || !text.trim()) return;
  if (App.mode === 'live') {
    api(`/api/cases/${id}/notes`, { method: 'POST', body: JSON.stringify({ text }) })
      .then(() => refresh())
      .catch(e => toast('Note failed', e.message, 'info'));
  } else {
    const c = App.state.cases.find(x => x.id === id);
    if (c) {
      c.notes.push({ ts: new Date().toISOString(), author: actorLabel(), text: text.trim().slice(0, 500) });
      offAudit(id, `Note added by ${actorLabel()}`);
    }
    afterMutation();
  }
}

function doCancel(id, reason) {
  if (App.mode === 'live') {
    api(`/api/cases/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })
      .then(() => { toast(`${id} cancelled`, 'Bed released · stakeholders notified.', 'info'); return refresh(); })
      .catch(e => toast('Cancel failed', e.message, 'info'));
  } else {
    const c = App.state.cases.find(x => x.id === id);
    if (c && c.status < 3) {
      c.status = 4; c.eta = 0;
      c.history.push({ ts: new Date().toISOString(), status: 4 });
      releaseBedOff(c); freeUnitOff(c);
      offAudit(id, `Case CANCELLED by ${actorLabel()}${reason ? ' — ' + reason : ''}`);
    }
    toast(`${id} cancelled`, 'Bed released · stakeholders notified.', 'info');
    afterMutation();
  }
}

function doEscalate(id) {
  if (App.mode === 'live') {
    api(`/api/cases/${id}/escalate`, { method: 'POST', body: '{}' })
      .then(() => { toast(`${id} escalated`, 'Priority raised.', 'ok'); return refresh(); })
      .catch(e => toast('Escalation failed', e.message, 'info'));
  } else {
    const c = App.state.cases.find(x => x.id === id);
    if (c && c.priority !== 'critical' && c.status < 3) {
      c.priority = PORD[c.priority] === 2 ? 'urgent' : 'critical';
      offAudit(id, `Priority escalated → ${c.priority.toUpperCase()} by ${actorLabel()}`);
    }
    toast(`${id} escalated`, 'Priority raised.', 'ok');
    afterMutation();
  }
}

function offCreate(p) {
  const st = App.state;
  st.seq = (st.seq || 1027) + 1;
  const nowIso = new Date().toISOString();
  const oc = areaCoords(p.origin), dc = areaCoords(p.dest);
  const c = {
    id: `LL-${new Date().getFullYear()}-${String(st.seq).padStart(6, '0')}`,
    priority: p.priority, origin: p.origin, dest: p.dest,
    dept: p.dept || 'Emergency', amb: p.amb || '', eta: +p.eta,
    age: p.age || '—', reason: p.reason || 'Advanced treatment required',
    status: 0, traffic: pickTraffic(), created_at: nowIso, updated_at: nowIso,
    reported_by: actorLabel(), assigned_unit: null, bed_kind: null,
    original_eta: +p.eta, delayed: false, sla_escalated: false,
    incident_id: p.incident_id || null, tags: p.tags || [], handover: {},
    o_lat: oc[0], o_lng: oc[1], d_lat: dc[0], d_lng: dc[1],
    notes: [], history: [{ ts: nowIso, status: 0 }],
  };
  const h = findHospitalObj(c.dest);
  if (h) {
    if (/icu|cardiac|neuro|trauma|obstetric|surgery/i.test(c.dept) && h.icuBeds > 0) { h.icuBeds--; c.bed_kind = 'icu'; }
    else if (h.genBeds > 0) { h.genBeds--; c.bed_kind = 'gen'; }
  }
  const u = st.units.find(x => x.id === c.amb);
  if (u && u.status === 'available') { u.status = 'en-route'; u.case = c.id; c.assigned_unit = u.id; }
  st.cases.unshift(c);
  offNotify('sms', `NEW ${c.priority.toUpperCase()} transfer ${c.id}: ${c.origin} → ${c.dest}`, c.id);
  offAudit(c.id, `Case registered by ${c.reported_by} · ${PRIO[c.priority].label} · ${c.origin} → ${c.dest}` +
    (c.bed_kind ? ` · ${c.bed_kind.toUpperCase()} bed reserved at ${c.dest}` : ''));
  if (App.role === 'attendant') App.attCaseId = c.id;
}

function offNotify(channel, body, caseId) {
  App.state.notifications = App.state.notifications || [];
  App.state.notifications.unshift({
    ts: new Date().toISOString(), channel, target: 'stakeholder',
    body, caseId, status: 'simulated',
  });
  if (App.state.notifications.length > 100) App.state.notifications.length = 100;
}

/* ================= derived helpers ================= */
function activeCases() { return App.state.cases.filter(c => c.status < 3); }

function dispEta(c) {
  return Math.max(0, Math.round(c.eta - (Date.now() - App.receivedAt) / 60000));
}

function findHospitalObj(name) {
  const q = (name || '').trim().toLowerCase();
  if (!q) return null;
  return (App.state.hospitals || []).find(h => h.name.toLowerCase() === q) || null;
}

function visibleCases() {
  let list = App.state.cases.slice();
  const f = App.filters;
  if (f.prio !== 'all') list = list.filter(c => c.priority === f.prio);
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter(c =>
      (c.id + ' ' + c.origin + ' ' + c.dest + ' ' + c.dept + ' ' + c.amb).toLowerCase().includes(q));
  }
  if (f.sort === 'eta') list.sort((a, b) => dispEta(a) - dispEta(b));
  else list.sort((a, b) => (PORD[a.priority] - PORD[b.priority]) || (a.eta - b.eta));
  return list;
}

function computeAnalytics() {
  const done = App.state.completed || [];
  const avg = arr => arr.length ? Math.round(arr.reduce((s, x) => s + x.durationMin, 0) / arr.length) : 0;
  const byPrio = {};
  Object.keys(PORD).forEach(p => { byPrio[p] = avg(done.filter(d => d.priority === p)); });
  const routes = {}, dests = {};
  done.forEach(d => {
    routes[d.route] = (routes[d.route] || 0) + 1;
    dests[d.dest] = (dests[d.dest] || 0) + 1;
  });
  const top = m => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const base = new Date(); base.setMinutes(0, 0, 0);
  const counts = new Array(12).fill(0);
  done.forEach(d => {
    const h = Math.floor((base - new Date(d.ts)) / 3600000);
    if (h >= 0 && h < 12) counts[11 - h]++;
  });
  App.state.cases.forEach(c => {
    const h = Math.floor((base - new Date(c.created_at)) / 3600000);
    if (h >= 0 && h < 12) counts[11 - h]++;
  });
  const labels = [];
  for (let i = 11; i >= 0; i--) {
    const t = new Date(base - i * 3600000);
    labels.push(pad(t.getHours()) + ':00');
  }
  return {
    avg_all: avg(done), avg_by_priority: byPrio,
    top_routes: top(routes), top_dests: top(dests),
    hourly: { labels, counts },
    completed: done.length, active: activeCases().length,
  };
}

/* ================= rendering ================= */
function renderAll() {
  if (!App.state || !App.role) return;
  fillDatalists();
  updateConn();
  renderDash();
  updatePulseStatic();
  if (App.openCaseId) {
    const still = App.state.cases.find(c => c.id === App.openCaseId);
    if (still) renderDetailInto(still);
    else { closeDetail(); }
  }
}

function fillDatalists() {
  $('hospNames').innerHTML = (App.state.hospitals || [])
    .map(h => `<option value="${esc(h.name)}">`).join('');
  $('unitIds').innerHTML = (App.state.units || [])
    .map(u => `<option value="${esc(u.id)}">`).join('');
}

function statRow(counts, total) {
  return `<div class="stat-row">
    <div class="stat-card c-critical"><div class="n">${counts.critical}</div><div class="l">${t('critical')}</div></div>
    <div class="stat-card c-urgent"><div class="n">${counts.urgent}</div><div class="l">${t('urgent')}</div></div>
    <div class="stat-card c-priority"><div class="n">${counts.priority}</div><div class="l">${t('priority')}</div></div>
    <div class="stat-card c-info"><div class="n">${total}</div><div class="l">${t('active_total')}</div></div>
  </div>`;
}

function prioCounts(list) {
  const counts = { critical: 0, urgent: 0, priority: 0 };
  list.forEach(c => { if (counts[c.priority] !== undefined) counts[c.priority]++; });
  return counts;
}

function headBlock(title, sub, showBtn) {
  return `<div class="dash-head">
    <div><h2>${title}</h2><div class="sub">${sub}</div></div>
    ${showBtn && canDo('create') ? `<button class="btn" id="newCaseBtn" type="button">${t('new_transfer')}</button>` : ''}
  </div>`;
}

function cardGrid(list, isDest) {
  if (!list.filter(c => c.status < 3).length && !list.length) {
    return '<div class="empty">No active transfers right now.</div>';
  }
  const rows = list.map(c => {
    const elapsed = minsAgo(c.created_at);
    const eta = dispEta(c);
    const pct = Math.min(100, Math.round(elapsed / Math.max(1, elapsed + eta) * 100));
    const chips = [
      c.delayed ? `<span class="mchip delayed-chip">DELAYED</span>` : '',
      c.bed_kind ? `<span class="mchip bed">${c.bed_kind.toUpperCase()} BED RESERVED</span>` : '',
      c.assigned_unit ? `<span class="mchip unit">UNIT ${esc(c.assigned_unit)}</span>` : '',
      c.incident_id ? `<span class="mchip unit">MCI ${esc(c.incident_id)}</span>` : '',
      c.notes && c.notes.length ? `<span class="mchip notes">${c.notes.length} NOTE${c.notes.length > 1 ? 'S' : ''}</span>` : '',
      c.tags && c.tags.length ? `<span class="tagchip-mini">${c.tags.map(esc).join('</span><span class="tagchip-mini">')}</span>` : '',
    ].filter(Boolean).join('');
    return `
    <div class="case-card pr-${c.priority}${c.priority === 'critical' ? ' glow' : ''}" data-id="${c.id}" role="button" tabindex="0">
      <div class="cc-top">
        <span class="cc-id">${esc(c.id)}</span>
        <span class="badge pr-${c.priority}">${PRIO[c.priority].dot} ${PRIO[c.priority].label}</span>
      </div>
      <div class="cc-route">${esc(c.origin)}<span>→</span>${esc(c.dest)}</div>
      <div class="cc-dept">${isDest ? 'Prepare: ' : ''}${esc(c.dept)} · Age ${esc(c.age)} · ${esc(c.amb) || 'unit TBD'}</div>
      ${chips ? `<div class="mini-chips">${chips}</div>` : ''}
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="cc-bottom">
        <div class="eta"><span class="num">${eta}</span> <span class="lbl">${t('min_eta')}</span></div>
        <div class="status-pill"><span class="status-dot"></span>${STATUS[c.status]}</div>
      </div>
    </div>`;
  }).join('');
  return `<div class="case-grid">${rows}</div>`;
}

function adminTable(list) {
  return `<table><thead><tr><th>Case ID</th><th>Priority</th><th>Route</th><th>Status</th><th>ETA</th><th>Unit</th></tr></thead>
  <tbody>${list.map(c => `<tr${c.status === 4 ? ' class="row-cancelled"' : ''}>
    <td style="font-family:var(--mono)">${esc(c.id)}</td>
    <td><span class="badge pr-${c.priority}">${PRIO[c.priority].label}</span></td>
    <td>${esc(c.origin)} → ${esc(c.dest)}</td>
    <td>${STATUS[c.status]}</td>
    <td>${c.status < 3 ? dispEta(c) + ' min' : '—'}</td>
    <td style="font-family:var(--mono)">${esc(c.assigned_unit || c.amb || '—')}</td>
  </tr>`).join('')}</tbody></table>`;
}

function toolbarHTML() {
  const f = App.filters;
  const chip = (key, label) =>
    `<button type="button" class="fchip${f.prio === key ? ' on' : ''}" data-fp="${key}">${label}</button>`;
  return `<div class="toolbar">
    <input class="tool-search" id="cmdSearch" placeholder="Search case ID, hospital, department, unit…" value="${esc(f.q)}">
    <div class="chip-row">
      ${chip('all', 'ALL')}${chip('critical', `${icon('dot','ic ic-sm ic-critical')} CRITICAL`)}${chip('urgent', `${icon('dot','ic ic-sm ic-urgent')} URGENT`)}${chip('priority', `${icon('dot','ic ic-sm ic-priority')} PRIORITY`)}
    </div>
    <select class="sort-sel" id="sortSel" aria-label="Sort cases">
      <option value="priority"${f.sort === 'priority' ? ' selected' : ''}>Sort: Priority</option>
      <option value="eta"${f.sort === 'eta' ? ' selected' : ''}>Sort: ETA</option>
    </select>
    ${canDo('assign') ? `<button class="btn small ghost" type="button" data-act="csv-export">${icon('download','ic ic-sm')} ${t('csv_report')}</button>` : ''}
  </div>`;
}

function unitsStrip() {
  const units = App.state.units || [];
  if (!units.length) return '';
  return `<div class="cmd-strip">${units.map(u => {
    const dot = u.status === 'available' ? 'ok' : u.status === 'en-route' ? 'busy' : 'off';
    return `<div class="cmd-chip"><span class="${dot}"></span>${esc(u.id)} — ${esc(u.status.toUpperCase())}${u.case ? ' · ' + esc(u.case) : ''}</div>`;
  }).join('')}</div>`;
}

function sitrepBlock() {
  return `<div class="dash-head" style="margin-top:28px;"><h2>${icon('bot','ic')} AI Situation Report</h2>
    <div class="sub">One-tap operational briefing, generated from live case &amp; hospital data</div></div>
  <div class="analytics-panel sitrep-panel">
    <button class="btn" type="button" data-act="sitrep-run" id="sitrepBtn">Generate situation report</button>
    <span class="ai-triage-status" id="sitrepStatus"></span>
    <div class="ai-triage-result" id="sitrepResult" hidden></div>
  </div>`;
}

function mciBlock() {
  const incs = App.state.incidents || [];
  const open = incs.filter(i => !i.closed_ts);
  let inner = '';
  if (open.length) {
    inner += open.map(i => {
      const c = i.counts || {};
      const total = (c.critical || 0) + (c.urgent || 0) + (c.priority || 0);
      return `<div class="incident-banner" data-inc="${esc(i.id)}">
        <span class="ib-title">${icon('siren','ic ic-sm ic-critical')} ${esc(i.id)} · ${esc(i.name)}</span>
        <span class="ib-meta">${esc(i.location || '—')} · opened ${timeStr(i.opened_ts)} · ${total} active case${total === 1 ? '' : 's'} linked</span>
        ${canDo('assign') ? `<button class="btn small danger" type="button" data-act="inc-close" data-id="${esc(i.id)}">${t('close_incident')}</button>` : ''}
      </div>`;
    }).join('');
  }
  if (canDo('assign')) {
    inner += `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
      <input id="incName" placeholder="${t('incident_name')}" maxlength="80" style="max-width:220px;">
      <input id="incLoc" placeholder="${t('location_ph')}" maxlength="120" style="max-width:200px;">
      <button class="btn small warn" type="button" data-act="inc-declare">${icon('siren','ic ic-sm')} ${t('declare_mci')}</button>
    </div>`;
  }
  if (!inner) return '';
  return `<div class="dash-head" style="margin-top:28px;"><h2>${t('mci_title')}</h2>
    <div class="sub">${open.length ? open.length + ' open' : t('none_open')}</div></div>${inner}`;
}

function notificationsBlock() {
  const list = (App.state.notifications || []).slice(0, 12);
  const live = App.state.notify_mode === 'twilio';
  return `<div class="dash-head" style="margin-top:28px;"><h2>${t('notifications')}</h2>
    <div class="sub">SMS / WhatsApp / radio dispatch log ·
      <b style="color:${live ? 'var(--ok)' : 'var(--urgent)'}">${live ? 'LIVE — Twilio configured' : 'SIMULATED — set Twilio credentials for real SMS'}</b>
    </div></div>
  <div class="analytics-panel">
    ${list.length ? list.map(n => `
      <div class="notif-row">
        <span class="notif-ch ${esc(n.channel)}">${esc(n.channel)}</span>
        <div class="notif-body">${esc(n.body)}
          <span class="notif-meta">${timeStr(n.ts)} · case ${esc(n.caseId || '—')} ·
            <span class="${n.status === 'sent' ? 'st-sent' : n.status === 'simulated' ? '' : 'st-failed'}">${esc(n.status)}</span>
          </span>
        </div>
      </div>`).join('') : '<div class="empty" style="padding:18px;">No notifications yet.</div>'}
  </div>`;
}

function bloodBankBlock() {
  const bb = App.state.bloodbanks || {};
  const regions = Object.keys(bb);
  if (!regions.length) return '';
  return `<div class="dash-head" style="margin-top:28px;"><h2>${t('blood_bank')}</h2>
    <div class="sub">units available per blood type · updates live</div></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
    ${regions.map(r => `
      <div class="analytics-panel">
        <h4>${esc(r)}</h4>
        <div class="blood-grid">
          ${Object.entries(bb[r]).map(([bt, n]) => `
            <div class="bb-cell ${n === 0 ? 'lv-out' : n <= 2 ? 'lv-low' : 'lv-ok'}">
              <span class="bb-type">${esc(bt)}</span><span class="bb-units">${n}</span>
            </div>`).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

function analyticsBlock() {
  const a = App.state.analytics || computeAnalytics();
  const bars = (items, color) => {
    const max = Math.max(...items.map(x => x[1]), 1);
    return items.map(([label, n]) => `
      <div class="bar-row">
        <div class="bar-label">${esc(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(n / max) * 100}%;${color || ''}"></div></div>
        <div class="bar-val">${n}</div>
      </div>`).join('');
  };
  const sparkMax = Math.max(...a.hourly.counts, 1);
  const spark = a.hourly.counts.map(n =>
    `<i style="height:${Math.max(4, (n / sparkMax) * 100)}%" title="${n} case(s)"></i>`).join('');
  return `<div class="dash-head" style="margin-top:28px;"><h2>${t('analytics')}</h2>
    <div class="sub">Based on ${a.completed} completed transfers · ${a.active} active now</div></div>
  <div class="stat-row">
    <div class="stat-card c-info"><div class="n">${a.avg_all}<span style="font-size:13px;">m</span></div><div class="l">Avg transfer time</div></div>
    <div class="stat-card c-critical"><div class="n">${a.avg_by_priority.critical}<span style="font-size:13px;">m</span></div><div class="l">Avg — critical</div></div>
    <div class="stat-card c-urgent"><div class="n">${a.avg_by_priority.urgent}<span style="font-size:13px;">m</span></div><div class="l">Avg — urgent</div></div>
    <div class="stat-card c-priority"><div class="n">${a.avg_by_priority.priority}<span style="font-size:13px;">m</span></div><div class="l">Avg — priority</div></div>
  </div>
  <div class="analytics-grid">
    <div class="analytics-panel">
      <h4>Most frequent routes</h4>${bars(a.top_routes)}
    </div>
    <div class="analytics-panel">
      <h4>Hospital transfer volume (destinations)</h4>${bars(a.top_dests, 'background:var(--priority);')}
    </div>
    <div class="analytics-panel">
      <h4>Case volume — last 12 hours</h4>
      <div class="spark">${spark}</div>
      <div class="spark-labels"><span>${esc(a.hourly.labels[0])}</span><span>now</span></div>
    </div>
  </div>`;
}

function auditBlock() {
  const log = App.state.audit || [];
  return `<div class="dash-head" style="margin-top:28px;"><h2>${t('activity_log')}</h2>
    <div class="sub">System-wide audit trail — most recent first</div></div>
  <div class="audit-list">
    ${log.slice(0, 25).map(e => `
      <div class="audit-row">
        <span class="audit-time">${timeStr(e.ts)}</span>
        <span class="audit-case">${esc(e.caseId)}</span>
        <span class="audit-txt">${esc(e.text)}</span>
      </div>`).join('') || '<div class="empty">No activity yet.</div>'}
  </div>`;
}

function timelineHTML(c) {
  const steps = ['Case registered', 'Ambulance dispatched', 'Approaching destination', 'Patient handover'];
  if (c.status === 4) {
    return `<div class="timeline"><div class="tl-item done"><div class="tl-dot" style="background:var(--critical)"></div>
      <div class="tl-txt"><div class="t">Case cancelled</div><div class="s">STAKEHOLDERS NOTIFIED</div></div></div></div>`;
  }
  return `<div class="timeline">
    ${steps.map((s, i) => `
      <div class="tl-item ${i < c.status ? 'done' : i === c.status ? 'active' : ''}">
        <div class="tl-dot"></div>
        <div class="tl-txt"><div class="t">${s}</div>${i === c.status ? '<div class="s">CURRENT STAGE</div>' : ''}</div>
      </div>`).join('')}
  </div>`;
}

function renderDash() {
  const root = $('dashRoot');
  const active = activeCases();
  const counts = prioCounts(active);
  let html = '';

  if (App.role === 'sending') {
    html += headBlock('Sending Hospital — Active Transfers', 'Cases you have initiated', true);
    html += statRow(counts, active.length);
    html += cardGrid(active);
  } else if (App.role === 'dest') {
    html += headBlock('Incoming Patients', 'Cases routed to your facility — prepare beds & departments', false);
    html += statRow(counts, active.length);
    html += cardGrid(active, true);
  } else if (App.role === 'police') {
    html += headBlock('Emergency Transfer Notifications', 'Coordination view — route & priority only', false);
    html += statRow(counts, active.length);
    html += cardGrid(active);
  } else if (App.role === 'traffic') {
    const congested = active.filter(c => c.traffic === 'Heavy congestion');
    html += headBlock('Traffic Coordination', 'Live congestion & route status per case', false);
    if (congested.length) {
      html += `<div class="alert-box">${icon('alertTriangle','ic')}<div class="txt"><strong>${congested.length} case(s) flagged</strong> — heavy congestion detected on planned route. Alternative route recommended.</div></div>`;
    }
    html += statRow(counts, active.length);
    html += cardGrid(active);
  } else if (App.role === 'command' || App.role === 'admin') {
    html += headBlock(
      App.role === 'command' ? 'Command Center' : 'System Overview',
      App.role === 'command'
        ? 'Master view — all hospitals, ambulances, police & traffic'
        : 'All cases & stakeholder access', true);
    html += unitsStrip();
    html += sitrepBlock();
    html += mciBlock();
    html += toolbarHTML();
    html += `<div id="cmdResults">${adminTable(visibleCases())}<div style="margin-top:20px;">${cardGrid(visibleCases())}</div></div>`;
    html += analyticsBlock();
    html += notificationsBlock();
    html += bloodBankBlock();
    html += auditBlock();
  } else if (App.role === 'responder') {
    html += headBlock('Responder — Field Unit', 'Your assigned runs · claim unassigned runs below', true);
    const mine = active.filter(c => c.assigned_unit === App.unit || (App.unit && c.amb === App.unit));
    const queue = active.filter(c => !c.assigned_unit);
    if (mine.length) {
      html += '<div class="queue-h">' + t('my_runs') + '</div>';
      html += mine.map(runCardHTML).join('');
    } else {
      html += '<div class="queue-h">' + t('my_runs') + '</div><div class="empty">No run assigned ' + esc(App.unit || 'your unit') + '.</div>';
    }
    html += '<div class="queue-h">' + t('unassigned_queue') + '</div>';
    html += queue.length
      ? queue.map(runCardHTML).join('')
      : `<div class="empty">Every active case has a unit. ${icon('checkCircle','ic ic-sm ic-ok')}</div>`;
  } else if (App.role === 'attendant') {
    html += headBlock('Patient Attendant', "Track your family member's transfer", false);
    if (!active.length) {
      html += '<div class="empty">No active transfer linked to your account.</div>';
    } else {
      if (!App.attCaseId || !active.find(c => c.id === App.attCaseId)) App.attCaseId = active[0].id;
      const c = active.find(x => x.id === App.attCaseId);
      html += `<div class="field" style="max-width:340px;margin-bottom:18px;">
        <label>Viewing case</label>
        <select id="attSelect">${active.map(a =>
        `<option value="${a.id}"${a.id === App.attCaseId ? ' selected' : ''}>${a.id} — ${esc(a.origin)} → ${esc(a.dest)}</option>`).join('')}</select>
      </div>`;
      html += `<div class="responder-action">
        <div class="rlabel">${PRIO[c.priority].dot} ${PRIO[c.priority].label} transfer · ${esc(c.id)}</div>
        <div class="rroute">${esc(c.origin)} → ${esc(c.dest)}</div>
        <p style="font-size:13.5px;color:var(--dim);line-height:1.6;margin-bottom:14px;">
          Your patient is currently <strong style="color:var(--text)">${STATUS[c.status].toLowerCase()}</strong>,
          headed to <strong style="color:var(--text)">${esc(c.dest)}</strong> for ${esc(c.dept.toLowerCase())}.
          Estimated arrival in <strong style="color:var(--text)">${dispEta(c)} minutes</strong>. Traffic on route: ${esc(c.traffic.toLowerCase())}.
        </p>
        <div class="quick-dial">
          <span class="qd-btn">Ambulance dispatch <span class="cn">108</span></span>
          <span class="qd-btn">National emergency <span class="cn">112</span></span>
        </div>
      </div>`;
      html += timelineHTML(c);
    }
  }
  root.innerHTML = html;
}

function runCardHTML(c) {
  const mine = c.assigned_unit === App.unit || (App.unit && c.amb === App.unit);
  return `<div class="responder-action" data-id="${c.id}">
    <div class="rlabel">${esc(c.id)} · ${PRIO[c.priority].dot} ${PRIO[c.priority].label} · ${esc(c.amb) || 'no unit'}${mine ? ' · YOUR RUN' : ''}</div>
    <div class="rroute">${esc(c.origin)} → ${esc(c.dest)}</div>
    <div class="dp-row"><span class="k">Department</span><span class="v">${esc(c.dept)}</span></div>
    <div class="dp-row"><span class="k">Patient age</span><span class="v">${esc(c.age)}</span></div>
    <div class="dp-row"><span class="k">Traffic</span><span class="v">${esc(c.traffic)}</span></div>
    <div class="dp-row"><span class="k">Status</span><span class="v">${STATUS[c.status]} · ETA ${dispEta(c)} min</span></div>
    <div class="action-btns">
      ${mine && canDo('advance') ? `<button class="btn small" type="button" data-act="advance" data-id="${c.id}">${c.status < 2 ? t('advance_status') : t('mark_arrived')}</button>` : ''}
      ${!c.assigned_unit && canDo('claim') ? `<button class="btn small" type="button" data-act="claim" data-id="${c.id}">${t('claim_run')}</button>` : ''}
      ${canDo('flag') ? `<button class="btn small ghost" type="button" data-act="flag" data-id="${c.id}">${t('flag_traffic')}</button>` : ''}
      <button class="btn small ghost" type="button" data-act="detail" data-id="${c.id}">${t('open_details')}</button>
    </div>
    <div class="quick-dial">
      <span class="qd-btn">Police <span class="cn">100</span></span>
      <span class="qd-btn">Traffic control <span class="cn">8454999999</span></span>
      <span class="qd-btn">Ambulance dispatch <span class="cn">108</span></span>
    </div>
  </div>`;
}

function renderCmdResults() {
  const el = $('cmdResults');
  if (!el) return;
  el.innerHTML = `${adminTable(visibleCases())}<div style="margin-top:20px;">${cardGrid(visibleCases())}</div>`;
}

/* ================= detail panel ================= */
const detailOverlay = () => $('detailOverlay');
const detailPanel = () => $('detailPanel');

function openDetail(id) {
  const c = App.state.cases.find(x => x.id === id);
  if (!c) return;
  App.openCaseId = id;
  renderDetailInto(c);
  detailOverlay().classList.add('show');
  detailPanel().classList.add('show');
}

function closeDetail() {
  App.openCaseId = null;
  detailOverlay().classList.remove('show');
  detailPanel().classList.remove('show');
}

function renderDetailInto(c) {
  const events = (App.state.audit || []).filter(e => e.caseId === c.id).slice(0, 8);
  const notes = (c.notes || []).slice(-30);
  const units = App.state.units || [];
  buildDetail(c, events, notes, units, c.status < 3);
}

function buildDetail(c, events, notes, units, editable) {
  const isMine = c.assigned_unit === App.unit || (App.unit && c.amb === App.unit);
  const btns = [];
  if (editable && isMine && canDo('advance')) {
    btns.push(`<button class="btn small" type="button" data-act="advance" data-id="${c.id}">${c.status < 2 ? t('advance_status') : t('mark_arrived')}</button>`);
  }
  if (editable && !c.assigned_unit && canDo('claim')) {
    btns.push(`<button class="btn small" type="button" data-act="claim" data-id="${c.id}">${t('claim_run')}</button>`);
  }
  if (editable && canDo('flag')) {
    btns.push(`<button class="btn small ghost" type="button" data-act="flag" data-id="${c.id}">${t('flag_traffic')}</button>`);
  }
  if (editable && canDo('escalate') && c.priority !== 'critical') {
    btns.push(`<button class="btn small warn" type="button" data-act="escalate" data-id="${c.id}">${icon('chevronUp','ic ic-sm')} ${t('escalate_priority')}</button>`);
  }
  if (editable && canDo('cancel')) {
    btns.push(`<button class="btn small danger" type="button" data-act="cancel" data-id="${c.id}">${icon('close','ic ic-sm')} ${t('cancel_case')}</button>`);
  }

  const availableUnits = units.filter(u => u.status === 'available' && !u.case);
  const dispatchSel = canDo('assign') && editable && !c.assigned_unit ? `
    <div class="analytics-panel" style="margin-top:16px;border:1px solid var(--critical);">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--critical);font-weight:700;margin-bottom:8px;">
        🚑 Dispatch Ambulance
      </div>
      <div style="font-size:12px;color:var(--dim);margin-bottom:10px;">
        ${availableUnits.length ? `${availableUnits.length} ambulance(s) available` : 'No ambulances currently available'}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <select id="dispatchSel" data-id="${c.id}" ${availableUnits.length ? '' : 'disabled'}>
          <option value="">— select available unit —</option>
          ${availableUnits.map((u, i) => `<option value="${esc(u.id)}">${esc(u.id)} · AVAILABLE${i === 0 ? ' · RECOMMENDED' : ''}</option>`).join('')}
        </select>
        <button class="btn small danger" type="button" data-act="dispatch" data-id="${c.id}" ${availableUnits.length ? '' : 'disabled'}>
          🚑 Dispatch ambulance
        </button>
      </div>
    </div>` : '';


  const notesHTML = notes.length
    ? notes.slice().reverse().map(n => `
      <div class="note">
        <div class="nh"><b>${esc(n.author)}</b><span>${timeStr(n.ts)}</span></div>
        ${esc(n.text)}
      </div>`).join('')
    : '<div class="empty" style="padding:18px;">No notes yet.</div>';

  detailPanel().innerHTML = `
    <div class="dp-head">
      <span class="badge pr-${c.priority}">${PRIO[c.priority].dot} ${PRIO[c.priority].label}</span>
      <h3 style="font-family:var(--disp);font-size:18px;margin-top:10px;">${esc(c.id)}</h3>
      <div style="font-size:12px;color:var(--dim);margin-top:4px;">${esc(c.origin)} → ${esc(c.dest)}</div>
    </div>
    <div class="dp-body">
      <div class="dp-row"><span class="k">Reported by</span><span class="v">${esc(c.reported_by || '—')}</span></div>
      <div class="dp-row"><span class="k">Department</span><span class="v">${esc(c.dept)}</span></div>
      <div class="dp-row"><span class="k">Patient age</span><span class="v">${esc(c.age)}</span></div>
      <div class="dp-row"><span class="k">Unit</span><span class="v">${esc(c.assigned_unit || c.amb || 'unassigned')}</span></div>
      <div class="dp-row"><span class="k">Reason</span><span class="v">${esc(c.reason)}</span></div>
      <div class="dp-row"><span class="k">Traffic</span><span class="v">${esc(c.traffic)}</span></div>
      <div class="dp-row"><span class="k">ETA</span><span class="v">${c.status < 3 ? dispEta(c) + ' min' : '—'}${c.delayed ? ' · <b style="color:var(--critical)">DELAYED</b>' : ''}</span></div>
      ${c.bed_kind ? `<div class="dp-row"><span class="k">Bed</span><span class="v" style="color:var(--priority)">${c.bed_kind.toUpperCase()} RESERVED</span></div>` : ''}
      ${c.incident_id ? `<div class="dp-row"><span class="k">Incident</span><span class="v" style="color:var(--critical)">${icon('siren','ic ic-sm')} ${esc(c.incident_id)}</span></div>` : ''}
      ${c.tags && c.tags.length ? `<div class="dp-row"><span class="k">Equipment</span><span class="v">${c.tags.map(x => `<span class="tagchip-mini">${esc(x)}</span>`).join('')}</span></div>` : ''}
      ${timelineHTML(c)}
      ${handoverHTML(c)}
      ${btns.length ? `<div class="action-btns" style="margin-top:16px;">${btns.join('')}</div>` : ''}
      ${dispatchSel}
      <div class="notes-block">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--dim);margin-bottom:8px;">Coordination notes</div>
        ${notesHTML}
        <div class="note-composer">
          <input id="noteInput" placeholder="Add a note…" maxlength="500">
          <button class="btn small" type="button" data-act="note-send" data-id="${c.id}">${t('send')}</button>
        </div>
      </div>
      <div style="margin-top:18px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--dim);margin-bottom:8px;">Case activity</div>
        <div class="audit-list">
          ${events.map(e => `
            <div class="audit-row" style="grid-template-columns:70px 1fr;">
              <span class="audit-time">${timeStr(e.ts)}</span>
              <span class="audit-txt">${esc(e.text)}</span>
            </div>`).join('') || '<div class="empty" style="padding:18px;">No logged activity.</div>'}
        </div>
      </div>
      <button class="btn ghost small" style="width:100%;margin-top:16px;" type="button" data-act="print-sheet" data-id="${c.id}">${icon('printer','ic ic-sm')} ${t('print_sheet')}</button>
      <button class="btn ghost small" style="width:100%;margin-top:8px;" type="button" data-act="export" data-id="${c.id}">${icon('download','ic ic-sm')} Download case summary (PDF)</button>
    </div>`;
}

function handoverHTML(c) {
  if (c.status >= 3 && c.status !== 2 && !(c.handover && Object.keys(c.handover).length)) return '';
  const items = (App.state.checklist || CHECKLIST.map(([k, label]) => ({ k, label })));
  const hv = c.handover || {};
  const doneCount = items.filter(it => hv[it.k] && hv[it.k].done).length;
  const allDone = doneCount === items.length;
  return `<div style="margin-top:18px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--dim);margin-bottom:8px;">
      ${t('handover_pod')} — ${doneCount}/${items.length}${allDone ? ` · ${icon('checkCircle','ic ic-sm ic-ok')} POD COMPLETE` : ''}
    </div>
    ${items.map(it => {
      const st = hv[it.k];
      return `<label class="dp-row" style="cursor:pointer;align-items:center;">
        <input type="checkbox" data-act="handover" data-id="${esc(c.id)}" data-item="${esc(it.k)}"
          ${st && st.done ? 'checked' : ''} ${st && st.done ? 'disabled' : ''} style="margin-right:8px;">
        <span class="v" style="flex:1;">${esc(it.label)}${st && st.done ? ` <span style="color:var(--dimmer);font-size:10.5px;">· ${esc(st.by || '')}</span>` : ''}</span>
      </label>`;
    }).join('')}
  </div>`;
}

/* ================= exports ================= */
function exportCaseAsText(c, events) {
  const lines = [
    'LIFE-LINE — EMERGENCY TRANSFER CASE SUMMARY',
    '='.repeat(44),
    `Case ID: ${c.id}`,
    `Priority: ${PRIO[c.priority].label}`,
    `Status: ${STATUS[c.status]}`,
    '',
    `Sending hospital: ${c.origin}`,
    `Destination hospital: ${c.dest}`,
    `Required department: ${c.dept}`,
    `Patient age: ${c.age}`,
    `Transfer reason: ${c.reason}`,
    `Unit: ${c.assigned_unit || c.amb || 'unassigned'}`,
    `Traffic status: ${c.traffic}`,
    `ETA at export: ${c.status < 3 ? dispEta(c) + ' min' : '—'}`,
    '',
    'NOTES',
    '-'.repeat(44),
    ...(c.notes || []).map(n => `${timeStr(n.ts)}  ${n.author}: ${n.text}`),
    '',
    'ACTIVITY LOG',
    '-'.repeat(44),
    ...events.map(e => `${timeStr(e.ts)}  ${e.text}`),
    '',
    `Exported: ${new Date().toString()}`,
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${c.id}-summary.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function exportCaseAsPDF(c, events) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 48;
  const priColor = { critical: [255, 59, 59], urgent: [255, 159, 59], priority: [46, 217, 168] }[c.priority];

  doc.setFillColor(8, 11, 16);
  doc.rect(0, 0, pageW, 90, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('LIFE-LINE', marginX, 38);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(180, 190, 200);
  doc.text('EMERGENCY TRANSFER CASE SUMMARY', marginX, 54);
  doc.setTextColor(...priColor);
  doc.text(`${PRIO[c.priority].label.toUpperCase()} · ${STATUS[c.status]}`, marginX, 74);
  doc.setTextColor(150, 160, 170);
  doc.text(c.id, pageW - marginX, 38, { align: 'right' });
  doc.text(new Date().toLocaleString(), pageW - marginX, 54, { align: 'right' });

  let y = 118;
  doc.setTextColor(20, 24, 30);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(`${c.origin}  →  ${c.dest}`, marginX, y);
  y += 26;

  const rows = [
    ['Case ID', c.id], ['Priority', PRIO[c.priority].label], ['Status', STATUS[c.status]],
    ['Required department', c.dept], ['Patient age', String(c.age)],
    ['Unit', c.assigned_unit || c.amb || 'unassigned'],
    ['Transfer reason', c.reason], ['Traffic status', c.traffic],
    ['ETA at export', c.status < 3 ? dispEta(c) + ' min' : '—'],
  ];
  doc.setFontSize(10);
  rows.forEach(([k, v]) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 130, 140);
    doc.text(k, marginX, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 24, 30);
    const lines = doc.splitTextToSize(String(v), pageW - marginX * 2 - 160);
    doc.text(lines, marginX + 160, y);
    y += 16 * Math.max(lines.length, 1);
  });

  y += 14;
  doc.setDrawColor(220, 224, 228);
  doc.line(marginX, y, pageW - marginX, y);
  y += 22;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 24, 30);
  doc.text('NOTES', marginX, y); y += 18;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  if (!(c.notes || []).length) {
    doc.setTextColor(140, 150, 160); doc.text('No notes.', marginX, y); y += 14;
  } else {
    (c.notes || []).forEach(n => {
      if (y > 770) { doc.addPage(); y = 56; }
      doc.setTextColor(140, 150, 160);
      doc.text(timeStr(n.ts), marginX, y);
      doc.setTextColor(40, 46, 54);
      const lines = doc.splitTextToSize(`${n.author}: ${n.text}`, pageW - marginX * 2 - 70);
      doc.text(lines, marginX + 70, y);
      y += 14 * Math.max(lines.length, 1);
    });
  }

  y += 12;
  if (y > 740) { doc.addPage(); y = 56; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 24, 30);
  doc.text('ACTIVITY LOG', marginX, y); y += 18;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  if (!events.length) {
    doc.setTextColor(140, 150, 160); doc.text('No logged activity.', marginX, y);
  } else {
    events.forEach(e => {
      if (y > 780) { doc.addPage(); y = 56; }
      doc.setTextColor(140, 150, 160);
      doc.text(timeStr(e.ts), marginX, y);
      doc.setTextColor(40, 46, 54);
      const lines = doc.splitTextToSize(e.text, pageW - marginX * 2 - 70);
      doc.text(lines, marginX + 70, y);
      y += 14 * Math.max(lines.length, 1);
    });
  }

  doc.setFontSize(8); doc.setTextColor(160, 168, 176);
  doc.text('Life-Line coordination platform', marginX, 820);
  doc.save(`${c.id}-summary.pdf`);
}

function exportCase(id) {
  const c = App.state.cases.find(x => x.id === id);
  if (!c) return;
  const events = (App.state.audit || []).filter(e => e.caseId === id).slice().reverse();
  try {
    if (window.jspdf && window.jspdf.jsPDF) exportCaseAsPDF(c, events);
    else throw new Error('jsPDF not available');
  } catch (err) {
    exportCaseAsText(c, events);
    toast('PDF unavailable', 'Downloaded as plain text instead.', 'info');
  }
}

/* ================= modals: new case ================= */
let selectedPrio = 'critical';
const modalFieldIds = ['fOrigin', 'fDest', 'fAge', 'fDept', 'fAmb', 'fEta', 'fReason', 'fClinicalNotes'];

function setSelectedPrio(p) {
  selectedPrio = p;
  document.querySelectorAll('.prio-opt').forEach(o => {
    o.className = 'prio-opt';
    o.setAttribute('aria-pressed', 'false');
  });
  const el = document.querySelector(`.prio-opt[data-p="${p}"]`);
  if (el) { el.classList.add('sel-' + p); el.setAttribute('aria-pressed', 'true'); }
}

function resetModalForm() {
  modalFieldIds.forEach(id => {
    const el = $(id);
    el.value = '';
    el.classList.remove('invalid');
  });
  ['errOrigin', 'errDest', 'errEta'].forEach(id => {
    const el = $(id);
    el.textContent = '';
    el.classList.remove('show');
  });
  $('destBedHint').innerHTML = '';
  $('destSuggest').hidden = true;
  $('destSuggest').innerHTML = '';
  const ph = $('predictHint');
  if (ph) ph.innerHTML = '';
  App.selectedTags.clear();
  document.querySelectorAll('#tagWrap .tagchip').forEach(ch => ch.classList.remove('on'));
  setSelectedPrio('critical');
  $('aiTriageStatus').textContent = '';
  $('aiTriageResult').hidden = true;
  $('aiTriageResult').innerHTML = '';
  $('fClinicalNotes').value = '';
  if (micListening && micRecognizer) micRecognizer.stop();
}

function buildTagChips() {
  const opts = (App.state && App.state.tag_options) || TAGS;
  $('tagWrap').innerHTML = opts.map(x =>
    `<button type="button" class="tagchip${App.selectedTags.has(x) ? ' on' : ''}" data-tag="${esc(x)}">${esc(x)}</button>`).join('');
}

function fillIncidentSelect() {
  const row = $('incidentRow'), sel = $('fIncident');
  const incs = ((App.state && App.state.incidents) || []).filter(i => !i.closed_ts);
  if (!incs.length) { row.hidden = true; sel.innerHTML = ''; return; }
  row.hidden = false;
  sel.innerHTML = `<option value="">— none —</option>` +
    incs.map(i => `<option value="${esc(i.id)}">${esc(i.id)} · ${esc(i.name)} (${esc(i.location || '—')})</option>`).join('');
}

function updateDestBedHint() {
  const hint = $('destBedHint');
  const h = findHospitalObj($('fDest').value);
  if (!h) { hint.innerHTML = ''; return; }
  hint.innerHTML = `${esc(h.area)} · ${esc(h.region)} · <span class="${h.icuBeds <= 1 ? 'crit' : 'ok'}">ICU ${h.icuBeds}</span> · Gen ${h.genBeds} beds free`;
}

function showFieldError(fieldId, errId, msg) {
  $(fieldId).classList.add('invalid');
  const err = $(errId);
  err.textContent = msg;
  err.classList.add('show');
}

function clearFieldError(fieldId, errId) {
  $(fieldId).classList.remove('invalid');
  const err = $(errId);
  err.textContent = '';
  err.classList.remove('show');
}

function validateModalForm() {
  let valid = true;
  const origin = $('fOrigin').value.trim();
  const dest = $('fDest').value.trim();
  const etaRaw = $('fEta').value.trim();
  clearFieldError('fOrigin', 'errOrigin');
  clearFieldError('fDest', 'errDest');
  clearFieldError('fEta', 'errEta');
  if (!origin) { showFieldError('fOrigin', 'errOrigin', 'Sending hospital is required.'); valid = false; }
  if (!dest) { showFieldError('fDest', 'errDest', 'Destination hospital is required.'); valid = false; }
  else if (origin && dest.toLowerCase() === origin.toLowerCase()) {
    showFieldError('fDest', 'errDest', 'Destination must differ from sending hospital.'); valid = false;
  }
  if (!etaRaw) { showFieldError('fEta', 'errEta', 'Estimated transit time is required.'); valid = false; }
  else {
    const n = Number(etaRaw);
    if (!Number.isFinite(n) || n <= 0 || n > 720) {
      showFieldError('fEta', 'errEta', 'Enter a transit time between 1 and 720.'); valid = false;
    }
  }
  return valid;
}

function openModal() {
  resetModalForm();
  buildTagChips();
  fillIncidentSelect();
  $('modalOverlay').classList.add('show');
  $('fOrigin').focus();
}
function closeModal() { $('modalOverlay').classList.remove('show'); resetModalForm(); }

/* ---- destination suggestions + ETA prediction ---- */
let suggestTimer = null;

function localRecommend(dept, origin) {
  const dtoks = new Set((dept || '').toLowerCase().match(/[a-z]+/g) || []);
  const oc = areaCoords(origin);
  return (App.state.hospitals || [])
    .filter(h => h.name.toLowerCase() !== (origin || '').trim().toLowerCase())
    .map(h => {
      let score = 0; const reasons = [];
      let spec = 10;
      for (const [sp, kws] of Object.entries(SPECIALTY_KEYWORDS)) {
        if (kws.some(k => h.name.toLowerCase().includes(k))) {
          if (dtoks.has(sp) || [...dtoks].some(x => sp.includes(x))) { spec = 40; reasons.push(`known ${sp} centre`); break; }
          spec = Math.max(spec, 20);
        }
      }
      score += spec;
      if (h.icuBeds > 0) { score += Math.min(h.icuBeds, 4) / 4 * 25; reasons.push(`${h.icuBeds} ICU free`); }
      else if (h.genBeds > 0) { score += 8; reasons.push('general beds only'); }
      else reasons.push('no beds');
      const dist = haversine(oc, hospitalCoords(h));
      score += Math.max(0, (40 - Math.min(dist, 40)) / 40 * 25);
      reasons.push(`${dist.toFixed(1)} km`);
      return { name: h.name, score: Math.round(score), distance_km: Math.round(dist * 10) / 10, reasons };
    })
    .sort((a, b) => b.score - a.score).slice(0, 5);
}

/* ---- voice input for AI Triage (Web Speech API, feature-detected) ---- */
let micRecognizer = null, micListening = false;

function initMicButton() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('micBtn');
  if (!SR) { btn.hidden = true; return; }
  btn.hidden = false;
  micRecognizer = new SR();
  micRecognizer.continuous = false;
  micRecognizer.interimResults = false;
  micRecognizer.lang = App.lang === 'hi' ? 'hi-IN' : App.lang === 'mr' ? 'mr-IN' : 'en-IN';

  micRecognizer.onresult = e => {
    const text = e.results[0][0].transcript;
    const ta = $('fClinicalNotes');
    ta.value = (ta.value.trim() ? ta.value.trim() + ' ' : '') + text;
  };
  micRecognizer.onerror = () => {
    $('aiTriageStatus').textContent = 'Mic error — check browser microphone permission.';
    $('aiTriageStatus').className = 'ai-triage-status warn';
  };
  micRecognizer.onend = () => {
    micListening = false;
    btn.classList.remove('listening');
    btn.innerHTML = icon('mic', 'ic');
  };

  btn.onclick = () => {
    if (micListening) { micRecognizer.stop(); return; }
    try {
      micRecognizer.lang = App.lang === 'hi' ? 'hi-IN' : App.lang === 'mr' ? 'mr-IN' : 'en-IN';
      micRecognizer.start();
      micListening = true;
      btn.classList.add('listening');
      btn.innerHTML = icon('recordDot', 'ic ic-critical');
      $('aiTriageStatus').textContent = 'Listening…';
      $('aiTriageStatus').className = 'ai-triage-status';
    } catch (e) { /* already started */ }
  };
}

/* ---- AI situation report ---- */
function localHeuristicSitrep() {
  const active = activeCases();
  const counts = prioCounts(active);
  const totalActive = (counts.critical || 0) + (counts.urgent || 0) + (counts.priority || 0);
  const delayed = active.filter(c => c.delayed);
  const lowBeds = (App.state.hospitals || []).filter(h => h.icuBeds <= 1)
    .sort((a, b) => a.icuBeds - b.icuBeds).slice(0, 3);
  const openIncidents = (App.state.incidents || []).filter(i => !i.closed_ts);
  const parts = [];
  parts.push(totalActive
    ? `${totalActive} active transfer(s) in progress (${counts.critical || 0} critical, ${counts.urgent || 0} urgent, ${counts.priority || 0} priority).`
    : 'No active transfers — system nominal.');
  if (delayed.length) parts.push(`${delayed.length} transfer(s) flagged DELAYED beyond ETA (${delayed.map(c => c.id).join(', ')}) — review routing.`);
  if (lowBeds.length) parts.push(`ICU capacity tight at: ${lowBeds.map(h => `${h.name} (${h.icuBeds} ICU)`).join(', ')}.`);
  if (openIncidents.length) parts.push(`${openIncidents.length} mass-casualty incident(s) open (${openIncidents.map(i => i.id).join(', ')}).`);
  return { summary: parts.join(' '), mode: 'heuristic' };
}

async function runSituationReport() {
  const btn = $('sitrepBtn'), status = $('sitrepStatus'), result = $('sitrepResult');
  btn.disabled = true;
  status.textContent = 'Generating…'; status.className = 'ai-triage-status';
  result.hidden = true;
  let r;
  try {
    if (App.mode === 'live') r = await api('/api/situation-report');
    else r = localHeuristicSitrep();
  } catch (e) {
    r = localHeuristicSitrep();
    r.mode = 'heuristic-fallback';
  }
  btn.disabled = false;
  status.textContent = '';
  const modeIcon = r.mode === 'ai' ? icon('bot','ic ic-sm')
    : r.mode === 'heuristic-fallback' ? icon('alertTriangle','ic ic-sm ic-urgent')
    : icon('calculator','ic ic-sm');
  const modeLabel = r.mode === 'ai' ? 'AI briefing (Claude)'
    : r.mode === 'heuristic-fallback' ? 'Heuristic fallback (AI unavailable)'
    : 'Offline heuristic (demo mode)';
  result.hidden = false;
  result.innerHTML = `<strong>${modeIcon} ${esc(modeLabel)}</strong><br>${esc(r.summary)}`;
}

/* ---- AI triage (free-text notes -> priority/dept/tags suggestion) ---- */
const TRIAGE_CRITICAL_KW = ['cardiac arrest', 'not breathing', 'unconscious', 'unresponsive',
  'stemi', 'heart attack', 'stroke', 'severe bleeding', 'gunshot', 'stab wound', 'seizure',
  'anaphyla', 'choking', 'drowning', 'severe trauma', 'multiple injuries', 'no pulse', 'collapsed'];
const TRIAGE_URGENT_KW = ['chest pain', 'breathless', 'shortness of breath', 'fracture',
  'high fever', 'dehydration', 'labor', 'labour', 'pregnan', 'burns', 'allergic reaction',
  'fall', 'accident', 'rta', 'road traffic', 'head injury', 'bleeding'];
const TRIAGE_DEPT_KW = {
  'Cardiac ICU': ['chest pain', 'heart', 'cardiac', 'stemi', 'palpitation'],
  'Neurosurgery': ['head trauma', 'head injury', 'stroke', 'seizure', 'neuro', 'brain', 'spinal'],
  'Trauma': ['accident', 'rta', 'road traffic', 'fracture', 'gunshot', 'stab', 'trauma', 'fall'],
  'Obstetric ICU': ['labor', 'labour', 'pregnan', 'delivery', 'obstetric'],
  'Nephrology': ['dialysis', 'kidney', 'renal'],
  'Pediatric': ['child', 'infant', 'newborn', 'toddler'],
  'Burns Unit': ['burn', 'scald'],
};
const TRIAGE_TAG_KW = {
  'Ventilator': ['not breathing', 'breathless', 'respiratory', 'ventilat', 'shortness of breath'],
  'Defibrillator': ['cardiac arrest', 'heart attack', 'stemi', 'arrhythmia', 'no pulse'],
  'Blood Onboard': ['bleeding', 'hemorrhage', 'haemorrhage', 'blood loss', 'stab', 'gunshot'],
  'Incubator': ['infant', 'newborn', 'premature', 'preterm'],
  'Isolation': ['infectious', 'contagious', 'isolation'],
  'Spinal Board': ['spinal', 'head trauma', 'fall from height', 'rta'],
  'Bariatric': ['obese', 'bariatric'],
};

function localHeuristicTriage(notes) {
  const t = notes.toLowerCase();
  let priority = 'priority';
  if (TRIAGE_CRITICAL_KW.some(k => t.includes(k))) priority = 'critical';
  else if (TRIAGE_URGENT_KW.some(k => t.includes(k))) priority = 'urgent';
  let dept = 'Emergency';
  for (const [name, kws] of Object.entries(TRIAGE_DEPT_KW)) {
    if (kws.some(k => t.includes(k))) { dept = name; break; }
  }
  const tags = Object.entries(TRIAGE_TAG_KW).filter(([, kws]) => kws.some(k => t.includes(k))).map(([tag]) => tag);
  const m = t.match(/(\d{1,3})\s*(?:yo\b|y\/o\b|years?\b|yrs?\b)/i);
  const age = m ? parseInt(m[1], 10) : null;
  return { priority, dept, tags: tags.slice(0, 3), age,
    reasoning: 'Offline keyword heuristic (demo mode — no live server).', mode: 'heuristic' };
}

async function runAiTriage() {
  const notes = $('fClinicalNotes').value.trim();
  const status = $('aiTriageStatus'), result = $('aiTriageResult'), btn = $('aiTriageBtn');
  if (!notes) { status.textContent = 'Enter symptoms/notes first.'; status.className = 'ai-triage-status warn'; return; }
  btn.disabled = true;
  status.textContent = 'Thinking…'; status.className = 'ai-triage-status';
  result.hidden = true;
  let r;
  try {
    if (App.mode === 'live') r = await api('/api/triage', { method: 'POST', body: JSON.stringify({ notes }) });
    else r = localHeuristicTriage(notes);
  } catch (e) {
    r = localHeuristicTriage(notes);
    r.reasoning = 'AI triage unavailable — used offline heuristic fallback.';
    r.mode = 'heuristic-fallback';
  }
  btn.disabled = false;
  setSelectedPrio(r.priority);
  if (r.dept) $('fDept').value = r.dept;
  if (r.age && !$('fAge').value.trim()) $('fAge').value = r.age;
  if (!$('fReason').value.trim()) $('fReason').value = notes.slice(0, 120);
  (r.tags || []).forEach(tag => {
    App.selectedTags.add(tag);
    const chip = document.querySelector(`#tagWrap .tagchip[data-tag="${tag}"]`);
    if (chip) chip.classList.add('on');
  });
  const modeIcon = r.mode === 'ai' ? icon('bot','ic ic-sm')
    : r.mode === 'heuristic-fallback' ? icon('alertTriangle','ic ic-sm ic-urgent')
    : icon('calculator','ic ic-sm');
  const modeLabel = r.mode === 'ai' ? 'AI suggestion (Claude)'
    : r.mode === 'heuristic-fallback' ? 'Heuristic fallback (AI unavailable)'
    : 'Offline heuristic (demo mode)';
  status.textContent = '';
  result.hidden = false;
  result.innerHTML = `<strong>${modeIcon} ${esc(modeLabel)}</strong><br>${esc(r.reasoning || '')}`;
}

async function fetchSuggestions() {
  const dept = $('fDept').value.trim();
  const origin = $('fOrigin').value.trim();
  if (!origin || !dept) { $('destSuggest').hidden = true; return; }
  let list = [];
  try {
    if (App.mode === 'live') {
      const r = await api(`/api/recommend?dept=${encodeURIComponent(dept)}&origin=${encodeURIComponent(origin)}`);
      list = r.suggestions || [];
    } else list = localRecommend(dept, origin);
  } catch (e) { list = localRecommend(dept, origin); }
  const box = $('destSuggest');
  if (!list.length) { box.hidden = true; return; }
  box.innerHTML = list.map(s => `
    <button type="button" class="sugg-chip" data-dest="${esc(s.name)}">
      <strong>${esc(s.name)}</strong> · ${s.score} pts · ${s.distance_km} km
      <span class="sg-reason">${esc((s.reasons || []).join(' · '))}</span>
    </button>`).join('');
  box.hidden = false;
}

async function fetchPredict() {
  const origin = $('fOrigin').value.trim(), dest = $('fDest').value.trim();
  const ph = $('predictHint');
  if (!ph || !origin || !dest) { if (ph) ph.innerHTML = ''; return; }
  try {
    if (App.mode === 'live') {
      const r = await api(`/api/predict?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(dest)}&priority=${selectedPrio}`);
      ph.innerHTML = r.minutes != null
        ? `<span style="color:var(--info);font-size:11.5px;">${icon('barChart','ic ic-sm')} Historical avg for this route: <b>${r.minutes} min</b> (${r.samples} sample${r.samples === 1 ? '' : 's'})</span>`
        : '';
    }
  } catch (e) { ph.innerHTML = ''; }
}

function debounceSuggest() {
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(() => { fetchSuggestions(); fetchPredict(); }, 450);
}

/* ================= hospital directory modal ================= */
const HOSP_REGIONS = ['All', 'South', 'Central', 'Western', 'Eastern', 'Navi Mumbai', 'Thane', 'Govt', 'Private'];
let hospActiveFilter = 'All';

function renderHospitals() {
  const q = ($('hospSearch').value || '').trim().toLowerCase();
  let list = App.state.hospitals || [];
  if (hospActiveFilter === 'Govt' || hospActiveFilter === 'Private') {
    list = list.filter(h => h.type === hospActiveFilter);
  } else if (hospActiveFilter !== 'All') {
    list = list.filter(h => h.region === hospActiveFilter);
  }
  if (q) list = list.filter(h => h.name.toLowerCase().includes(q) || h.area.toLowerCase().includes(q));
  $('hospCount').textContent = `${list.length} of ${(App.state.hospitals || []).length} hospitals`;
  $('hospListEl').innerHTML = list.length ? list.map(h => `
    <div class="hosp-row">
      <div>
        <div class="hosp-name">${esc(h.name)}</div>
        <div class="hosp-area">${esc(h.area)} · ${esc(h.region)}</div>
        <div class="hosp-beds"><span class="${h.icuBeds <= 1 ? 'crit' : ''}">ICU ${h.icuBeds}</span> · <span>Gen ${h.genBeds}</span></div>
        <div class="hosp-area">${h.verified ? '✓ Verified' : '⚠ Simulated / unverified'} · ${esc(h.source || 'Unknown source')}</div>
      </div>
      <span class="hosp-tag ${esc(h.type)}">${esc(h.type)}</span>
    </div>`).join('') : '<div class="empty">No hospitals match that search.</div>';
}

function openHospModal() {
  $('hospSearch').value = '';
  hospActiveFilter = 'All';
  [...$('hospFilters').children].forEach(ch => {
    const on = ch.dataset.r === 'All';
    ch.classList.toggle('on', on);
    ch.setAttribute('aria-pressed', on);
  });
  renderHospitals();
  $('hospOverlay').classList.add('show');
}

function openContactsModal() {
  const cats = App.state.contacts || CONTACTS_SEED;
  $('contactsBody').innerHTML = cats.map(cat => `
    <div class="contact-cat">
      <h4>${esc(cat.cat)}</h4>
      ${cat.items.map(it => `<div class="contact-row"><span>${esc(it.n)}</span><span class="cn">${esc(it.v)}</span></div>`).join('')}
    </div>`).join('') +
    '<div style="font-size:11px;color:var(--dimmer);margin-top:4px;">Verify current numbers before relying on them operationally.</div>';
  $('contactsOverlay').classList.add('show');
}

/* ================= pulse ================= */
let pulsePhase = 0, pulseStarted = false;

function highestPriority() {
  const active = activeCases();
  if (active.some(c => c.priority === 'critical')) return 'critical';
  if (active.some(c => c.priority === 'urgent')) return 'urgent';
  if (active.some(c => c.priority === 'priority')) return 'priority';
  return null;
}

function updatePulseStatic() {
  const p = highestPriority();
  $('pulsePriorityLabel').textContent = p ? PRIO[p].label : 'None';
  $('pulseRate').textContent = p === 'critical' ? '138 bpm' : p === 'urgent' ? '96 bpm' : p === 'priority' ? '78 bpm' : '—';
  $('pulseRev').textContent = App.state.rev || 0;
  $('pulsePath').style.stroke =
    p === 'critical' ? 'var(--critical)' :
    p === 'urgent' ? 'var(--urgent)' :
    p === 'priority' ? 'var(--priority)' : 'var(--dimmer)';
}

function drawPulse() {
  const path = $('pulsePath');
  const w = 1200, h = 64, mid = h / 2;
  const speed = highestPriority() === 'critical' ? 3.2 : highestPriority() === 'urgent' ? 2 : 1.2;
  const spikeH = highestPriority() === 'critical' ? 26 : 16;
  pulsePhase += speed;
  let d = `M0,${mid}`;
  const segW = 60;
  for (let x = 0; x <= w; x += segW) {
    const off = (x + pulsePhase) % segW;
    if (off < segW * 0.6) {
      d += ` L${x + off},${mid}`;
    } else {
      const t = (off - segW * 0.6) / (segW * 0.4);
      const spike = Math.sin(t * Math.PI) * (t < 0.5 ? -spikeH : spikeH * 0.5);
      d += ` L${x + off},${mid - spike}`;
    }
  }
  path.setAttribute('d', d);
  requestAnimationFrame(drawPulse);
}

/* ================= event wiring ================= */
function bindUI() {
  // login
  $('loginResponder').onclick = () => enterApp('responder', $('loginIdInput').value);
  $('loginCommand').onclick = () => enterApp('command', $('loginIdInput').value);
  document.querySelectorAll('.login-mini[data-role]').forEach(b => {
    b.onclick = () => enterApp(b.dataset.role, $('loginIdInput').value);
  });
  $('logoutBtn').onclick = doLogout;

  // hero tools
  $('soundBtn').onclick = () => {
    App.soundOn = !App.soundOn;
    localStorage.setItem('lifeline_sound', App.soundOn ? 'on' : 'off');
    $('soundBtn').innerHTML = App.soundOn ? ICONS.bell : ICONS.bellOff;
    $('soundBtn').classList.toggle('on', App.soundOn);
    if (App.soundOn) beep('info');
  };
  $('soundBtn').innerHTML = App.soundOn ? ICONS.bell : ICONS.bellOff;
  $('soundBtn').classList.toggle('on', App.soundOn);
  $('kbdBtn').onclick = () => $('helpOverlay').classList.add('show');
  $('helpClose').onclick = () => $('helpOverlay').classList.remove('show');

  // v3 hero tools
  if (App.voiceOn) { $('voiceBtn').classList.add('on'); }
  else { $('voiceBtn').classList.remove('on'); $('voiceBtn').style.opacity = '.45'; }
  $('voiceBtn').onclick = () => {
    App.voiceOn = !App.voiceOn;
    localStorage.setItem('lifeline_voice', App.voiceOn ? 'on' : 'off');
    $('voiceBtn').classList.toggle('on', App.voiceOn);
    $('voiceBtn').style.opacity = App.voiceOn ? '' : '.45';
    if (App.voiceOn) speak('Voice announcements on');
    else if ('speechSynthesis' in window) speechSynthesis.cancel();
  };
  const savedTheme = localStorage.getItem('lifeline_theme');
  if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  $('themeBtn').onclick = () => {
    const el = document.documentElement;
    const light = el.getAttribute('data-theme') === 'light';
    if (light) { el.removeAttribute('data-theme'); localStorage.setItem('lifeline_theme', 'dark'); }
    else { el.setAttribute('data-theme', 'light'); localStorage.setItem('lifeline_theme', 'light'); }
  };
  $('langSel').value = App.lang;
  $('langSel').onchange = () => {
    App.lang = $('langSel').value;
    localStorage.setItem('lifeline_lang', App.lang);
    applyLang(); renderAll();
  };
  $('mapBtn').onclick = toggleMap;
  $('mapClose').onclick = toggleMap;

  // modal: suggest + predict + tags
  ['fOrigin', 'fDept', 'fDest'].forEach(id => {
    $(id).addEventListener('input', debounceSuggest);
  });
  $('destSuggest').addEventListener('click', e => {
    const chip = e.target.closest('.sugg-chip');
    if (!chip) return;
    $('fDest').value = chip.dataset.dest;
    $('destSuggest').hidden = true;
    clearFieldError('fDest', 'errDest');
    updateDestBedHint();
    fetchPredict();
  });
  const etaField = $('fEta').closest('.field');
  const ph = document.createElement('div');
  ph.id = 'predictHint'; ph.style.marginTop = '4px';
  etaField.appendChild(ph);
  $('tagWrap').addEventListener('click', e => {
    const chip = e.target.closest('.tagchip');
    if (!chip) return;
    const tag = chip.dataset.tag;
    if (App.selectedTags.has(tag)) { App.selectedTags.delete(tag); chip.classList.remove('on'); }
    else { App.selectedTags.add(tag); chip.classList.add('on'); }
  });

  // new-case modal
  document.querySelectorAll('.prio-opt').forEach(el => {
    el.setAttribute('aria-pressed', 'false');
    el.onclick = () => setSelectedPrio(el.dataset.p);
  });
  setSelectedPrio('critical');
  $('modalClose').onclick = closeModal;
  $('modalCancel').onclick = closeModal;
  $('aiTriageBtn').onclick = runAiTriage;
  initMicButton();
  $('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeModal(); });
  $('fDest').addEventListener('input', updateDestBedHint);
  $('fOrigin').addEventListener('input', () => clearFieldError('fOrigin', 'errOrigin'));
  $('fDest').addEventListener('input', () => clearFieldError('fDest', 'errDest'));
  $('fEta').addEventListener('input', () => clearFieldError('fEta', 'errEta'));
  $('modalSubmit').onclick = () => {
    if (!validateModalForm()) return;
    doCreate({
      priority: selectedPrio,
      origin: $('fOrigin').value.trim(),
      dest: $('fDest').value.trim(),
      age: $('fAge').value.trim(),
      dept: $('fDept').value.trim(),
      amb: $('fAmb').value.trim(),
      eta: parseInt($('fEta').value, 10),
      reason: $('fReason').value.trim(),
      tags: [...App.selectedTags],
      incident_id: $('fIncident') ? $('fIncident').value : '',
    });
  };

  // detail panel
  $('detailOverlay').onclick = closeDetail;
  detailPanel().addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const id = act.dataset.id;
    if (act.dataset.act === 'note-send') {
      const inp = $('noteInput');
      doNote(id, inp ? inp.value : '');
    } else if (act.dataset.act === 'export') {
      exportCase(id);
    } else if (act.dataset.act === 'cancel') {
      const reason = prompt('Reason for cancelling case ' + id + ' (optional):');
      if (reason === null) return;
      doCancel(id, reason);
    } else if (act.dataset.act === 'advance') {
      doAdvance(id);
    } else if (act.dataset.act === 'claim') {
      doClaim(id);
    } else if (act.dataset.act === 'dispatch') {
      const sel = $('dispatchSel');
      doDispatch(id, sel ? sel.value : '');
    } else if (act.dataset.act === 'flag') {
      doFlag(id);
    } else if (act.dataset.act === 'escalate') {
      doEscalate(id);
    } else if (act.dataset.act === 'print-sheet') {
      printHandoverSheet(id);
    }
  });
  detailPanel().addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target && e.target.id === 'noteInput') {
      const act = detailPanel().querySelector('[data-act="note-send"]');
      if (act) doNote(act.dataset.id, e.target.value);
    }
  });
  detailPanel().addEventListener('change', e => {
    if (e.target && e.target.dataset.act === 'handover') {
      doHandover(e.target.dataset.id, e.target.dataset.item, e.target.checked);
      return;
    }
    if (e.target && e.target.id === 'dispatchSel' && e.target.value) {
      e.target.dataset.selected = e.target.value;
    }
  });

  // dash delegation
  $('dashRoot').addEventListener('click', e => {
    const nb = e.target.closest('#newCaseBtn');
    if (nb) { openModal(); return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      const id = act.dataset.id;
      if (act.dataset.act === 'detail') openDetail(id);
      else if (act.dataset.act === 'advance') doAdvance(id);
      else if (act.dataset.act === 'claim') doClaim(id);
      else if (act.dataset.act === 'dispatch') { const sel = $('dispatchSel'); doDispatch(id, sel ? sel.value : ''); }
      else if (act.dataset.act === 'flag') doFlag(id);
      else if (act.dataset.act === 'inc-declare') doDeclareIncident();
      else if (act.dataset.act === 'inc-close') doCloseIncident(id);
      else if (act.dataset.act === 'csv-export') doExportCSV();
      else if (act.dataset.act === 'sitrep-run') runSituationReport();
      return;
    }
    const fp = e.target.closest('.fchip');
    if (fp) {
      const k = fp.dataset.fp;
      App.filters.prio = (k !== 'all' && App.filters.prio === k) ? 'all' : k;
      document.querySelectorAll('#dashRoot .fchip').forEach(c =>
        c.classList.toggle('on', c.dataset.fp === App.filters.prio));
      renderCmdResults();
      return;
    }
    const card = e.target.closest('.case-card');
    if (card) openDetail(card.dataset.id);
  });
  $('dashRoot').addEventListener('change', e => {
    if (e.target.id === 'attSelect') { App.attCaseId = e.target.value; renderAll(); }
    if (e.target.id === 'sortSel') { App.filters.sort = e.target.value; renderCmdResults(); }
  });
  $('dashRoot').addEventListener('input', e => {
    if (e.target.id === 'cmdSearch') {
      App.filters.q = e.target.value;
      renderCmdResults();
    }
  });
  $('dashRoot').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('case-card')) {
      e.preventDefault();
      openDetail(e.target.dataset.id);
    }
  });

  // fabs + directory modal
  $('contactsFab').onclick = openContactsModal;
  $('contactsClose').onclick = () => $('contactsOverlay').classList.remove('show');
  $('contactsOverlay').addEventListener('click', e => { if (e.target === $('contactsOverlay')) $('contactsOverlay').classList.remove('show'); });
  $('hospFab').onclick = openHospModal;
  $('hospClose').onclick = () => $('hospOverlay').classList.remove('show');
  $('hospOverlay').addEventListener('click', e => { if (e.target === $('hospOverlay')) $('hospOverlay').classList.remove('show'); });
  $('hospFilters').innerHTML = HOSP_REGIONS.map(r =>
    `<button type="button" class="hosp-chip${r === 'All' ? ' on' : ''}" data-r="${r}" aria-pressed="${r === 'All'}">${r}</button>`).join('');
  $('hospFilters').addEventListener('click', e => {
    const b = e.target.closest('.hosp-chip');
    if (!b) return;
    hospActiveFilter = b.dataset.r;
    [...$('hospFilters').children].forEach(ch => {
      const on = ch === b;
      ch.classList.toggle('on', on);
      ch.setAttribute('aria-pressed', on);
    });
    renderHospitals();
  });
  $('hospSearch').addEventListener('input', renderHospitals);

  // keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['helpOverlay', 'modalOverlay', 'hospOverlay', 'contactsOverlay'].forEach(id => $(id).classList.remove('show'));
      closeModal();
      if (App.mapOpen) toggleMap();
      if (detailPanel().classList.contains('show')) closeDetail();
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'n' || e.key === 'N') {
      if (App.role && canDo('create')) { e.preventDefault(); openModal(); }
    } else if (e.key === '/') {
      const s = $('cmdSearch');
      if (s) { e.preventDefault(); s.focus(); }
    } else if (e.key === '?') {
      $('helpOverlay').classList.toggle('show');
    } else if (e.key === 'm' || e.key === 'M') {
      toggleMap();
    } else if (e.key === 't' || e.key === 'T') {
      $('themeBtn').click();
    } else if (e.key === 'v' || e.key === 'V') {
      $('voiceBtn').click();
    }
  });

  // clock
  setInterval(() => {
    const d = new Date();
    $('brandClock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }, 1000);
}

/* ================= v3 actions ================= */
function doHandover(id, item, done) {
  if (App.mode === 'live') {
    api(`/api/cases/${id}/handover`, {
      method: 'POST', body: JSON.stringify({ item, done }),
    }).then(() => refresh())
      .catch(e => toast('Handover failed', e.message, 'info'));
  } else {
    const c = App.state.cases.find(x => x.id === id);
    if (!c) return;
    c.handover = c.handover || {};
    c.handover[item] = { done: !!done, by: actorLabel(),
      ts: done ? new Date().toISOString() : null };
    const items = App.state.checklist || CHECKLIST.map(([k, label]) => ({ k, label }));
    if (items.every(it => c.handover[it.k] && c.handover[it.k].done)) {
      offAudit(id, `Handover checklist complete (POD) by ${actorLabel()}`);
      toast('POD complete', `${id}: all handover items checked.`, 'ok');
    }
    afterMutation();
  }
}

function printHandoverSheet(id) {
  const c = App.state.cases.find(x => x.id === id);
  if (!c) return;
  const hv = c.handover || {};
  const items = (App.state.checklist || CHECKLIST.map(([k, label]) => ({ k, label })));
  const w = window.open('', '_blank');
  if (!w) { toast('Popup blocked', 'Allow popups to print the sheet.', 'info'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(c.id)} — Handover Sheet</title>
    <style>body{font-family:Arial,sans-serif;margin:36px;color:#111;}
    h1{font-size:20px;border-bottom:3px solid #d92121;padding-bottom:8px;}
    table{border-collapse:collapse;width:100%;margin-top:14px;}
    td,th{border:1px solid #999;padding:7px 10px;font-size:13px;text-align:left;}
    .ok{color:#0b8a6b;font-weight:bold;} .pend{color:#c46a00;}
    @media print{button{display:none;}}</style></head><body>
    <h1>LIFE-LINE — Patient Handover Sheet (POD)</h1>
    <table>
      <tr><th>Case ID</th><td>${esc(c.id)}</td><th>Priority</th><td>${esc(PRIO[c.priority].label)}</td></tr>
      <tr><th>Route</th><td colspan="3">${esc(c.origin)} → ${esc(c.dest)}</td></tr>
      <tr><th>Department</th><td>${esc(c.dept)}</td><th>Patient age</th><td>${esc(c.age)}</td></tr>
      <tr><th>Unit</th><td>${esc(c.assigned_unit || c.amb || '—')}</td><th>Printed</th><td>${new Date().toLocaleString()}</td></tr>
    </table>
    <h3 style="margin-top:22px;">Checklist</h3>
    <table>
      ${items.map(it => {
        const st = hv[it.k];
        return `<tr><td>${esc(it.label)}</td>
          <td class="${st && st.done ? 'ok' : 'pend'}">${st && st.done ? 'DONE · ' + esc(st.by || '') : 'PENDING'}</td></tr>`;
      }).join('')}
    </table>
    <p style="margin-top:26px;font-size:12px;">Sending signature: ______________________ &nbsp;&nbsp;
       Receiving signature: ______________________</p>
    <button onclick="window.print()">Print</button>
    </body></html>`);
  w.document.close();
}

async function doDeclareIncident() {
  const name = ($('incName') && $('incName').value.trim()) || '';
  const loc = ($('incLoc') && $('incLoc').value.trim()) || '';
  if (!name) { toast('Name required', 'Give the incident a short name.', 'info'); return; }
  if (App.mode === 'live') {
    try {
      await api('/api/incidents', { method: 'POST', body: JSON.stringify({ name, location: loc }) });
      toast('MCI declared', `${name} — link new cases to it in the transfer form.`, 'ok');
      await refresh();
    } catch (e) { toast('Could not declare', e.message, 'info'); }
  } else {
    const st = App.state;
    st.incidents = st.incidents || [];
    const n = st.incidents.length + 1;
    st.incidents.unshift({ id: `MCI-${String(n).padStart(3, '0')}`, name,
      location: loc, opened_ts: new Date().toISOString(), closed_ts: null });
    offAudit('SYSTEM', `MCI declared: MCI-${String(n).padStart(3, '0')} · ${name}`);
    offNotify('radio', `MCI declared: ${name} @ ${loc}`, null);
    toast('MCI declared', `${name} — offline demo.`, 'ok');
    afterMutation();
  }
}

async function doCloseIncident(iid) {
  if (App.mode === 'live') {
    try {
      await api(`/api/incidents/${iid}/close`, { method: 'POST', body: '{}' });
      toast('Incident closed', iid, 'info');
      await refresh();
    } catch (e) { toast('Could not close', e.message, 'info'); }
  } else {
    const inc = (App.state.incidents || []).find(i => i.id === iid);
    if (inc) { inc.closed_ts = new Date().toISOString(); offAudit('SYSTEM', `MCI closed: ${iid}`); }
    toast('Incident closed', iid, 'info');
    afterMutation();
  }
}

function doExportCSV() {
  if (App.mode === 'live' && App.token) {
    window.open(`/api/report.csv?token=${encodeURIComponent(App.token)}`);
    return;
  }
  const rows = [['case_id', 'priority', 'status', 'origin', 'dest', 'dept',
    'age', 'unit', 'created_at', 'duration_min']];
  (App.state.cases || []).forEach(c => rows.push([
    c.id, c.priority, STATUS[c.status], c.origin, c.dest, c.dept, c.age,
    c.assigned_unit || c.amb || '', c.created_at,
    c.status === 3 ? minsAgo(c.created_at) : '',
  ]));
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'lifeline-report.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ================= live operations map ================= */
const PRIO_COLOR = { critical: '#FF3B3B', urgent: '#FF9F3B', priority: '#2ED9A8' };

function toggleMap() {
  const ov = $('mapOverlay');
  App.mapOpen = !App.mapOpen;
  ov.hidden = !App.mapOpen;
  if (App.mapOpen) {
    setTimeout(() => {
      initMap();
      if (App.map) { App.map.invalidateSize(); App.map.setView(CITY_CENTER, 11); }
      updateMap();
    }, 60);
  }
}

function initMap() {
  if (App.map || typeof L === 'undefined') return;
  App.map = L.map('mapEl', { zoomControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; OpenStreetMap contributors',
  }).addTo(App.map);
  App.mapLayers = L.layerGroup().addTo(App.map);
  App.map.setView(CITY_CENTER, 11);
}

function bedColor(h) {
  return h.icuBeds > 4 ? '#22c55e' : h.icuBeds > 0 ? '#f59e0b' : '#ef4444';
}

function updateMap() {
  if (!App.map || !App.state) return;
  const layers = App.mapLayers;
  layers.clearLayers();
  let unitsInTransit = 0;

  (App.state.hospitals || []).forEach(h => {
    const c = areaCoords(h.area);
    L.circleMarker(c, {
      radius: 8, color: bedColor(h), weight: 2, fillOpacity: 0.55,
    }).bindPopup(`<b>${esc(h.name)}</b><br>${esc(h.area)}<br>ICU ${h.icuBeds} · Gen ${h.genBeds}`)
      .addTo(layers);
  });

  activeCases().forEach(cse => {
    const o = [cse.o_lat || CITY_CENTER[0], cse.o_lng || CITY_CENTER[1]];
    const d = [cse.d_lat || CITY_CENTER[0], cse.d_lng || CITY_CENTER[1]];
    const col = PRIO_COLOR[cse.priority] || '#4C8DFF';
    L.polyline([o, d], { color: col, weight: 2.5, dashArray: '7 7', opacity: 0.85 })
      .bindPopup(`${esc(cse.id)} · ${esc(PRIO[cse.priority].label)}<br>${esc(cse.origin)} → ${esc(cse.dest)}`)
      .addTo(layers);

    if (cse.assigned_unit && cse.status >= 0 && cse.status < 3) {
      unitsInTransit++;
      const elapsed = minsAgo(cse.created_at);
      const frac = Math.min(0.95, Math.max(0.05,
        elapsed / Math.max(1, elapsed + dispEta(cse))));
      const pos = [o[0] + (d[0] - o[0]) * frac, o[1] + (d[1] - o[1]) * frac];
      L.marker(pos, {
        icon: L.divIcon({ className: '', html: `<div class="amb-dot">${ICONS.ambulance}</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15] }),
      }).bindPopup(`${ICONS.ambulance} ${esc(cse.assigned_unit)} · ${esc(cse.id)}<br>Status: ${STATUS[cse.status]} · ETA ${dispEta(cse)} min`)
        .addTo(layers);
    }
  });

  $('mapFoot').textContent =
    `${(App.state.hospitals || []).length} hospitals · ${activeCases().length} active transfers · ${unitsInTransit} unit(s) in transit`;
}

/* ================= init ================= */
boot();
