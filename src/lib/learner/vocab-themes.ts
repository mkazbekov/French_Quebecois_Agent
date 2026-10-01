import type { LearnerState, VocabEntry } from "./schema";

/**
 * Curated vocabulary themes for the vocabulary call.
 *
 * The themes follow the everyday-life domains and communication situations of
 * the official Québec framework — the MIFI *Programme-cadre de français pour les
 * personnes immigrantes adultes au Québec* and the *Échelle québécoise des
 * niveaux de compétence en français* it is built on (housing, food, health,
 * work, transport, services, leisure…). Each word carries the Échelle level at
 * which it is typically taught. Québec usage and register follow Usito
 * (Université de Sherbrooke) and the OQLF's Banque de dépannage linguistique.
 * The lists themselves are a curated selection, not a copy of either document.
 *
 * Ids are stable: never rename or renumber a theme, append new ones.
 */

export interface ThemeWord {
  fr: string;
  en: string;
  /** "quebec" = Québec usage worth distinguishing from international French. */
  register: VocabEntry["register"];
  /** Échelle québécoise level (1–12) at which the word is usually taught. */
  level: number;
}

export interface VocabTheme {
  id: string;
  title: string;
  /** English label for the picker. */
  label: string;
  words: ThemeWord[];
}

export const VOCAB_SOURCES: Array<{ name: string; url: string }> = [
  {
    name: "MIFI — Programme-cadre de français pour les personnes immigrantes adultes au Québec",
    url: "https://cdn-contenu.quebec.ca/cdn-contenu/francisation/MIFI/referentiel/programme-cadre-francais-personnes-immigrantes-adultes-quebec.pdf",
  },
  {
    name: "MIFI — Échelle québécoise des niveaux de compétence en français",
    url: "https://cdn-contenu.quebec.ca/cdn-contenu/francisation/MIFI/referentiel/echelle_niveaux_2011.pdf",
  },
  { name: "Usito — dictionnaire du français au Québec (Université de Sherbrooke)", url: "https://usito.usherbrooke.ca/" },
  { name: "OQLF — Banque de dépannage linguistique", url: "https://vitrinelinguistique.oqlf.gouv.qc.ca/" },
];

const w = (fr: string, en: string, level: number, register: ThemeWord["register"] = "standard"): ThemeWord => ({ fr, en, level, register });

export const VOCAB_THEMES: VocabTheme[] = [
  {
    id: "greetings",
    title: "Se présenter et saluer",
    label: "Greetings & introductions",
    words: [
      w("bonjour", "hello / good morning", 1),
      w("salut", "hi / bye (informal)", 1, "informal"),
      w("bonsoir", "good evening", 1),
      w("je m'appelle…", "my name is…", 1),
      w("enchanté(e)", "nice to meet you", 1),
      w("ça va ?", "how are you?", 1),
      w("ça va bien", "I'm doing well", 1),
      w("merci", "thank you", 1),
      w("bienvenue", "you're welcome (Québec usage)", 1, "quebec"),
      w("s'il vous plaît / s'il te plaît", "please (formal / informal)", 1),
      w("excusez-moi", "excuse me", 1),
      w("au revoir", "goodbye", 1),
      w("bonne journée", "have a good day", 2),
      w("à tantôt", "see you later today", 2, "quebec"),
      w("je viens de…", "I come from…", 2),
      w("j'habite à…", "I live in…", 2),
      w("je parle…", "I speak…", 2),
      w("tutoyer / vouvoyer", "to say tu / to say vous", 3),
      w("faire connaissance", "to get to know someone", 4),
      w("je vous présente…", "let me introduce…", 4),
    ],
  },
  {
    id: "family",
    title: "La famille et les proches",
    label: "Family & people",
    words: [
      w("la mère / le père", "mother / father", 1),
      w("le frère / la sœur", "brother / sister", 1),
      w("l'enfant", "child", 1),
      w("le fils / la fille", "son / daughter", 1),
      w("le mari / la femme", "husband / wife", 2),
      w("le conjoint / la conjointe", "partner (common-law, very common in Québec)", 3, "quebec"),
      w("mon chum / ma blonde", "my boyfriend / my girlfriend", 3, "quebec"),
      w("les grands-parents", "grandparents", 2),
      w("le cousin / la cousine", "cousin", 2),
      w("l'oncle / la tante", "uncle / aunt", 2),
      w("le bébé", "baby", 1),
      w("le voisin / la voisine", "neighbour", 2),
      w("l'ami(e) / le chum", "friend (chum = buddy in Québec)", 2, "quebec"),
      w("être marié(e)", "to be married", 3),
      w("être célibataire", "to be single", 3),
      w("être enceinte", "to be pregnant", 4),
      w("la belle-mère", "mother-in-law / stepmother", 4),
      w("élever des enfants", "to raise children", 5),
      w("s'entendre bien avec", "to get along with", 5),
    ],
  },
  {
    id: "housing",
    title: "Le logement",
    label: "Housing & the apartment",
    words: [
      w("l'appartement", "apartment", 1),
      w("le logement", "dwelling / rental unit", 2),
      w("la chambre", "bedroom", 1),
      w("la cuisine", "kitchen", 1),
      w("la salle de bain", "bathroom", 1),
      w("le salon", "living room", 1),
      w("un 4 ½", "a 4½ (2-bedroom apartment: rooms + ½ for the bathroom)", 3, "quebec"),
      w("le loyer", "rent", 2),
      w("le propriétaire", "landlord", 3),
      w("le locataire", "tenant", 3),
      w("le bail", "lease", 3),
      w("signer / renouveler le bail", "to sign / renew the lease", 4),
      w("le déménagement", "the move", 3),
      w("déménager", "to move (house)", 3),
      w("le 1er juillet", "July 1st, Québec's moving day", 3, "quebec"),
      w("chauffé, éclairé", "heating and electricity included", 4, "quebec"),
      w("le concierge", "building superintendent", 4),
      w("la laveuse / la sécheuse", "washing machine / dryer", 3, "quebec"),
      w("le frigidaire / le frigo", "fridge", 2, "quebec"),
      w("la fuite d'eau", "water leak", 5),
      w("le Tribunal administratif du logement", "Québec's housing tribunal (formerly Régie du logement)", 6, "quebec"),
    ],
  },
  {
    id: "food",
    title: "L'alimentation, l'épicerie et le restaurant",
    label: "Food, groceries & eating out",
    words: [
      w("le pain", "bread", 1),
      w("le lait", "milk", 1),
      w("le fromage", "cheese", 1),
      w("les fruits / les légumes", "fruit / vegetables", 1),
      w("l'eau", "water", 1),
      w("le déjeuner", "breakfast (Québec)", 2, "quebec"),
      w("le dîner", "lunch (Québec)", 2, "quebec"),
      w("le souper", "dinner / supper (Québec)", 2, "quebec"),
      w("l'épicerie", "grocery store", 2),
      w("le dépanneur", "corner store", 2, "quebec"),
      w("le panier", "basket", 2),
      w("la facture", "the bill / receipt", 3),
      w("l'addition", "the bill (restaurant)", 3),
      w("le pourboire", "tip", 3),
      w("pour emporter / pour ici", "to go / for here", 3),
      w("une liqueur", "a soft drink (Québec)", 3, "quebec"),
      w("les patates", "potatoes (everyday Québec)", 2, "quebec"),
      w("la poutine", "poutine", 2, "quebec"),
      w("en spécial", "on sale (Québec)", 4, "quebec"),
      w("être allergique à", "to be allergic to", 4),
      w("apportez votre vin", "bring-your-own-wine restaurant", 5, "quebec"),
    ],
  },
  {
    id: "shopping",
    title: "Magasiner, l'argent et la banque",
    label: "Shopping, money & banking",
    words: [
      w("acheter", "to buy", 1),
      w("le prix", "price", 1),
      w("combien ça coûte ?", "how much does it cost?", 1),
      w("magasiner", "to go shopping (Québec)", 2, "quebec"),
      w("le magasin", "store", 1),
      w("la caisse", "checkout / credit union (Caisse Desjardins)", 2, "quebec"),
      w("payer comptant", "to pay cash", 3),
      w("la carte de débit / de crédit", "debit / credit card", 2),
      w("un dollar / une piasse", "a dollar (piasse = informal Québec)", 3, "quebec"),
      w("le change", "change (coins)", 3),
      w("les taxes", "sales taxes (TPS/TVQ added at the till)", 3, "quebec"),
      w("le reçu", "receipt", 3),
      w("rembourser", "to refund", 4),
      w("échanger", "to exchange", 4),
      w("le compte bancaire", "bank account", 4),
      w("le guichet automatique", "ATM", 4),
      w("le virement Interac", "e-transfer", 5, "quebec"),
      w("les soldes", "sales (seasonal)", 4),
      w("emprunter / prêter", "to borrow / to lend", 5),
    ],
  },
  {
    id: "transport",
    title: "Le transport et la ville",
    label: "Getting around the city",
    words: [
      w("le métro", "subway", 1),
      w("l'autobus", "bus", 1),
      w("le char", "car (informal Québec)", 3, "quebec"),
      w("la voiture / l'auto", "car", 1),
      w("à pied", "on foot", 1),
      w("le vélo / le BIXI", "bike / Montréal's bike share", 2, "quebec"),
      w("la station", "station", 1),
      w("l'arrêt d'autobus", "bus stop", 2),
      w("la carte OPUS", "Montréal transit card", 3, "quebec"),
      w("tourner à gauche / à droite", "to turn left / right", 2),
      w("tout droit", "straight ahead", 2),
      w("le coin de la rue", "street corner", 2),
      w("le feu de circulation / les lumières", "traffic light (lumières = Québec)", 3, "quebec"),
      w("le stationnement", "parking (Québec)", 3, "quebec"),
      w("le trafic / le bouchon", "traffic jam", 4),
      w("la correspondance", "transfer (between lines)", 4),
      w("le permis de conduire", "driver's licence", 4),
      w("les travaux / les cônes orange", "roadwork", 5, "quebec"),
    ],
  },
  {
    id: "health",
    title: "La santé",
    label: "Health & the doctor",
    words: [
      w("malade", "sick", 1),
      w("j'ai mal à…", "my … hurts", 2),
      w("la tête / le ventre / le dos", "head / stomach / back", 1),
      w("le médecin / le docteur", "doctor", 2),
      w("la pharmacie", "pharmacy", 2),
      w("le rendez-vous", "appointment", 2),
      w("la clinique sans rendez-vous", "walk-in clinic", 3, "quebec"),
      w("le CLSC", "local community health centre", 4, "quebec"),
      w("la carte d'assurance maladie", "health insurance card (RAMQ)", 3, "quebec"),
      w("l'urgence", "the emergency room", 3),
      w("une prescription", "a prescription (Québec usage; ordonnance in France)", 3, "quebec"),
      w("la fièvre", "fever", 3),
      w("le rhume / la grippe", "cold / flu", 3),
      w("tousser", "to cough", 3),
      w("le médecin de famille", "family doctor", 4),
      w("Info-Santé 811", "the 811 nurse hotline", 5, "quebec"),
      w("les effets secondaires", "side effects", 6),
    ],
  },
  {
    id: "work",
    title: "Le travail",
    label: "Work & job search",
    words: [
      w("le travail / la job", "work / job (la job = Québec)", 2, "quebec"),
      w("travailler", "to work", 1),
      w("le bureau", "office", 1),
      w("le collègue", "colleague", 2),
      w("le patron / la patronne", "boss", 2),
      w("le salaire", "salary", 3),
      w("le CV", "résumé", 3),
      w("l'entrevue", "job interview (Québec; entretien in France)", 3, "quebec"),
      w("à temps plein / à temps partiel", "full-time / part-time", 3),
      w("la paie", "pay / paycheque", 3),
      w("une réunion / un meeting", "a meeting", 3),
      w("les vacances", "vacation", 2),
      w("prendre congé", "to take time off", 4),
      w("le quart de travail", "shift", 4, "quebec"),
      w("le courriel", "email (Québec; recommended by the OQLF)", 3, "quebec"),
      w("postuler", "to apply (for a job)", 4),
      w("l'expérience de travail", "work experience", 4),
      w("la reconnaissance des diplômes", "credential recognition", 6),
      w("négocier", "to negotiate", 6),
    ],
  },
  {
    id: "weather",
    title: "La météo et les saisons",
    label: "Weather & seasons",
    words: [
      w("il fait beau", "the weather is nice", 1),
      w("il fait chaud / froid", "it's hot / cold", 1),
      w("il pleut", "it's raining", 1),
      w("il neige", "it's snowing", 1),
      w("l'hiver / l'été", "winter / summer", 1),
      w("le printemps / l'automne", "spring / autumn", 2),
      w("il fait frette", "it's freezing (informal Québec)", 3, "quebec"),
      w("la tempête de neige", "snowstorm", 3),
      w("la poudrerie", "blowing snow", 5, "quebec"),
      w("la tuque", "winter hat", 2, "quebec"),
      w("les mitaines", "mittens", 3, "quebec"),
      w("le manteau d'hiver", "winter coat", 2),
      w("les bottes", "boots", 2),
      w("la slush / la gadoue", "slush", 4, "quebec"),
      w("le verglas", "freezing rain / black ice", 4),
      w("le déneigement", "snow removal", 5, "quebec"),
      w("le facteur vent", "wind chill", 5),
      w("la canicule", "heat wave", 6),
    ],
  },
  {
    id: "leisure",
    title: "Les loisirs et les sorties",
    label: "Free time & going out",
    words: [
      w("aimer / adorer", "to like / to love", 1),
      w("le sport", "sport", 1),
      w("la musique", "music", 1),
      w("le film / le cinéma", "movie / movie theatre", 1),
      w("lire", "to read", 1),
      w("la fin de semaine", "the weekend (Québec)", 2, "quebec"),
      w("sortir", "to go out", 2),
      w("le parc", "park", 1),
      w("le hockey", "hockey", 2),
      w("patiner", "to skate", 3),
      w("faire du ski / de la raquette", "to ski / to snowshoe", 3),
      w("le festival", "festival", 3),
      w("le spectacle / le show", "show / concert", 3, "quebec"),
      w("aller prendre une bière", "to go for a beer", 3),
      w("avoir du fun", "to have fun (Québec)", 3, "quebec"),
      w("la cabane à sucre", "sugar shack", 4, "quebec"),
      w("une activité de plein air", "an outdoor activity", 5),
    ],
  },
  {
    id: "services",
    title: "Les services et les démarches",
    label: "Services & paperwork",
    words: [
      w("le formulaire", "form", 3),
      w("remplir", "to fill in", 3),
      w("la signature", "signature", 3),
      w("le nom / le prénom", "last name / first name", 1),
      w("l'adresse", "address", 1),
      w("le numéro de téléphone", "phone number", 1),
      w("la date de naissance", "date of birth", 2),
      w("le bureau de poste", "post office", 2),
      w("le colis", "parcel", 3),
      w("le numéro d'assurance sociale", "social insurance number (NAS)", 4),
      w("la pièce d'identité", "ID", 4),
      w("prendre un numéro", "to take a ticket (in a queue)", 3),
      w("la file d'attente", "the line / queue", 3),
      w("le rendez-vous en ligne", "online appointment", 4),
      w("l'impôt / la déclaration de revenus", "tax / tax return", 5),
      w("la SAAQ", "Québec's licence and vehicle registry", 5, "quebec"),
      w("le délai", "processing time / deadline", 5),
    ],
  },
  {
    id: "school",
    title: "L'école et la garderie",
    label: "School & daycare",
    words: [
      w("l'école", "school", 1),
      w("le professeur / le prof", "teacher", 1),
      w("l'élève", "pupil", 2),
      w("la garderie", "daycare", 2),
      w("le CPE", "subsidized daycare centre (Québec)", 4, "quebec"),
      w("le primaire / le secondaire", "elementary / high school", 3, "quebec"),
      w("le cégep", "Québec college (between high school and university)", 4, "quebec"),
      w("les devoirs", "homework", 2),
      w("la boîte à lunch", "lunch box (Québec)", 3, "quebec"),
      w("la rentrée", "back to school", 3),
      w("le bulletin", "report card", 4),
      w("la réunion de parents", "parent-teacher meeting", 4),
      w("s'inscrire", "to enrol / sign up", 4),
      w("les cours de francisation", "French classes for newcomers", 3, "quebec"),
    ],
  },
  {
    id: "expressions",
    title: "Expressions québécoises courantes",
    label: "Everyday Québec expressions",
    words: [
      w("c'est correct", "it's OK / that's fine", 2, "quebec"),
      w("pantoute", "not at all", 4, "quebec"),
      w("tiguidou", "perfect / all good", 4, "quebec"),
      w("ça va bien aller", "it's going to be OK", 3, "quebec"),
      w("pis", "and then / so", 3, "informal"),
      w("tantôt", "earlier / later today", 3, "quebec"),
      w("c'est plate", "that's boring / too bad", 3, "quebec"),
      w("être tanné(e)", "to be fed up", 4, "quebec"),
      w("avoir de la misère à", "to have a hard time …ing", 5, "quebec"),
      w("je m'en viens", "I'm on my way", 4, "quebec"),
      w("bon matin", "good morning", 3, "quebec"),
      w("c'est le fun", "it's fun", 3, "quebec"),
      w("une jasette", "a chat", 4, "quebec"),
      w("niaiser", "to kid around / waste time", 5, "quebec"),
      w("être en masse", "there's plenty", 5, "quebec"),
      w("lâche pas !", "hang in there!", 4, "quebec"),
      w("de bonne heure", "early", 4, "quebec"),
      w("prendre une marche", "to go for a walk", 4, "quebec"),
    ],
  },
];

export function findTheme(id: string): VocabTheme | undefined {
  return VOCAB_THEMES.find((t) => t.id === id);
}

const norm = (s: string) => s.toLowerCase().normalize("NFC").trim();

/** Words the learner already uses reliably (known, never struggled more than they succeeded). */
export function knownWords(state: LearnerState): Set<string> {
  return new Set(
    state.vocabulary.items.filter((v) => v.status === "known" && v.times_used_correctly >= v.times_struggled).map((v) => norm(v.word)),
  );
}

/**
 * The words a vocabulary call on this theme should teach: at or below the
 * learner's level + 1, not already known, easiest first, then the next level up.
 */
export function themeWordsFor(theme: VocabTheme, state: LearnerState, max = 10): ThemeWord[] {
  const level = state.competencies.oral_production.level;
  const known = knownWords(state);
  return theme.words
    .filter((x) => x.level <= level + 1 && !known.has(norm(x.fr)))
    .sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level) || a.level - b.level)
    .slice(0, max);
}

/**
 * The theme a vocabulary call uses when the learner left the choice to the
 * tutor: the theme with the most still-unknown words at their level; ties go
 * to the earlier theme in the list (simplest everyday domains first).
 */
export function suggestTheme(state: LearnerState): VocabTheme {
  let best = VOCAB_THEMES[0];
  let bestCount = -1;
  for (const theme of VOCAB_THEMES) {
    const count = themeWordsFor(theme, state, 100).length;
    if (count > bestCount) {
      best = theme;
      bestCount = count;
    }
  }
  return best;
}

export const MAX_CUSTOM_WORDS = 60;
const MAX_WORD_LENGTH = 80;

/** Splits a pasted list (one per line, or comma/semicolon separated) into clean, unique items. */
export function parseCustomWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const item = raw.replace(/\s+/g, " ").replace(/^(?:[-•*]|\d+[.)])\s+/, "").trim().slice(0, MAX_WORD_LENGTH);
    if (!item || seen.has(norm(item))) continue;
    seen.add(norm(item));
    out.push(item);
    if (out.length >= MAX_CUSTOM_WORDS) break;
  }
  return out;
}
