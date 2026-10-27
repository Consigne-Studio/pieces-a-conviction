// Application de soirée « Pièces à conviction ».
// Deux modes, sans serveur ni compte : la « table » (le téléphone ou la tablette de l'hôte) et le « joueur »
// (le téléphone de chaque invité, ouvert par son lien personnel). Tout l'état reste dans le navigateur.
import { conditionner, condition, echapper, normaliserCode } from './texte.mjs';
import { cleDeManche, cleMaitresse, dechiffrer, b64u } from './chiffre.mjs';
import qrcode from './vendor/qrcode.mjs';

const SCENARIO = 'la-derniere-paulee';
const $app = document.getElementById('app');
const $calque = document.getElementById('calque');
const E = (s) => echapper(String(s ?? ''));
const base = () => location.href.split('#')[0].split('?')[0];

// ───────── Stockage local (tolérant : navigation privée, stockage plein) ─────────
const stock = {
  lire(cle, defaut) { try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; } },
  ecrire(cle, v) { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* sans stockage, la partie continue en mémoire */ } },
  effacer(cle) { try { localStorage.removeItem(cle); } catch { /* rien */ } },
};

let donnees = null;
async function charger() {
  if (donnees) return donnees;
  const rep = await fetch(`scenarios/${SCENARIO}.json`);
  if (!rep.ok) throw new Error('Scénario introuvable');
  donnees = await rep.json();
  return donnees;
}

const nomPerso = (p) => `${p.prenom} ${p.nom}`;
const plur = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// ───────── Calque plein écran (pièces à conviction, QR codes, confirmations) ─────────
function ouvrirCalque(html, { large = false } = {}) {
  $calque.innerHTML = `<div class="calque__fond" data-action="fermer-calque"></div>
    <div class="calque__boite${large ? ' calque__boite--large' : ''}" role="dialog" aria-modal="true">
      <div class="calque__barre"><button class="bouton bouton--discret" data-action="zoom" aria-label="Agrandir">Agrandir</button><button class="bouton bouton--discret" data-action="fermer-calque">Fermer</button></div>
      <div class="calque__contenu">${html}</div></div>`;
  $calque.hidden = false;
  document.body.classList.add('fige');
}
function fermerCalque() { $calque.hidden = true; $calque.innerHTML = ''; document.body.classList.remove('fige'); }
$calque.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]')?.dataset.action;
  if (a === 'fermer-calque') fermerCalque();
  if (a === 'zoom') $calque.querySelector('.calque__contenu').classList.toggle('zoome');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$calque.hidden) fermerCalque(); });

function qrSvg(texte) {
  const q = qrcode(0, 'L');
  q.addData(texte);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

const montrerPiece = (piece, presents) => ouvrirCalque(conditionner(piece.html, presents), { large: true });

function entete(titre, sous = '') {
  return `<header class="entete"><div class="entete__bulle" aria-hidden="true"><span>JEU</span><span>001</span></div>
    <div><div class="sur">${E(sous || 'Pièces à conviction')}</div><h1 class="titre">${E(titre)}</h1></div></header>`;
}

// ═════════════════════════════ MODE JOUEUR ═════════════════════════════
function lirePaquet(h) {
  try {
    const p = JSON.parse(new TextDecoder().decode(b64u.dec(h)));
    if (p.v !== 1 || !p.r || !p.k || !p.p || !Array.isArray(p.c)) return null;
    return p;
  } catch { return null; }
}

async function modeJoueur(paquet) {
  const d = await charger();
  const cleEtat = `pac:j:${d.id}:${paquet.r}`;
  const etat = stock.lire(cleEtat, { codes: {}, objectifs: {}, notes: '', onglet: 'role' });
  const presents = new Set(paquet.c);
  const pub0 = await dechiffrer(paquet.p, d.pub[0]);
  if (!pub0) { $app.innerHTML = `${entete('Lien abîmé')}<p class="texte">Ce lien d'invitation est incomplet. Demandez à votre hôte de vous le renvoyer.</p>`; return; }
  const moi = pub0.personnages.find((x) => x.id === paquet.r);
  const parties = {};
  const pieces = {};
  for (const n of [1, 2, 3]) {
    if (!etat.codes[n]) continue;
    parties[n] = await dechiffrer(await cleDeManche(paquet.k, etat.codes[n]), d.roles[paquet.r][n]);
    pieces[n] = await dechiffrer(await cleDeManche(paquet.p, etat.codes[n]), d.pub[n]);
    if (!parties[n]) delete etat.codes[n];
  }
  const sauver = () => stock.ecrire(cleEtat, etat);
  const ouvertes = [1, 2, 3].filter((n) => parties[n]);
  const prochaine = [1, 2, 3].find((n) => !parties[n]);
  const objectifsVisibles = ouvertes.flatMap((n) => parties[n].objectifs.filter((o) => condition(o.si, presents)));
  const total = objectifsVisibles.filter((o) => etat.objectifs[o.id]).reduce((s, o) => s + o.points, 0);
  const joueurDe = (id) => paquet.n?.[id];

  const formCode = (n) => `<form class="code" data-form="code" data-n="${n}">
    <label for="code-${n}"><span class="sur">Manche ${n}</span>Saisissez le code affiché par la table</label>
    <div class="code__ligne"><input id="code-${n}" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" required>
    <button class="bouton bouton--signal">Ouvrir</button></div><p class="erreur" hidden>Ce n'est pas le bon code.</p></form>`;

  if (!ouvertes.length) {
    $app.innerHTML = `${entete(d.titre, 'Votre invitation')}
      <section class="carte carte--invite">
        <div class="sur">Vous jouerez</div><div class="carte-perso__nom">${E(nomPerso(moi))}</div>
        <div class="carte-perso__titre">${E(moi.titre)} · ${moi.age} ans</div>
        <p>${moi.presentation}</p>
        <h2 class="sous">Votre tenue</h2><p>${moi.costume}</p>
        ${paquet.e ? `<h2 class="sous">La soirée</h2><p>${E(paquet.e)}</p>` : ''}
      </section>
      <section class="carte">${pub0.accroche}</section>
      ${formCode(1)}
      <p class="aide">Gardez ce lien : il ouvre votre livret secret le soir de la partie. Rien n'est envoyé sur internet.</p>`;
  } else {
    const onglets = [['role', 'Mon rôle'], ...ouvertes.filter((n) => n > 1).map((n) => [`m${n}`, `Manche ${n}`]), ['pieces', 'Pièces'], ['invites', 'Invités'], ['tous', 'Pour tous'], ['notes', 'Notes']];
    if (!onglets.some(([k]) => k === etat.onglet)) etat.onglet = 'role';
    const objectifs = (n) => `<section class="bloc bloc--objectifs"><h4>Objectifs de la manche ${n}</h4><ul class="objectifs objectifs--cases">${parties[n].objectifs.filter((o) => condition(o.si, presents)).map((o) => `
      <li><label><input type="checkbox" data-objectif="${o.id}"${etat.objectifs[o.id] ? ' checked' : ''}><span class="objectif__texte">${o.texte}</span></label><span class="objectif__points">${plur(o.points, 'pt')}</span></li>`).join('')}</ul></section>`;
    const sansObjectifs = (html) => html.replace(/<section class="bloc bloc--objectifs">[\s\S]*?<\/section>\s*$/, '');
    let corps = '';
    if (etat.onglet === 'role') corps = conditionner(sansObjectifs(parties[1].html), presents) + objectifs(1);
    else if (/^m\d$/.test(etat.onglet)) { const n = Number(etat.onglet[1]); corps = conditionner(sansObjectifs(parties[n].html), presents) + objectifs(n); }
    else if (etat.onglet === 'pieces') {
      corps = ouvertes.map((n) => `<h2 class="sous">Manche ${n}</h2><div class="liste-pieces">${(pieces[n]?.pieces ?? []).map((p) => `<button class="piece-bouton" data-action="piece" data-id="${p.id}"><span class="piece-bouton__no">${p.id.slice(1)}</span>${E(p.titre)}</button>`).join('')}</div>`).join('');
    } else if (etat.onglet === 'invites') {
      corps = `<ul class="invites">${pub0.personnages.filter((x) => presents.has(x.id)).map((x) => `<li${x.id === moi.id ? ' class="moi"' : ''}><div class="invites__nom">${E(nomPerso(x))}${joueurDe(x.id) ? ` <span>joué par ${E(joueurDe(x.id))}</span>` : ''}</div><div class="sur">${E(x.titre)} · ${x.age} ans</div><p>${x.presentation}</p></li>`).join('')}</ul>`;
    } else if (etat.onglet === 'tous') corps = conditionner(pub0.faits, presents) + pub0.regles;
    else corps = `<label class="notes"><span class="sur">Vos notes, gardées sur ce téléphone</span><textarea data-notes rows="16" placeholder="Qui ment ? Qui était où à 22 h 50 ?">${E(etat.notes)}</textarea></label>`;
    $app.innerHTML = `${entete(nomPerso(moi), `${d.titre} · livret secret`)}
      <div class="points-bandeau"><span>${E(moi.titre)}</span><span class="points">Mes points : <b>${total}</b></span></div>
      <nav class="onglets" role="tablist">${onglets.map(([k, t]) => `<button role="tab" aria-selected="${k === etat.onglet}" data-onglet="${k}">${t}</button>`).join('')}</nav>
      <article class="livret">${corps}</article>
      ${prochaine ? formCode(prochaine) : '<p class="aide">Toutes les manches sont ouvertes. Place au vote, sur la table.</p>'}`;
    $app.querySelector('.onglets [aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  $app.onclick = async (e) => {
    const o = e.target.closest('[data-onglet]');
    if (o) { etat.onglet = o.dataset.onglet; sauver(); modeJoueur(paquet); window.scrollTo(0, 0); return; }
    const p = e.target.closest('[data-action="piece"]');
    if (p) { const piece = ouvertes.flatMap((n) => pieces[n]?.pieces ?? []).find((x) => x.id === p.dataset.id); if (piece) montrerPiece(piece, presents); }
  };
  $app.onchange = (e) => {
    const c = e.target.closest('[data-objectif]');
    if (c) { etat.objectifs[c.dataset.objectif] = c.checked; sauver(); modeJoueur(paquet); }
  };
  $app.oninput = (e) => { if (e.target.matches('[data-notes]')) { etat.notes = e.target.value; sauver(); } };
  $app.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target.closest('[data-form="code"]');
    if (!f) return;
    const n = Number(f.dataset.n);
    const code = normaliserCode(f.code.value);
    const ok = await dechiffrer(await cleDeManche(paquet.k, code), d.roles[paquet.r][n]);
    if (!ok) { f.querySelector('.erreur').hidden = false; f.code.select(); return; }
    etat.codes[n] = code;
    etat.onglet = n === 1 ? 'role' : `m${n}`;
    sauver();
    await modeJoueur(paquet);
    window.scrollTo(0, 0);
  };
}

// ═════════════════════════════ MODE TABLE ═════════════════════════════
const CLE_TABLE = `pac:table:${SCENARIO}`;
const ETAPES = ['prologue', 'm1', 'm2', 'm3', 'accusation', 'vote', 'resultats', 'revelation', 'points', 'fin'];
const NOMS_ETAPES = { prologue: 'Prologue', m1: 'Manche 1', m2: 'Manche 2', m3: 'Manche 3', accusation: 'Accusation', vote: 'Vote', resultats: 'Résultats', revelation: 'Révélation', points: 'Points', fin: 'Fin' };
let table = null; // contenu déchiffré
let pub0 = null;

function etatTable() { return stock.lire(CLE_TABLE, null); }
function sauverTable(t) { stock.ecrire(CLE_TABLE, t); }

async function deverrouiller(code) {
  const d = await charger();
  const cle = await cleMaitresse(code, d.acces.sel, d.acces.iterations);
  const t = await dechiffrer(cle, d.table);
  if (!t) return false;
  table = t;
  pub0 = await dechiffrer(t.cles.pub, d.pub[0]);
  return true;
}

function lienJoueur(t, id) {
  const paquet = { v: 1, s: SCENARIO, r: id, k: table.cles.roles[id], p: table.cles.pub, c: t.cast, n: t.noms, e: t.evt || undefined };
  return `${base()}#j=${b64u.enc(new TextEncoder().encode(JSON.stringify(paquet)))}`;
}

function ecranAccueil() {
  const t = etatTable();
  $app.innerHTML = `${entete('La Dernière Paulée', 'Pièces à conviction · JEU-001')}
    <section class="carte"><p class="chapeau">Bourgogne, octobre 1961. Le vieil Auguste Vautrin devait faire une annonce au dessert. Il n'est jamais revenu de la cuverie.</p>
    <p>Une murder party de 6 à 10 joueurs. Ce téléphone servira de <b>table</b> : il distribue les rôles, affiche les codes des manches, recueille le vote et révèle la vérité.</p></section>
    ${t?.code ? `<button class="bouton bouton--signal bouton--plein" data-action="reprendre">Reprendre la soirée en cours</button>` : ''}
    <button class="bouton ${t?.code ? '' : 'bouton--signal '}bouton--plein" data-action="organiser">Organiser une soirée</button>
    <p class="aide">Vous êtes invité ? Ouvrez simplement le lien que votre hôte vous a envoyé.</p>`;
  $app.onclick = (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'organiser') ecranAcces();
    if (a === 'reprendre') reprendre();
  };
}

async function reprendre() {
  const t = etatTable();
  if (!t?.code || !(await deverrouiller(t.code))) return ecranAcces();
  if (t.etape != null) return ecranSoiree();
  if (t.cast?.length) return ecranInvitations();
  return ecranDistribution();
}

function ecranAcces(prerempli = '') {
  $app.innerHTML = `${entete('Code d\'accès', 'Organiser une soirée')}
    <form class="carte formulaire-app" data-form="acces">
      <label for="acces">Le code d'accès figure dans le fichier « Application de soirée » de votre kit.</label>
      <input id="acces" name="acces" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="PAULEE-XXXX-XXXX" value="${E(prerempli)}" required>
      <button class="bouton bouton--signal bouton--plein">Ouvrir le scénario</button>
      <p class="erreur" hidden>Ce code ne correspond pas. Vérifiez les tirets et les lettres.</p>
    </form>
    <button class="bouton bouton--discret" data-action="accueil">Retour</button>`;
  $app.onclick = (e) => { if (e.target.closest('[data-action="accueil"]')) ecranAccueil(); };
  $app.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const bouton = f.querySelector('button');
    bouton.disabled = true; bouton.textContent = 'Vérification…';
    const ok = await deverrouiller(f.acces.value);
    bouton.disabled = false; bouton.textContent = 'Ouvrir le scénario';
    if (!ok) { f.querySelector('.erreur').hidden = false; return; }
    const t = etatTable();
    sauverTable({ ...(t ?? {}), code: normaliserCode(f.acces.value) === normaliserCode(t?.code) ? t.code : f.acces.value, cast: t?.cast ?? pub0.personnages.filter((p) => p.essentiel).map((p) => p.id), noms: t?.noms ?? {} });
    ecranDistribution();
  };
}

function ecranDistribution() {
  const t = etatTable();
  const cast = new Set(t.cast);
  const persos = pub0.personnages;
  const n = cast.size;
  $app.innerHTML = `${entete('Distribution', `La Dernière Paulée · ${n} joueurs`)}
    <p class="texte">Les six premiers rôles sont essentiels. Ajoutez des rôles facultatifs jusqu'à dix joueurs, dans n'importe quel ordre, et notez qui joue quoi.</p>
    <form class="distribution" data-form="distribution">
      ${persos.map((p) => `<div class="role${cast.has(p.id) ? ' role--pris' : ''}">
        <label class="role__case"><input type="checkbox" name="r" value="${p.id}"${cast.has(p.id) ? ' checked' : ''}${p.essentiel ? ' disabled' : ''}>
          <span><b>${E(nomPerso(p))}</b><span class="sur">${E(p.titre)} · ${p.essentiel ? 'essentiel' : 'facultatif'}</span></span></label>
        <input class="role__joueur" name="nom-${p.id}" placeholder="Prénom du joueur" value="${E(t.noms[p.id] ?? '')}"${cast.has(p.id) ? '' : ' disabled'} aria-label="Joueur de ${E(nomPerso(p))}">
      </div>`).join('')}
      <label class="evt"><span class="sur">Date et lieu, affichés sur les invitations (facultatif)</span><input name="evt" maxlength="120" placeholder="Samedi 14 décembre, 20 h, chez Claire" value="${E(t.evt ?? '')}"></label>
      <button class="bouton bouton--signal bouton--plein">Préparer les invitations (${n} joueurs)</button>
    </form>`;
  const form = $app.querySelector('form');
  const lire = () => {
    const ids = persos.filter((p) => p.essentiel || form.querySelector(`input[value="${p.id}"]`).checked).map((p) => p.id);
    const noms = {};
    for (const p of persos) { const v = form[`nom-${p.id}`].value.trim(); if (v) noms[p.id] = v.slice(0, 40); }
    return { ids, noms, evt: form.evt.value.trim().slice(0, 120) };
  };
  $app.onchange = (e) => {
    if (e.target.name !== 'r') return;
    const { ids, noms, evt } = lire();
    sauverTable({ ...etatTable(), cast: ids, noms, evt });
    ecranDistribution();
  };
  $app.oninput = () => { const { ids, noms, evt } = lire(); sauverTable({ ...etatTable(), cast: ids, noms, evt }); };
  $app.onclick = null;
  $app.onsubmit = (e) => {
    e.preventDefault();
    const { ids, noms, evt } = lire();
    sauverTable({ ...etatTable(), cast: ids, noms: Object.fromEntries(Object.entries(noms).filter(([k]) => ids.includes(k))), evt });
    ecranInvitations();
  };
}

function ecranInvitations() {
  const t = etatTable();
  const persos = pub0.personnages.filter((p) => t.cast.includes(p.id));
  $app.innerHTML = `${entete('Invitations', `La Dernière Paulée · ${persos.length} joueurs`)}
    <p class="texte">Envoyez à chaque invité son lien personnel, par message ou en lui montrant le QR code. Il y découvrira son personnage et sa tenue ; son livret secret ne s'ouvrira que le soir venu, avec le code de la manche 1.</p>
    <ul class="invitations">${persos.map((p) => `<li>
      <div><b>${E(nomPerso(p))}</b><span class="sur">${E(t.noms[p.id] ? `pour ${t.noms[p.id]}` : p.titre)}</span></div>
      <div class="invitations__actions">
        <button class="bouton" data-action="partager" data-id="${p.id}">Envoyer</button>
        <button class="bouton bouton--discret" data-action="qr" data-id="${p.id}">QR</button></div></li>`).join('')}</ul>
    <button class="bouton bouton--signal bouton--plein" data-action="lancer">Commencer la soirée</button>
    <button class="bouton bouton--discret" data-action="distribution">Modifier la distribution</button>`;
  $app.onsubmit = null; $app.onchange = null; $app.oninput = null;
  $app.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'distribution') return ecranDistribution();
    if (a === 'lancer') { sauverTable({ ...etatTable(), etape: 0, votes: {}, points: {}, debut: {} }); return ecranSoiree(); }
    const p = persos.find((x) => x.id === b.dataset.id);
    const lien = lienJoueur(t, p.id);
    const qui = t.noms[p.id] ? `${t.noms[p.id]}, vous` : 'Vous';
    const message = `${qui} jouerez ${nomPerso(p)}, ${p.titre.toLowerCase()}, à la paulée du domaine Vautrin (murder party).${t.evt ? ` ${t.evt}.` : ''} Votre invitation et votre rôle : ${lien}`;
    if (a === 'qr') {
      ouvrirCalque(`<div class="qr"><div class="sur">Invitation de</div><div class="carte-perso__nom">${E(nomPerso(p))}</div>${qrSvg(lien)}
        <p>À scanner avec l'appareil photo du téléphone de ${E(t.noms[p.id] ?? 'l\'invité')}.</p></div>`);
      return;
    }
    if (navigator.share) {
      try { await navigator.share({ title: 'La Dernière Paulée', text: message }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(message); b.textContent = 'Copié'; setTimeout(() => { b.textContent = 'Envoyer'; }, 1800); } catch {
      ouvrirCalque(`<p class="texte">Copiez ce message et envoyez-le à ${E(t.noms[p.id] ?? 'l\'invité')} :</p><textarea class="a-copier" rows="8" readonly>${E(message)}</textarea>`);
    }
  };
}

function minuteur(t, cle, duree) {
  const debut = t.debut?.[cle];
  if (!debut) return `<div class="minuteur" data-minuteur="${cle}"><span class="minuteur__temps">${duree}:00</span><button class="bouton" data-action="minuteur" data-cle="${cle}">Lancer ${duree} min</button></div>`;
  const reste = Math.max(0, duree * 60 - Math.floor((Date.now() - debut) / 1000));
  return `<div class="minuteur${reste ? '' : ' minuteur--fini'}" data-minuteur="${cle}" data-fin="${debut + duree * 60000}"><span class="minuteur__temps">${String(Math.floor(reste / 60)).padStart(2, '0')}:${String(reste % 60).padStart(2, '0')}</span><button class="bouton bouton--discret" data-action="minuteur-raz" data-cle="${cle}">Remettre à zéro</button></div>`;
}
let horloge = null;
function animerMinuteurs() {
  clearInterval(horloge);
  horloge = setInterval(() => {
    for (const m of document.querySelectorAll('[data-fin]')) {
      const reste = Math.max(0, Math.round((Number(m.dataset.fin) - Date.now()) / 1000));
      m.querySelector('.minuteur__temps').textContent = `${String(Math.floor(reste / 60)).padStart(2, '0')}:${String(reste % 60).padStart(2, '0')}`;
      if (!reste && !m.classList.contains('minuteur--fini')) { m.classList.add('minuteur--fini'); navigator.vibrate?.(400); }
    }
  }, 1000);
}

function resultatVote(t) {
  const compte = {};
  for (const v of Object.values(t.votes ?? {})) compte[v] = (compte[v] ?? 0) + 1;
  const tri = Object.entries(compte).sort((a, b) => b[1] - a[1]);
  const designe = tri.length && (tri.length === 1 || tri[0][1] > tri[1][1]) ? tri[0][0] : null;
  return { compte, tri, designe };
}

function ecranSoiree() {
  const t = etatTable();
  const presents = new Set(t.cast);
  const persos = pub0.personnages.filter((p) => presents.has(p.id));
  const etape = ETAPES[t.etape] ?? 'prologue';
  const C = (h) => conditionner(h, presents);
  const pieceBoutons = (ids) => `<div class="liste-pieces">${ids.map((id) => table.pieces.find((p) => p.id === id)).map((p) => `<button class="piece-bouton" data-action="piece" data-id="${p.id}"><span class="piece-bouton__no">${p.id.slice(1)}</span>${E(p.titre)}</button>`).join('')}</div>`;
  const joueur = (id) => t.noms[id] ? ` <span class="joue-par">${E(t.noms[id])}</span>` : '';
  let corps = '';
  let suivant = 'Continuer';

  if (etape === 'prologue') {
    corps = `<p class="sur">À lire à voix haute</p><div class="lire">${C(table.prologue)}</div>
      <p class="texte">Puis chacun saisit sur son téléphone le code de la manche 1, et prend dix minutes pour lire son livret.</p>`;
    suivant = 'Manche 1';
  } else if (/^m\d$/.test(etape)) {
    const m = table.manches[Number(etape[1]) - 1];
    corps = `<div class="code-geant"><span class="sur">Code de la manche ${m.n}</span><strong>${E(table.codes[m.n])}</strong></div>
      ${minuteur(t, etape, m.duree)}
      <p class="sur">À lire à voix haute</p><div class="lire">${C(m.annonce)}</div>
      <h2 class="sous">Pièces à conviction</h2><p class="texte">Elles s'ouvrent aussi sur chaque téléphone avec le code.</p>${pieceBoutons(m.pieces)}
      <details class="relance"><summary>Si l'enquête cale</summary><p class="texte">Au bout de vingt minutes, si la table tourne en rond, posez cette question à voix haute : <b>${m.relance}</b></p></details>`;
    suivant = m.n < 3 ? `Manche ${m.n + 1}` : 'Accusation';
  } else if (etape === 'accusation') {
    corps = `<p class="sur">À lire à voix haute</p><div class="lire">${C(table.accusation.annonce)}</div>`;
    suivant = 'Passer au vote';
  } else if (etape === 'vote') {
    const restants = persos.filter((p) => !t.votes?.[p.id]);
    const votant = restants[0];
    if (votant && t.voteEnCours !== votant.id) {
      corps = `<div class="passe"><span class="sur">Vote secret · ${persos.length - restants.length + 1} sur ${persos.length}</span>
        <p>Passez la table à</p><div class="carte-perso__nom">${E(nomPerso(votant))}</div>${t.noms[votant.id] ? `<p class="joue-par">${E(t.noms[votant.id])}</p>` : ''}
        <button class="bouton bouton--signal bouton--plein" data-action="c-est-moi" data-id="${votant.id}">C'est moi : je vote</button></div>`;
      suivant = null;
    } else if (votant) {
      corps = `<p class="sur">${E(nomPerso(votant))}, en secret</p><h2 class="question">${E(table.accusation.question)}</h2>
        <div class="choix">${persos.map((p) => `<button class="bouton" data-action="voter" data-id="${p.id}">${E(nomPerso(p))}</button>`).join('')}</div>`;
      suivant = null;
    } else {
      corps = `<div class="passe"><p>Tout le monde a voté.</p><p class="texte">Reprenez la table, puis découvrez le résultat.</p></div>`;
      suivant = 'Dépouiller';
    }
  } else if (etape === 'resultats') {
    const { tri, designe } = resultatVote(t);
    const max = tri[0]?.[1] ?? 1;
    corps = `<h2 class="question">Le dépouillement</h2><ul class="barres">${tri.map(([id, v]) => {
      const p = pub0.personnages.find((x) => x.id === id);
      return `<li><span>${E(nomPerso(p))}</span><span class="barre"><span style="width:${(v / max) * 100}%"></span></span><b>${v}</b></li>`;
    }).join('')}</ul>
      <p class="texte">${designe ? `La table accuse <b>${E(nomPerso(pub0.personnages.find((x) => x.id === designe)))}</b>.` : 'Égalité en tête : personne n\'est désigné.'}</p>`;
    suivant = 'La vérité';
  } else if (etape === 'revelation') {
    const c = pub0.personnages.find((x) => x.id === table.coupable);
    const vu = t.revele;
    corps = vu ? `<div class="verdict"><span class="sur">L'assassin d'Auguste Vautrin</span><div class="verdict__nom">${E(nomPerso(c))}</div>${joueur(c.id)}</div>
      <p class="texte">${table.solution.resume}</p>
      <h2 class="sous">${E(table.solution.aveuxTitre)}</h2><div class="lire">${C(table.solution.aveux)}</div>
      <h2 class="sous">Comment le trouver</h2><ol class="chaine">${table.solution.chaine.map((e) => `<li><b>${E(e.titre)}</b><p>${C(e.html)}</p>${e.pieces.length ? pieceBoutons(e.pieces) : ''}</li>`).join('')}</ol>
      <h2 class="sous">Épilogue</h2><div class="lire">${C(table.solution.epilogue)}</div>`
      : `<div class="passe"><p>Tout le monde est prêt ?</p><button class="bouton bouton--signal bouton--plein" data-action="reveler">Révéler l'assassin</button></div>`;
    suivant = vu ? 'Compter les points' : null;
  } else if (etape === 'points') {
    const { designe } = resultatVote(t);
    corps = `<p class="texte">Chacun lit sur son téléphone le total de ses objectifs atteints (« Mes points »). Saisissez-le ici : le bonus de vote s'ajoute tout seul.</p>
      <div class="lire">${table.points}</div>
      <form class="scores">${persos.map((p) => {
        const bonus = p.id !== table.coupable && t.votes?.[p.id] === table.coupable ? 3 : 0;
        return `<label><span>${E(p.prenom)}${t.noms[p.id] ? ` <i>${E(t.noms[p.id])}</i>` : ''}</span><input type="number" inputmode="numeric" min="0" max="30" data-score="${p.id}" value="${t.points?.[p.id] ?? ''}" placeholder="0"><span class="bonus">${bonus ? '+3 vote' : ''}</span></label>`;
      }).join('')}</form>
      <p class="aide">${designe === table.coupable ? 'L\'assassin a été démasqué.' : 'L\'assassin n\'a pas été désigné : son objectif à 5 points est atteint, il le compte dans son total (une seule fois).'}</p>`;
    suivant = 'Classement';
  } else {
    const scores = persos.map((p) => ({ p, s: Number(t.points?.[p.id] || 0) + (p.id !== table.coupable && t.votes?.[p.id] === table.coupable ? 3 : 0), juste: t.votes?.[p.id] === table.coupable }))
      .sort((a, b) => b.s - a.s || b.juste - a.juste);
    // Ex aequo : même score et même vote, même rang.
    const rang = (i) => scores.findIndex((x) => x.s === scores[i].s && x.juste === scores[i].juste) + 1;
    corps = `<h2 class="question">Classement</h2><ol class="classement">${scores.map(({ p, s }, i) => `<li${rang(i) === 1 ? ' class="premier"' : ''}><i>${rang(i)}.</i><span>${E(nomPerso(p))}${joueur(p.id)}</span><b>${plur(s, 'pt')}</b></li>`).join('')}</ol>
      <p class="texte">Merci d'avoir joué à <b>La Dernière Paulée</b>.</p>
      <button class="bouton bouton--discret bouton--plein" data-action="nouvelle">Effacer et préparer une nouvelle soirée</button>`;
    suivant = null;
  }

  $app.innerHTML = `${entete(NOMS_ETAPES[etape], `La Dernière Paulée · table · ${persos.length} joueurs`)}
    <nav class="frise" aria-label="Étapes">${ETAPES.map((k, i) => `<span class="${i < t.etape ? 'fait' : i === t.etape ? 'ici' : ''}" title="${NOMS_ETAPES[k]}"></span>`).join('')}</nav>
    <article class="livret">${corps}</article>
    <div class="navigation">${t.etape > 0 && etape !== 'vote' ? '<button class="bouton bouton--discret" data-action="precedent">Retour</button>' : '<span></span>'}
      ${suivant ? `<button class="bouton bouton--signal" data-action="suivant">${suivant}</button>` : ''}</div>`;
  animerMinuteurs();

  $app.onsubmit = (e) => e.preventDefault();
  $app.oninput = (e) => {
    const s = e.target.closest('[data-score]');
    if (s) { const tt = etatTable(); tt.points = { ...tt.points, [s.dataset.score]: s.value }; sauverTable(tt); }
  };
  $app.onchange = null;
  $app.onclick = (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const tt = etatTable();
    const a = b.dataset.action;
    if (a === 'piece') return montrerPiece(table.pieces.find((p) => p.id === b.dataset.id), presents);
    if (a === 'suivant') { tt.etape = Math.min(ETAPES.length - 1, tt.etape + 1); }
    if (a === 'precedent') { tt.etape = Math.max(0, tt.etape - 1); if (ETAPES[tt.etape] === 'vote') { tt.votes = {}; tt.voteEnCours = null; } }
    if (a === 'minuteur') tt.debut = { ...tt.debut, [b.dataset.cle]: Date.now() };
    if (a === 'minuteur-raz') { tt.debut = { ...tt.debut }; delete tt.debut[b.dataset.cle]; }
    if (a === 'c-est-moi') tt.voteEnCours = b.dataset.id;
    if (a === 'voter') { tt.votes = { ...tt.votes, [tt.voteEnCours]: b.dataset.id }; tt.voteEnCours = null; }
    if (a === 'reveler') tt.revele = true;
    if (a === 'nouvelle') {
      if (!confirm('Effacer cette soirée (distribution, votes, points) ?')) return;
      sauverTable({ code: tt.code, cast: tt.cast, noms: {}, evt: '' });
      return ecranDistribution();
    }
    sauverTable(tt);
    ecranSoiree();
    if (['suivant', 'precedent'].includes(a)) window.scrollTo(0, 0);
  };
}

// ═════════════════════════════ Démarrage ═════════════════════════════
async function demarrer() {
  const h = location.hash.slice(1);
  const params = new URLSearchParams(h);
  try {
    if (params.get('j')) {
      const paquet = lirePaquet(params.get('j'));
      if (!paquet) { $app.innerHTML = `${entete('Lien abîmé')}<p class="texte">Ce lien d'invitation est incomplet. Demandez à votre hôte de vous le renvoyer.</p>`; return; }
      await modeJoueur(paquet);
    } else if (params.get('acces')) {
      await charger();
      const code = params.get('acces');
      history.replaceState(null, '', base());
      ecranAcces(code);
    } else {
      await charger();
      ecranAccueil();
    }
  } catch (err) {
    $app.innerHTML = `${entete('Oups')}<p class="texte">L'application n'a pas pu se charger (${E(err.message)}). Vérifiez votre connexion pour la première ouverture ; ensuite, elle fonctionne hors ligne.</p>`;
  }
}

// Typographie française sur tout texte affiché : apostrophe courbe, espace insécable avant « ; : ! ? ».
// Seuls les nœuds texte sont touchés : jamais les attributs, ni le contenu des champs de saisie.
function typographier(racine) {
  const marche = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest('textarea, input, script, style, svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let n = marche.nextNode(); n; n = marche.nextNode()) {
    const v = n.nodeValue.replace(/'/g, '\u2019').replace(/ :/g, '\u00A0:').replace(/ ([;!?])/g, '\u202F$1');
    if (v !== n.nodeValue) n.nodeValue = v;
  }
}
for (const r of [$app, $calque]) new MutationObserver(() => typographier(r)).observe(r, { childList: true, subtree: true });

window.addEventListener('hashchange', () => { fermerCalque(); demarrer(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
demarrer();
