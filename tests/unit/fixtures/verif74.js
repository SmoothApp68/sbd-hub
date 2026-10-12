const dir=require('path').resolve(process.argv[2]); const fs=require('fs');
require(dir+'/modele.js'); require(dir+'/palier.js'); require(dir+'/profil.js'); const M=require(dir+'/moteur.js');
const d=JSON.parse(fs.readFileSync(process.argv[3],'utf8')); const champ=process.argv[4]||'aujourdhui_main';
let ec=0;
for (const c of d.cas){
  const ss=d.exercices[c.cle].seances.map(g=>({seance:{id:g.id,debut:g.debut,fin:g.fin},series:g.series.map(([rang,type,ch,reps,rpe,res,dl])=>({id:g.id+rang,rang,type_serie:type,charge_kg:ch,reps,rpe,ressenti:res,douleur:dl,validee_a:g.debut}))}));
  const mesure=ss.some(g=>g.series.some(s=>s.type_serie==='travail'&&s.charge_kg!==null))?'charge_reps':'reps';
  const avant=new Date(new Date(ss[c.jusqua].seance.debut).getTime()+86400000*3).toISOString();
  const r=M.consigneDExercice(ss.slice(0,c.jusqua+1),null,avant,{mesure,reglage:c.cle.startsWith('u1')?'franc':'normal'}).consigne;
  const x={etat:r.etat,zone:r.zone,palier:r.palier,niveau:r.niveau,ligne:r.ligne,haut:r.haut&&{charge:r.haut.charge,vise:r.haut.vise,k:r.haut.k}};
  if (JSON.stringify(x)!==JSON.stringify(c[champ])) ec++;
}
console.log('écarts', ec, 'sur', d.cas.length);
