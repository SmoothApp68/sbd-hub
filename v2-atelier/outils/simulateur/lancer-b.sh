#!/bin/bash
# Niveau B : les 12 profils prioritaires (AUDIT-PLAN §8), un après l'autre (un seul navigateur à la fois), graine 1, 16 semaines.
cd "$(dirname "$0")"
for p in X15 X03 X07 X09 X10 X01 X05 X18 X14 X11 P03 P04; do
  node pilote-app.js --profils $p --semaines 16 --graine 1 --sortie /home/claude/nuit/audit-fil/simulation-B >> /home/claude/nuit/audit-fil/simulation-B.log 2>&1
done
echo FINI >> /home/claude/nuit/audit-fil/simulation-B.log
