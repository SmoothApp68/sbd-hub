import sys; sys.argv=['x']
from banc_etage2 import *
from collections import defaultdict
import statistics

def couples(f):
    seances=charger(f); etats=etats_exercices(seances); d=defaultdict(list)
    for s in seances:
        p,series,e=analyse(s,etats.get(s['exo']))
        ret=[x for x in series if x['role']=='travail']
        if p is None or not ret: continue
        au=[x['reps'] for x in ret if x['kg']==p]
        if au: d[(s['exo'],format_seance(ret))].append({'kg':p,'reps':au})
    return d

def e1rm(kg,r): return kg*(1+r/30.0)

def evalue(C,fn,kmin=4):
    """fn(etat, seance) -> bool. etat contient l'historique deja vu (lecture chronologique)."""
    out={}
    for f,d in C.items():
        vp=fp=fn_=vn=0
        for cle,v in d.items():
            if len(v)<kmin: continue
            med=int(statistics.median([x['reps'][0] for x in v]))
            etat={'med':med,'hist':[],'best_par_kg':{},'best_e1rm':0,'depuis':0,'monte_prec':False}
            for i in range(len(v)-1):
                s=v[i]
                dit=fn(etat,s)
                fait=v[i+1]['kg']>s['kg']
                if dit and fait: vp+=1
                elif dit: fp+=1
                elif fait: fn_+=1
                else: vn+=1
                # mise a jour de l'etat APRES la decision
                b=etat['best_par_kg'].get(s['kg'],0)
                etat['best_par_kg'][s['kg']]=max(b,max(s['reps']))
                etat['best_e1rm']=max(etat['best_e1rm'],max(e1rm(s['kg'],r) for r in s['reps']))
                etat['depuis']=0 if (etat['hist'] and etat['hist'][-1]['kg']!=s['kg']) else etat['depuis']+1
                etat['monte_prec']=bool(etat['hist']) and s['kg']>etat['hist'][-1]['kg']
                etat['hist'].append(s)
            n=vp+fp+fn_+vn
        out[f]=(vp,fp,fn_,vn)
    return out

def ligne(nom,res):
    parts=[]
    for f,(vp,fp,fn_,vn) in res.items():
        n=vp+fp+fn_+vn
        taux=(vp+fp)/n if n else 0
        prec=vp/(vp+fp) if vp+fp else float('nan')
        base=(vp+fn_)/n if n else 0
        gain=prec-base
        parts.append(f'{taux:>4.0%}/{prec:>4.0%}{"":1}({gain:+.0%})')
    print(f'{nom:<34}', ' '.join(parts))
