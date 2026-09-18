/**
 * The learning program: a level-indexed syllabus on the Échelle québécoise
 * (see ./levels.ts). Each unit is one teachable thing with a stable id.
 *
 * Code drives the order (merge.ts picks the next not-done unit at the
 * learner's level); the reviewer may only pull a unit forward or report what
 * was practised. Ids are stable: never renumber, append instead.
 *
 * kinds: grammar (a form), function (something you do with the language),
 * theme (vocabulary field), quebec (Québec usage / culture).
 */

export type UnitKind = "grammar" | "function" | "theme" | "quebec";

export interface SyllabusUnit {
  id: string; // L3-G02
  level: number; // 1..12
  kind: UnitKind;
  title: string;
  /** What "done" looks like, in one line. Shown to the tutor and the reviewer. */
  goal: string;
}

const L = (level: number, kind: UnitKind, n: number, title: string, goal: string): SyllabusUnit => ({
  id: `L${level}-${{ grammar: "G", function: "F", theme: "T", quebec: "Q" }[kind]}${String(n).padStart(2, "0")}`,
  level,
  kind,
  title,
  goal,
});

export const SYLLABUS: readonly SyllabusUnit[] = [
  // ---------------------------------------------------------------- niveau 1 (≈ A1)
  L(1, "function", 1, "Saluer et se présenter", "Say bonjour/salut, je m'appelle…, ça va ? and answer."),
  L(1, "theme", 1, "Les nombres 0–20, l'âge", "Count to 20, say and understand an age or a price under 20 $."),
  L(1, "grammar", 1, "Je suis / je ne suis pas ; c'est", "Use être in the first and third person, affirmative and negative."),
  L(1, "function", 2, "Oui, non, merci, s'il vous plaît, je ne comprends pas", "Manage a basic exchange politely and ask to repeat (Peux-tu répéter ?)."),
  L(1, "theme", 2, "La famille et les gens proches", "Name family members and say who lives with you."),
  L(1, "quebec", 1, "Tu vs vous à Montréal", "Know that tu is normal between adults in most daily situations, vous for older strangers and service formalities."),
  L(1, "grammar", 2, "Les articles un / une / le / la", "Use the right article with familiar nouns; know gender is a property of the word."),

  // ---------------------------------------------------------------- niveau 2 (≈ A1)
  L(2, "grammar", 1, "Le présent des verbes en -er (habiter, travailler, parler)", "Conjugate regular -er verbs for je/tu/il/nous/vous/ils in speech."),
  L(2, "grammar", 2, "Avoir et être au présent", "Use avoir/être in all persons, including j'ai faim, il a 30 ans."),
  L(2, "function", 1, "Décrire sa journée", "Say what you do in a normal day with times (je me lève à 7 h)."),
  L(2, "theme", 1, "Les nombres jusqu'à 100, l'heure, les prix", "Understand and say times, prices, phone numbers."),
  L(2, "theme", 2, "La nourriture, l'épicerie", "Name common foods and buy them: je voudrais…, combien ça coûte ?"),
  L(2, "function", 2, "Poser des questions simples", "Ask est-ce que…, où, quand, combien, qu'est-ce que with intonation."),
  L(2, "quebec", 1, "Déjeuner, dîner, souper ; le dépanneur", "Use the Québec names of meals and know dépanneur, épicerie, pharmacie."),
  L(2, "grammar", 3, "La négation ne… pas (et le pas tout seul à l'oral)", "Negate a verb; understand that spoken Québec French drops ne (je sais pas)."),

  // ---------------------------------------------------------------- niveau 3 (≈ A2)
  L(3, "grammar", 1, "Le passé composé avec avoir", "Tell what you did yesterday with regular and common irregular participles (fait, pris, vu)."),
  L(3, "grammar", 2, "Le passé composé avec être (aller, venir, partir, rester)", "Choose être for the movement/state verbs and agree the participle."),
  L(3, "function", 1, "Raconter sa fin de semaine", "Narrate three or four past events in order with hier, ensuite, après."),
  L(3, "grammar", 3, "Aller + infinitif (futur proche)", "Say plans: je vais aller, on va manger."),
  L(3, "theme", 1, "Se déplacer : la STM, le métro, l'autobus", "Ask for and give directions; know ligne orange/verte, correspondance, carte OPUS."),
  L(3, "theme", 2, "La météo et les saisons, l'hiver", "Talk about weather: il fait froid, il neige, il fait frette, la sloche."),
  L(3, "function", 2, "Commander au restaurant et au café", "Order, ask for the bill, understand 'pour ici ou pour emporter ?'."),
  L(3, "quebec", 1, "Expressions de tous les jours : c'est correct, pas pire, tantôt, pis", "Understand and use five high-frequency Québec expressions naturally."),
  L(3, "grammar", 4, "Les adjectifs : accord et place", "Agree adjectives in gender/number and place common ones (grand, petit, beau) correctly."),

  // ---------------------------------------------------------------- niveau 4 (≈ A2)
  L(4, "grammar", 1, "Les verbes pronominaux au présent et au passé", "Use se lever, se coucher, s'appeler in present and passé composé."),
  L(4, "grammar", 2, "Les pronoms objets le / la / les / lui / leur", "Replace a noun with an object pronoun in a short answer (je l'ai vu, je lui parle)."),
  L(4, "function", 1, "Prendre un rendez-vous (médecin, coiffeur, banque)", "Book, move and cancel an appointment on the phone."),
  L(4, "theme", 1, "Le logement : chercher et louer un appartement", "Understand a listing (3 ½, chauffé, non-meublé), ask about a lease, know le 1er juillet."),
  L(4, "theme", 2, "Le travail : parler de son emploi", "Describe your job, hours, colleagues; basic workplace small talk."),
  L(4, "grammar", 3, "Le comparatif et le superlatif", "Compare with plus/moins/aussi… que, le plus, meilleur/mieux."),
  L(4, "function", 2, "Exprimer ses goûts et préférences", "Say what you like/dislike/prefer with reasons: j'aime ça parce que…"),
  L(4, "quebec", 1, "Le magasinage et le service à la clientèle", "Know magasiner, une vente, un spécial, la taxe, le pourboire; handle a return."),
  L(4, "grammar", 4, "Les prépositions de lieu et les contractions (au, du, chez)", "Say where you are/go with the right preposition and contraction."),

  // ---------------------------------------------------------------- niveau 5 (≈ B1)
  L(5, "grammar", 1, "L'imparfait : description et habitude", "Describe past situations and habits (quand j'étais petit, il faisait…)."),
  L(5, "grammar", 2, "Imparfait vs passé composé", "Combine background and events in one story (il pleuvait, alors je suis resté)."),
  L(5, "function", 1, "Raconter une anecdote avec des détails", "Tell a two-minute story with setting, event, reaction."),
  L(5, "grammar", 3, "Le futur simple", "Talk about future plans and predictions: je ferai, il y aura."),
  L(5, "function", 2, "Donner son opinion et la justifier", "Use je pense que, à mon avis, parce que, par contre."),
  L(5, "theme", 1, "La santé : à la clinique, à la pharmacie", "Describe symptoms, understand instructions; know CLSC, carte soleil, sans rendez-vous."),
  L(5, "theme", 2, "Les services publics et l'administration", "Handle Hydro-Québec, SAAQ, Revenu Québec basics; understand a form."),
  L(5, "quebec", 1, "Le registre familier : ch't'en train, y'a, t'sais, faque", "Understand informal spoken Québec French reductions; use a few appropriately."),
  L(5, "grammar", 4, "Les pronoms y et en", "Use y and en for places and quantities (j'y vais, j'en ai deux)."),

  // ---------------------------------------------------------------- niveau 6 (≈ B1)
  L(6, "grammar", 1, "Le conditionnel présent : politesse et hypothèse", "Ask politely and imagine: je voudrais, on pourrait, si j'avais…, je ferais."),
  L(6, "grammar", 2, "Le subjonctif après il faut que, je veux que", "Produce the subjunctive of common verbs after the most frequent triggers."),
  L(6, "function", 1, "Se plaindre et négocier (propriétaire, employeur, commerce)", "State a problem, propose a solution, stay polite but firm."),
  L(6, "theme", 1, "Le marché du travail : CV, entrevue, permis", "Present your experience, answer common interview questions, know ordre professionnel, permis de travail."),
  L(6, "function", 2, "Expliquer un processus étape par étape", "Explain how to do something with d'abord, ensuite, enfin, and connectors."),
  L(6, "grammar", 3, "Les pronoms relatifs qui, que, où, dont", "Link two ideas in one sentence with the right relative pronoun."),
  L(6, "quebec", 1, "Culture : fêtes, hiver, hockey, cabane à sucre, Saint-Jean", "Talk about Québec seasonal life and understand references to it."),
  L(6, "theme", 2, "Les médias : nouvelles, radio, balados", "Follow the gist of a short news item or a podcast segment and summarise it."),

  // ---------------------------------------------------------------- niveau 7 (≈ B2)
  L(7, "grammar", 1, "Le plus-que-parfait et la concordance des temps", "Sequence past events (j'avais déjà mangé quand…)."),
  L(7, "grammar", 2, "Le conditionnel passé et les regrets", "Express what would have happened: j'aurais dû, si j'avais su."),
  L(7, "function", 1, "Débattre : concéder, nuancer, réfuter", "Hold a position in a discussion with certes, en revanche, il n'en reste pas moins que."),
  L(7, "grammar", 3, "Le subjonctif étendu (bien que, pour que, avant que, doute)", "Use the subjunctive after conjunctions and expressions of doubt/emotion."),
  L(7, "function", 2, "Présenter un sujet pendant deux minutes", "Give a structured mini-presentation with introduction, points, conclusion."),
  L(7, "theme", 1, "Vie citoyenne : élections, services, bénévolat", "Discuss municipal/provincial life and civic vocabulary."),
  L(7, "quebec", 1, "Anglicismes, franglais et rectitude : ce qui se dit et ce qui ne se dit pas", "Recognise common Québec anglicisms, know the neutral alternative, choose by context."),
  L(7, "grammar", 4, "Le discours rapporté", "Report what someone said with tense shifts (il a dit qu'il viendrait)."),

  // ---------------------------------------------------------------- niveau 8 (≈ B2)
  L(8, "grammar", 1, "La voix passive et les tournures impersonnelles", "Use il est possible que, on + verb, passive forms in explanations."),
  L(8, "function", 1, "Changer de registre : courriel formel vs message texte", "Produce the same request in formal and informal register, spoken and written."),
  L(8, "grammar", 2, "Les connecteurs logiques avancés", "Structure an argument with néanmoins, dès lors, en somme, quoi qu'il en soit."),
  L(8, "theme", 1, "Le monde professionnel : réunions, courriels, présentations", "Run a short meeting exchange, summarise decisions, write a clear email."),
  L(8, "function", 2, "Comprendre l'implicite : ironie, humour, sous-entendus", "Catch irony and implied meaning in a short story or joke."),
  L(8, "quebec", 1, "Le français québécois parlé rapide : sacres (à reconnaître), joual, émissions", "Recognise swearing and joual features in media without using them; understand a fast talk-show excerpt."),
  L(8, "grammar", 3, "Nominalisation et style soutenu", "Turn verbs into nouns (la mise en place, l'obtention) for formal speech."),

  // ---------------------------------------------------------------- niveau 9 (≈ C1)
  L(9, "function", 1, "Argumenter longuement sur un sujet abstrait", "Sustain a ten-minute discussion on society, ethics, economy with precise vocabulary."),
  L(9, "grammar", 1, "Le passé simple et le subjonctif imparfait (reconnaissance)", "Recognise literary tenses in reading; never needed in speech."),
  L(9, "theme", 1, "Actualité québécoise et canadienne", "Discuss current affairs (langue, immigration, logement) with the terms used in the media."),
  L(9, "quebec", 1, "Variation régionale : Montréal, Québec, Saguenay, Acadie", "Recognise regional accents and expressions."),
  L(9, "function", 2, "Reformuler, résumer, synthétiser", "Summarise a long spoken passage accurately in your own words."),

  // ---------------------------------------------------------------- niveau 10 (≈ C1)
  L(10, "function", 1, "Négocier et persuader en contexte professionnel", "Lead a negotiation with strategy, hedging and precise register."),
  L(10, "grammar", 1, "Nuances de mode et de temps", "Choose between indicative/subjunctive/conditional for subtle meaning shifts."),
  L(10, "theme", 1, "Littérature et chanson québécoises", "Discuss a text or song (Vigneault, Tremblay, Cœur de pirate) with cultural context."),
  L(10, "quebec", 1, "Histoire et identité : Révolution tranquille, loi 101, référendums", "Explain key moments of Québec history and what they mean today."),

  // ---------------------------------------------------------------- niveau 11 (≈ C2)
  L(11, "function", 1, "Humour, jeux de mots et style", "Make and understand wordplay; adapt tone finely to the audience."),
  L(11, "theme", 1, "Domaines spécialisés", "Speak with precision in your professional field and one unfamiliar field."),
  L(11, "quebec", 1, "Le français québécois normé vs familier : maîtrise consciente", "Move deliberately between normative and colloquial Québec French."),

  // ---------------------------------------------------------------- niveau 12 (≈ C2)
  L(12, "function", 1, "Maîtrise complète", "Native-like performance across registers, topics and media; maintenance and enrichment only."),
];

const BY_ID = new Map(SYLLABUS.map((u) => [u.id, u]));

export function findUnit(id: string): SyllabusUnit | undefined {
  return BY_ID.get(id);
}

export function unitsForLevel(level: number): SyllabusUnit[] {
  return SYLLABUS.filter((u) => u.level === level);
}

export type UnitStatus = "not_started" | "in_progress" | "done";

/** Minimal shape merge.ts stores per unit (kept small: it lives in the roadmap block). */
export interface UnitProgress {
  id: string;
  status: UnitStatus;
  ok: number;
  struggled: number;
  last_practiced: string | null;
}

export function statusOf(progress: readonly UnitProgress[], id: string): UnitStatus {
  return progress.find((p) => p.id === id)?.status ?? "not_started";
}

/**
 * Units still to do, in program order: unfinished units from levels below the
 * learner's level first (gaps), then the learner's level, then one level up.
 */
export function pendingUnits(level: number, progress: readonly UnitProgress[]): SyllabusUnit[] {
  return SYLLABUS.filter((u) => u.level <= level + 1 && statusOf(progress, u.id) !== "done");
}

export function levelProgress(level: number, progress: readonly UnitProgress[]): { done: number; total: number } {
  const units = unitsForLevel(level);
  return { done: units.filter((u) => statusOf(progress, u.id) === "done").length, total: units.length };
}

export function formatUnit(u: SyllabusUnit): string {
  return `${u.id} [${u.kind}] ${u.title} — ${u.goal}`;
}
