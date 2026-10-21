# Audit 3b — Sécurité

## Clés API exposées

| Clé | Fichier | Type | Risque |
|---|---|---|---|
| `SUPABASE_KEY = 'sb_publishable_...'` | supabase.js:9 | Anon/publishable | ✅ Normal — clé publique par design Supabase |
| `SUPABASE_URL` | supabase.js:8 | URL projet | ✅ Normal |

Aucune clé `service_role` ou secret en dur. Aucun `sk-` (OpenAI). ✅

## XSS

### 🟠 profile.username interpolé sans escapeHtml — 10+ occurrences (supabase.js)

Exemples : l.1665, 1851, 2474, 2530, 2930, 4041.

**Mitigé** par validation client `/^[a-zA-Z0-9_]+$/` (supabase.js:968, 3245) — les chars HTML sont structurellement impossibles dans un username valide.  
**Risque résiduel** : si la validation serveur est absente ou contournée, le XSS devient immédiat pour tous les visiteurs du profil.  
**Reco** : ajouter `escapeHtml()` systématiquement sur `profile.username` dans les templates, en complément de la validation.

### 🟡 weekIntention interpolé sans escape (app.js:9367)

```js
'<div class="be-prog-sub">' + intention + '</div>'
```
`intention` vient de `prompt()` → `db.user.weekIntention`. Self-XSS uniquement (donnée locale de l'utilisateur), pas de vecteur cross-user. Sévérité faible.

### 🟡 err.message dans innerHTML (app.js:737)

```js
preview.innerHTML = '❌ Fichier invalide : ' + err.message;
```
Contexte : import JSON. `err.message` est généré par le JS natif (`JSON.parse`), pas directement par le fichier. Risque très faible.

### ✅ Données sociales sensibles (bio, commentaires) — correctement échappées

`escapeHtml()` utilisée sur : `username` (commentaires), `bio`, `training_status`, `comment.text`, usernames dans les boutons de défi.

## RLS Supabase

| Table | SELECT | INSERT | UPDATE | DELETE | Verdict |
|---|---|---|---|---|---|
| `sbd_profiles` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | — | ✅ |
| `profiles` | `deleted_at IS NULL AND NOT is_blocked()` | `id = auth.uid()` | `id = auth.uid()` | — | ✅ |
| `activity_feed` | amis + non bloqué | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | ✅ |
| `leaderboard_snapshots` | amis + soi-même | `user_id = auth.uid()` | — | — | ✅ |
| `friendships` | `requester_id OR target_id = auth.uid()` | `requester_id = auth.uid()` | requester OR target | requester OR target | ✅ |
| `notifications` | `user_id = auth.uid()` | `WITH CHECK (TRUE)` ⚠️ | `user_id = auth.uid()` | `user_id = auth.uid()` | 🟠 |
| `invite_codes` | `USING (TRUE)` | `user_id = auth.uid()` | `USING (TRUE)` ⚠️ | — | 🔴 |
| `reserved_usernames` | `USING (TRUE)` | `WITH CHECK (TRUE)` ⚠️ | — | `USING (TRUE)` ⚠️ | 🔴 |

### 🔴 invite_codes UPDATE sans restriction (`USING (TRUE)`)

N'importe quel utilisateur authentifié peut modifier n'importe quel code d'invitation (ex. le marquer `used_by = soi-même`). Risque : abus du système de parrainage.  
**Reco** : `USING (user_id = auth.uid() OR used_by = auth.uid())`

### 🔴 reserved_usernames INSERT/DELETE sans restriction

Tout utilisateur authentifié peut insérer ou supprimer des noms réservés. Risque : pollution de la liste ou libération de noms réservés (marques, admins…).  
**Reco** : restreindre à `service_role` uniquement via trigger — retirer les policies permissives.

### 🟠 notifications INSERT (`WITH CHECK (TRUE)`)

Tout utilisateur peut insérer une notification pour n'importe quelle `user_id`. Risque : spam de notifications.  
**Reco** : `WITH CHECK (user_id IN (SELECT target_id FROM friendships WHERE requester_id = auth.uid()))` ou passer par un trigger.

## console.log avec données sensibles

Aucun `console.log` avec `user.email`, `auth`, `token` ou `session` trouvé dans supabase.js. ✅
