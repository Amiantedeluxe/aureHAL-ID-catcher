# auréHAL-ID-catcher

### Id_Catcher.js :

Le code indenté avec commentaires. S'utilise depuis une fiche auteur dans AuréHAL.

### Id_Catcher_tocopy.js :

Le même code en une seule ligne pour faciliter la copie dans le marque-page sur navigateur.

## Installation :
 
	1. Créer un nouveau favori dans le navigateur (ou marque-page sur Firefox)
	2. Sur le favori, faire clic droit > "modifier…" (ou "modifier le marque-page" sur Firefox)
	3. Dans la case "URL", coller le script puis enregistrer
	4. Une fois sur une page auteur dans AuréHAL, cliquer sur le favori pour exécuter le script

## Fonctionnement :

	1. Le script récupère le nom de l'auteur depuis la page auréhal
	2. Fait une requête API IdRef et ORCID a partir du nom
	3. Affiche les candidats dans une popup sous forme de cartes : nom, métier, dates de vie et genre (lus dans la notice IdRef), biographie, affiliation(s), et les identifiants (IdRef / ORCID / IdHAL) en pastilles colorées avec lien et bouton de copie.
	4. Aides au tri : les candidats dont le nom correspond exactement à l'auteur recherché sont remontés en tête et marqués « ✓ nom exact » ; un candidat IdRef dont l'ORCID figure aussi dans la section ORCID est signalé pour éviter les doublons.

<img width="1522" height="848" alt="Capture d&#39;écran 2026-02-05 183627" src="https://github.com/user-attachments/assets/803afe4e-c998-4603-b5ea-26717f043a51" />

