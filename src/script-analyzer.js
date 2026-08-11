(function initScriptAnalyzer(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MilimScriptAnalyzer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const CEFR_RANK = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  const LEVELS = Object.keys(CEFR_RANK);

  const STOP_WORDS = new Set((
    'a an the and or but if then than so because as of to in on at by for from with about into over after before between through during without within ' +
    'i you he she it we they me him her us them my your his their our this that these those who whom whose which what when where why how ' +
    'am is are was were be been being do does did done have has had having will would can could may might must should shall ' +
    'not no yes there here very just really also too only more most some any all each every either neither both another such ' +
    'one two first second new old good bad big small time day year people thing things way get got go going make made take come'
  ).split(/\s+/));

  const LEVEL_WORDS = {
    A1: new Set((
      'able again always answer ask back best better bring brother business buy call change child children city class close company country ' +
      'day different early easy eat enough example family father feel find food friend give group hand happy help home house important job keep ' +
      'kind know language large last late learn life like little live long look lot love many money month mother move much name need never night ' +
      'number often other part place play point problem public question read right room school see show side start state still student study system ' +
      'talk tell think try understand use want water week work world write young'
    ).split(/\s+/)),
    A2: new Set((
      'accept achieve actually advice afford agree allow alone already although amount appear apply arrive avoid behave belong borrow choice choose ' +
      'communicate compare complain complete condition continue decide describe develop difference difficult discuss education environment experience ' +
      'explain famous favorite follow future happen health improve include information interest introduce invite journey leave local manage mean notice ' +
      'offer order organize perhaps plan possible prefer prepare probably promise protect receive remember report return save share similar spend suggest ' +
      'reach support travel usual visit weather worry'
    ).split(/\s+/)),
    B1: new Set((
      'advantage affect announce apologize argument arrange attitude audience avoid challenge circumstance concentrate confident consequence consider ' +
      'contact contribute convenient culture decrease demand despite encourage energy establish event evidence familiar feature foreign generation ' +
      'government independent influence issue knowledge likely maintain method opportunity opinion ordinary particular perform population prevent ' +
      'produce purpose realize recommend reduce relationship require research responsibility result risk role situation solution specific succeed ' +
      'suitable technology tradition treatment value variety'
    ).split(/\s+/)),
    B2: new Set((
      'accurate acquire adapt adequate alternative analyze approach assume awareness benefit capacity complex concept conduct confirm considerable ' +
      'consistent controversial convince crucial decline demonstrate distinguish efficient emphasize ensure evaluate evident factor impact imply ' +
      'interpret involve maintain negotiate objective perspective potential priority proposal relevant reliable require significant strategy ' +
      'substantial tendency transform valid withdraw'
    ).split(/\s+/)),
    C1: new Set((
      'acknowledge advocate ambiguous anticipate arbitrary coherent compelling comprehensive consensus contradict conventional discrepancy ' +
      'elaborate empirical enhance ethical explicit facilitate feasible framework inherent insight integral justify legitimate manipulate ' +
      'nevertheless notion paradigm preliminary profound reinforce reluctant scrutinize sophisticated subordinate subsequent substantial ' +
      'unanimous undermine unprecedented viable'
    ).split(/\s+/)),
    C2: new Set((
      'abstruse anachronistic capricious circumspect conundrum deleterious dichotomy equivocal esoteric fastidious idiosyncratic ineffable ' +
      'intransigent meticulous obfuscate ostensible paradoxical perfunctory quintessential recalcitrant ubiquitous unequivocal'
    ).split(/\s+/))
  };

  const BASE_WORDS = new Set(Object.values(LEVEL_WORDS).flatMap((set) => [...set]));
  const IRREGULAR = new Map(Object.entries({
    am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
    began: 'begin', begun: 'begin', brought: 'bring', bought: 'buy', came: 'come', chose: 'choose', chosen: 'choose',
    did: 'do', done: 'do', felt: 'feel', found: 'find', gave: 'give', given: 'give', gone: 'go', went: 'go',
    got: 'get', gotten: 'get', had: 'have', knew: 'know', known: 'know', left: 'leave', made: 'make', meant: 'mean',
    ran: 'run', read: 'read', said: 'say', saw: 'see', seen: 'see', spoke: 'speak', spoken: 'speak', spent: 'spend',
    took: 'take', taken: 'take', thought: 'think', told: 'tell', wrote: 'write', written: 'write'
  }));

  const PHRASES = [
    'come up with', 'deal with', 'take advantage of', 'as a result', 'in terms of', 'be likely to', 'used to', 'get used to', 'look forward to',
    'make sure', 'figure out', 'point out', 'carry out', 'put up with', 'run out of', 'end up', 'turn out', 'set up', 'break down', 'bring up',
    'come across', 'keep up with', 'on the other hand', 'for instance', 'in addition', 'due to', 'according to', 'rather than', 'instead of',
    'take into account', 'in spite of', 'with regard to', 'by contrast', 'as opposed to', 'stem from', 'lead to', 'result in', 'account for'
  ];
  const POS_OVERRIDES = new Map();
  'advantage argument audience capacity challenge choice committee concept consensus consequence context culture difference education environment evidence experience factor feature framework government impact information interest issue knowledge method notion objection opportunity opinion perspective population proposal purpose research responsibility result risk role situation solution strategy system technology tendency treatment value variety'.split(' ').forEach((word) => POS_OVERRIDES.set(word, 'noun'));
  'accept acquire adapt analyze apply assume contribute convince demonstrate develop distinguish encourage ensure evaluate explain facilitate improve influence interpret involve justify maintain manage negotiate perform prevent produce protect reach recommend reduce require scrutinize suggest support transform undermine withdraw'.split(' ').forEach((word) => POS_OVERRIDES.set(word, 'verb'));
  'accurate adequate ambiguous arbitrary coherent compelling complex consistent controversial convenient crucial efficient empirical ethical evident explicit familiar feasible independent inherent legitimate ordinary particular potential preliminary profound relevant reliable reluctant significant similar sophisticated specific substantial suitable unanimous unprecedented valid viable'.split(' ').forEach((word) => POS_OVERRIDES.set(word, 'adjective'));

  function normalize(value) {
    return String(value || '').trim().replace(/[’]/g, "'").replace(/\s+/g, ' ').toLocaleLowerCase('en');
  }

  function cleanTranscript(value) {
    return String(value || '')
      .replace(/^\s*WEBVTT[^\n]*$/gim, ' ')
      .replace(/\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?\s*(?:-->|–>|—>)\s*\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^\s*\d+\s*$/gm, ' ')
      .replace(/^\s*(?:NOTE|STYLE|REGION)\b[^\n]*$/gim, ' ')
      .replace(/\[(?:music|applause|laughter|noise|silence)[^\]]*\]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function lemmaCandidates(token) {
    const word = normalize(token).replace(/^'+|'+$/g, '');
    const values = [];
    const push = (candidate) => { if (candidate && candidate.length > 1 && !values.includes(candidate)) values.push(candidate); };
    push(IRREGULAR.get(word));
    if (word.endsWith('ies') && word.length > 4) push(`${word.slice(0, -3)}y`);
    if (word.endsWith('ied') && word.length > 4) push(`${word.slice(0, -3)}y`);
    if (word.endsWith('ized') && word.length > 6) push(`${word.slice(0, -1)}`);
    if (word.endsWith('ised') && word.length > 6) push(`${word.slice(0, -1)}`);
    if (word.endsWith('ing') && word.length > 5) {
      const stem = word.slice(0, -3);
      push(stem);
      push(`${stem}e`);
      if (/(.)\1$/.test(stem)) push(stem.slice(0, -1));
    }
    if (word.endsWith('ed') && word.length > 4) {
      const stem = word.slice(0, -2);
      push(stem);
      push(`${stem}e`);
      if (/(.)\1$/.test(stem)) push(stem.slice(0, -1));
    }
    if (word.endsWith('es') && word.length > 4) {
      push(word.slice(0, -2));
      push(word.slice(0, -1));
    }
    if (word.endsWith('s') && word.length > 3 && !/(ss|us|is|ous)$/.test(word)) push(word.slice(0, -1));
    push(word);
    return values;
  }

  function lemma(token, extraBaseWords = new Set()) {
    const original = normalize(token);
    const trusted = new Set([...BASE_WORDS, ...extraBaseWords]);
    return lemmaCandidates(original).find((candidate) => trusted.has(candidate)) || original;
  }

  function levelFor(term) {
    const normalized = normalize(term);
    if (normalized.includes(' ')) return normalized.split(' ').length >= 3 ? 'B2' : 'B1';
    for (const level of LEVELS) if (LEVEL_WORDS[level].has(normalized)) return level;
    if (STOP_WORDS.has(normalized) || normalized.length <= 4) return 'A1';
    if (/(tion|sion|ment|ance|ence|ity|ship|ous|ive|ial|ary|ize|ise|ify)$/.test(normalized) || normalized.length >= 10) return 'B2';
    if (normalized.length >= 7) return 'B1';
    return 'A2';
  }

  function guessPartOfSpeech(term, context = '') {
    const word = normalize(term);
    if (word.includes(' ')) return PHRASES.includes(word) || /\b(up|out|off|on|over|away|back|through|with|into)$/.test(word) ? 'phrasal-verb' : 'phrase';
    if (POS_OVERRIDES.has(word)) return POS_OVERRIDES.get(word);
    if (/ly$/.test(word)) return 'adverb';
    if (/(tion|sion|ment|ness|ity|ance|ence|ship|ism|ist)$/.test(word)) return 'noun';
    if (/(ous|ful|less|ive|al|ic|able|ible|ary|ent|ant)$/.test(word)) return 'adjective';
    if (/(ize|ise|ify|ate)$/.test(word) || new RegExp(`\\b(?:to|can|could|will|would|should|did|does)\\s+${word}\\b`, 'i').test(context)) return 'verb';
    return 'other';
  }

  function sentencesFrom(text) {
    return cleanTranscript(text).match(/[^.!?]+[.!?]?/g)?.map((item) => item.trim()).filter(Boolean) || [];
  }

  function contextFor(sentences, forms) {
    const normalizedForms = forms.map(normalize);
    return (sentences.find((sentence) => normalizedForms.some((form) => {
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(sentence);
    })) || sentences[0] || '').slice(0, 500);
  }

  function estimateProfileLevel(profileLevel, knownCount = 0, librarySize = 0) {
    if (CEFR_RANK[profileLevel]) return profileLevel;
    const evidence = Math.max(knownCount, librarySize);
    if (evidence >= 1200) return 'C1';
    if (evidence >= 600) return 'B2';
    if (evidence >= 220) return 'B1';
    if (evidence >= 80) return 'A2';
    return 'A1';
  }

  function analyze(text, options = {}) {
    const source = cleanTranscript(text);
    if (!source) return { items: [], stats: { tokens: 0, sentences: 0, profileLevel: 'A1' } };
    const knownTerms = new Set((options.knownTerms || []).map(normalize));
    const ignoredTerms = new Set((options.ignoredTerms || []).map(normalize));
    const knowledge = options.knowledge instanceof Map ? options.knowledge : new Map(Object.entries(options.knowledge || {}));
    const extraBaseWords = new Set([...knownTerms, ...knowledge.keys()].flatMap((term) => normalize(term).split(' ')));
    const rawTokens = source.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
    const sentences = sentencesFrom(source);
    const entries = new Map();

    rawTokens.forEach((surface) => {
      const normalizedSurface = normalize(surface);
      if (normalizedSurface.length < 3 || STOP_WORDS.has(normalizedSurface) || /^(?:n't|'s|'re|'ve|'ll|'d)$/.test(normalizedSurface)) return;
      const canonical = lemma(normalizedSurface, extraBaseWords);
      if (STOP_WORDS.has(canonical)) return;
      const current = entries.get(canonical) || { term: canonical, forms: new Set(), count: 0 };
      current.forms.add(normalizedSurface);
      current.count += 1;
      entries.set(canonical, current);
    });

    PHRASES.forEach((phrase) => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hits = source.match(new RegExp(`\\b${escaped}\\b`, 'gi')) || [];
      if (!hits.length) return;
      entries.set(phrase, { term: phrase, forms: new Set([phrase]), count: hits.length, phrase: true });
    });

    const profileLevel = estimateProfileLevel(options.profileLevel, knownTerms.size, Number(options.librarySize) || knowledge.size);
    const profileRank = CEFR_RANK[profileLevel];
    const items = [...entries.values()].map((entry) => {
      const forms = [...entry.forms];
      const term = entry.term;
      const learned = knowledge.get(term) || forms.map((form) => knowledge.get(form)).find(Boolean);
      const alreadyKnown = knownTerms.has(term) || forms.some((form) => knownTerms.has(form));
      const ignored = ignoredTerms.has(term) || forms.some((form) => ignoredTerms.has(form));
      const cefr = levelFor(term);
      const levelDistance = CEFR_RANK[cefr] - profileRank;
      const novelty = learned || alreadyKnown ? 0 : 0.34;
      const weakMemory = learned ? Math.min(0.42, (Number(learned.lapses) || 0) * 0.13 + ((Number(learned.stability) || 0) < 7 ? 0.12 : 0) - ((Number(learned.stability) || 0) >= 21 ? 0.24 : 0)) : 0;
      const levelFit = levelDistance >= 0 ? Math.min(0.3, 0.12 + levelDistance * 0.08) : Math.max(-0.18, levelDistance * 0.07);
      const frequencyBoost = Math.min(0.16, entry.count * 0.035);
      const phraseBoost = entry.phrase ? 0.12 : 0;
      const score = Math.max(0, Math.min(1, novelty + weakMemory + levelFit + frequencyBoost + phraseBoost - (alreadyKnown ? 0.5 : 0) - (ignored ? 1 : 0)));
      const context = contextFor(sentences, forms.length ? forms : [term]);
      const reasons = [];
      if (!learned && !alreadyKnown) reasons.push('chưa có trong Milim');
      if (learned?.lapses) reasons.push(`từng quên ${learned.lapses} lần`);
      if (learned && Number(learned.stability) >= 21) reasons.push('đã nhớ khá chắc');
      if (entry.phrase) reasons.push('cụm từ nên học cùng nhau');
      if (entry.count > 1) reasons.push(`xuất hiện ${entry.count} lần`);
      reasons.push(`ước tính ${cefr}`);
      return {
        term, forms, count: entry.count, score, cefr, known: Boolean(learned || alreadyKnown), ignored,
        context, partOfSpeech: guessPartOfSpeech(term, context), definition: '', reasons
      };
    }).filter((item) => !item.ignored && item.score >= 0.16)
      .sort((a, b) => b.score - a.score || b.count - a.count || a.term.localeCompare(b.term))
      .slice(0, Math.max(10, Math.min(80, Number(options.limit) || 60)));

    return { items, stats: { tokens: rawTokens.length, sentences: sentences.length, profileLevel } };
  }

  return { CEFR_RANK, LEVELS, STOP_WORDS, PHRASES, normalize, cleanTranscript, lemmaCandidates, lemma, levelFor, guessPartOfSpeech, estimateProfileLevel, analyze };
});
