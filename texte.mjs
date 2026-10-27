// Mise en forme des textes de scénario : conditions de distribution, typographie française, Markdown réduit.
// Module pur (sans dépendance Node) : utilisé tel quel par la construction du PDF et par l'application.

const COND = /\{\?(!?)([a-z]+)\}([\s\S]*?)\{\/\?\}/g;

// Garde ou retire les blocs {?id}…{/?} et {?!id}…{/?} selon les personnages joués ce soir.
export function conditionner(texte, presents) {
  if (texte == null) return '';
  let t = String(texte);
  let avant;
  do {
    avant = t;
    t = t.replace(COND, (_, non, id, corps) => ((presents.has(id) !== Boolean(non)) ? corps : ''));
  } while (t !== avant);
  return t;
}

// Une condition d'objectif : 'garnier' (présent) ou '!garnier' (absent) ; vide = toujours.
export function condition(si, presents) {
  if (!si) return true;
  return si.startsWith('!') ? !presents.has(si.slice(1)) : presents.has(si);
}

const NBSP = ' ';
const FINE = ' ';

// Apostrophes typographiques, espaces insécables avant « ; : ! ? » et dans les heures et nombres.
export function typo(texte) {
  return String(texte)
    .replace(/'/g, '’')
    .replace(/« /g, `«${NBSP}`).replace(/ »/g, `${NBSP}»`)
    .replace(/ ([;!?])/g, `${FINE}$1`)
    .replace(/ :/g, `${NBSP}:`)
    .replace(/(\d) h (\d)/g, `$1${NBSP}h${NBSP}$2`)
    .replace(/(\d) h\b/g, `$1${NBSP}h`)
    .replace(/(\d) (\d{3})\b/g, `$1${NBSP}$2`)
    .replace(/(\d) (NF|F|hl|hectos|hectolitres|litres|m|cm|km|ans|%)(?=[\s.,;:!?)»]|$)/g, `$1${NBSP}$2`)
    .replace(/\b(M\.|Mme|Me|Dr|n°) /g, `$1${NBSP}`);
}

export const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const enLigne = (s) => echapper(typo(s))
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>');

// Markdown réduit : paragraphes, listes « - », gras, italique. Renvoie du HTML sûr.
export function md(texte, presents = null) {
  const t = presents ? conditionner(texte, presents) : String(texte ?? '');
  const blocs = t.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocs.map((b) => {
    const lignes = b.split('\n');
    if (lignes.every((l) => /^\s*-\s+/.test(l))) {
      return `<ul>${lignes.map((l) => `<li>${enLigne(l.replace(/^\s*-\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p>${lignes.map(enLigne).join('<br>')}</p>`;
  }).join('');
}

// Une ligne de texte, sans paragraphe.
export const ligne = (texte, presents = null) => enLigne(presents ? conditionner(texte, presents) : String(texte ?? '')).trim();

// Clé de comparaison des codes de manche : sans accents, sans espaces, en capitales.
export const normaliserCode = (c) => String(c ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
