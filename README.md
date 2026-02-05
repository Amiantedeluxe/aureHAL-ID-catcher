# auréHAL-ID-catcher

### Bookmarklet.js :

Le code indenté avec commentaires. Fonctionne à al fois dans l'interface HAL classique et dans l'interface de modération, y compris sur les dépôts non encore indexés.

### Bookmarklet_to_copy.js :

Le même code en une seule ligne pour faciliter la copie dans le marque-page sur navigateur

## Installation :
 
	1. Créer un nouveau favori dans le navigateur (ou marque-page sur Firefox)
	2. Sur le favori, faire clic droit > "modifier…" (ou "modifier le marque-page" sur Firefox)
	3. Dans la case "URL", coller le script puis enregistrer
	4. Une fois sur la page d'un dépôt HAL, cliquer sur le favori pour exécuter le script

## Fonctionnement :

	1. Le script récupère les métadonnées de la notice HAL ouverte (doi + titre)
	2. Fait une requête API sur le doi et sur les 12 premiers mots du titre
	3. Exclut la notice courante et les notices avec un doi strictement différent des résultats
	4. Affiche les doublons potentiels dans une fenêtre flottante, avec liens cliquables, titre et doi

<img width="1092" height="435" alt="Capture d&#39;écran 2025-11-28 103045" src="https://github.com/user-attachments/assets/32b8e174-fca6-4ff6-9609-d9e41edca859" />

