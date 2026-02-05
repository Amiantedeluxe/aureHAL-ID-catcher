# auréHAL-ID-catcher

### Bookmarklet.js :

Le code indenté avec commentaires. S'utilise depuis une fiche auteur dans AuréHAL.

### Bookmarklet_to_copy.js :

Le même code en une seule ligne pour faciliter la copie dans le marque-page sur navigateur.

## Installation :
 
	1. Créer un nouveau favori dans le navigateur (ou marque-page sur Firefox)
	2. Sur le favori, faire clic droit > "modifier…" (ou "modifier le marque-page" sur Firefox)
	3. Dans la case "URL", coller le script puis enregistrer
	4. Une fois sur une page auteur dans AuréHAL, cliquer sur le favori pour exécuter le script

## Fonctionnement :

	1. Le script récupère le nom de l'auteur depuis la page auréhal
	2. Fait une requête API IdRef et ORCID a partir du nom
	3. Affiche les Ids des candidats dans une popup avec leur nom, description idRef, lien vers les pages IdRef et ORCID, et bouton pour rapidement copier l'ID.

<img width="1522" height="848" alt="Capture d&#39;écran 2026-02-05 183627" src="https://github.com/user-attachments/assets/803afe4e-c998-4603-b5ea-26717f043a51" />

