// 179 (audit B-H1) — « une douleur ne part JAMAIS chez le modèle » : deux ensembles (parties du corps × symptômes ou « autre chose
// qu'un mot de séance ») et des expressions qui coupent seules. 30 tournures écrites naturellement doivent couper, 15 questions de
// charge ne doivent pas. Les deux copies (la fonction et le téléphone) donnent le même verdict.
const C = require('../../supabase/functions/demander-coach/controle.js');
const A = require('../../v2/js/assistant.js');
const fs = require('fs');
const path = require('path');

const COUPENT = [
  'j’ai un souci à l’épaule', 'mon dos me tue sur le soulevé de terre', 'ça me fait des fourmis dans la main',
  'j’ai un truc qui tire dans le bas du dos', 'mon poignet est sensible', 'mon tendon me lâche', 'ça me crispe dans le trapèze',
  'mon genou fait un bruit bizarre', 'ma hanche me gêne en bas du squat', 'j’ai les doigts engourdis', 'mon coude chauffe et gonfle',
  'ma cheville est faible depuis la semaine dernière', 'mon épaule ?', 'mes lombaires tirent après la séance',
  'mon biceps a lâché hier au curl', 'j’ai peur pour mon dos', 'les pieds qui fourmillent', 'ça me tire dans la cuisse',
  'mon mollet est raide et dur', 'un problème au genou', 'mon pouce craque', 'mon épaule est pas normale au développé couché',
  'j’ai un souci physique', 'ça me tue les épaules', 'mon ischio a un truc, je fais quoi', 'je me fais mal au poignet',
  'peur de me faire mal au dos avec 180 kg', 'ma nuque est bloquée', 'je boite depuis hier', 'mes mains se crispent sur la barre',
  'mon genou n’est pas bien sur la presse à cuisses'
];
const NE_COUPENT_PAS = [
  'Pourquoi 20 kg au développé épaules ?', 'pourquoi le tirage horizontal à 60 kg', 'je tire la barre vers moi, pourquoi 3 séries ?',
  'tirer la barre jusqu’à la poitrine, combien de reps ?', 'Pourquoi l’extension mollets debout reste à 130,4 kg ?',
  'pourquoi un cran de plus aux élévations latérales ?', 'curl biceps barre EZ : pourquoi 30 kg × 10 ?',
  'pourquoi le relevé de jambes passe à 12 reps ?', 'Pourquoi 4 séries de dips ?', 'écarté poulie : pourquoi pas 22,5 kg ?',
  'pourquoi la presse à cuisses à 220 kg et pas 230 ?', 'Pourquoi tu me fais le squat avant le soulevé de terre ?',
  'développé militaire : je passe à quelle charge ?', 'Pourquoi pas une rep de plus aux tractions ?', 'tirage vertical, poignets en supination, quelle charge ?'
];

describe('179 — B-H1 : la santé, deux ensembles', () => {
  test.each(COUPENT)('coupe : %s', (q) => { expect(C.estSante(q)).toBe(true); expect(A.estSante(q)).toBe(true); });
  test.each(NE_COUPENT_PAS)('ne coupe pas : %s', (q) => { expect(C.estSante(q)).toBe(false); expect(A.estSante(q)).toBe(false); });
  test('les 30 tournures et les 15 questions de charge sont comptées', () => {
    expect(COUPENT.length).toBeGreaterThanOrEqual(30);
    expect(NE_COUPENT_PAS.length).toBeGreaterThanOrEqual(15);
  });
  test('DISCRIMINANT — les ensembles du téléphone et de la fonction sont identiques', () => {
    ['MOTIFS_SANTE', 'PARTIES_CORPS', 'SYMPTOMES', 'MOTS_DE_SEANCE', 'NOMS_EXERCICES'].forEach((k) => {
      expect(A[k]).toEqual(C[k]);
      expect(A[k]).toBeTruthy();
    });
    COUPENT.concat(NE_COUPENT_PAS).forEach((q) => expect(A.estSante(q)).toBe(C.estSante(q)));
  });
  test('la consigne du modèle porte le repli : une question qui parle du corps renvoie vers « J’ai mal »', () => {
    const index = fs.readFileSync(path.join(__dirname, '../../supabase/functions/demander-coach/index.ts'), 'utf8');
    const consigne = index.slice(index.indexOf('const CONSIGNE'), index.indexOf('function entetes'));
    expect(consigne).toMatch(/corps/);
    expect(consigne).toMatch(/J\\'ai mal/);
  });
});
