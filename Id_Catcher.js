javascript:(async () => {
    // Fonction pour créer et afficher une popup
    function c(m) {
        let d = document.createElement('div');
        d.style.position = 'fixed';
        d.style.top = '20px';
        d.style.right = '20px';
        d.style.backgroundColor = 'white';
        d.style.border = '2px solid #444';
        d.style.padding = '10px';
        d.style.zIndex = 9999;
        d.style.maxHeight = '70%';
        d.style.overflowY = 'auto';
        d.style.width = '520px';
        d.style.fontFamily = 'sans-serif';
        d.innerHTML = m;
        
        // Bouton de fermeture
        let b = document.createElement('button');
        b.textContent = 'Fermer';
        b.style.marginTop = '10px';
        b.onclick = function() { d.remove() };
        d.appendChild(b);
        document.body.appendChild(d);
    }

    try {
        // Extraction de l'ID auteur depuis l'URL
        let idAur = window.location.pathname.split('/').pop();
        let nomTrouve = '';
        
        // Recherche du nom de l'auteur dans les en-têtes h3
        let header = document.querySelector('h3.mb-4') || 
                     Array.from(document.querySelectorAll('h3')).find(h =>
                         /Modifications des informations de/i.test(h.innerText) ||
                         /Auteur\s*:/i.test(h.innerText) ||
                         /Création d'un auteur identifié/i.test(h.innerText)
                     );
        
        if (header) {
            let t = header.innerText.trim();
            let m = t.match(/Auteur\s*:\s*(.+)/i) || 
                    t.match(/Modifications des informations de\s+(.+)/i);
            
            if (m) nomTrouve = m[1].trim();
            
            // Cas spécial : création d'auteur
            if (!nomTrouve && /Création d'un auteur identifié/i.test(t)) {
                let li = document.querySelector('#sortable-form li[data-firstname][data-lastname]');
                if (li) {
                    let fn = li.getAttribute('data-firstname') || '';
                    let ln = li.getAttribute('data-lastname') || '';
                    nomTrouve = `${fn} ${ln}`.trim();
                }
            }
        }

        // Fallback : recherche via l'API HAL si le nom n'a pas été trouvé
        if (!nomTrouve) {
            try {
                let urlHal = `https://api.archives-ouvertes.fr/search/?q=authIdPerson_i:${idAur}&fl=authFullName_s,authIdPerson_i&rows=50&wt=json`;
                let r = await fetch(urlHal);
                let data = await r.json();
                
                if (data.response && data.response.docs && data.response.docs.length) {
                    for (const doc of data.response.docs) {
                        let ids = doc.authIdPerson_i || [];
                        if (!Array.isArray(ids)) ids = [ids];
                        let names = doc.authFullName_s || [];
                        
                        for (let i = 0; i < ids.length; i++) {
                            if (String(ids[i]) === String(idAur)) {
                                nomTrouve = names[i];
                                break;
                            }
                        }
                        if (nomTrouve) break;
                    }
                }
            } catch (e) {}
        }

        // Vérification que le nom a été trouvé
        if (!nomTrouve) {
            c("<b>Impossible de déterminer le nom de l'auteur.</b>");
            return;
        }

        // Séparation prénom/nom
        let parts = nomTrouve.split(/\s+/);
        let prenom = parts.shift() || '';
        let nom = parts.join(' ') || '';

        // Début de la construction du HTML de résultat
        let html = `<div style="padding:6px;"><b>Résultats pour ${nomTrouve} :</b>`;

        // URLs de recherche pour IdRef et ORCID
        let qUrl = `https://www.idref.fr/Sru/Solr?q=persname_t:(${encodeURIComponent(nom)} AND ${encodeURIComponent(prenom)})&fl=id,ppn_z,affcourt_z,recordtype_z&rows=20&wt=json`;
        let orcidUrl = `https://pub.orcid.org/v3.0/search/?q=family-name:${encodeURIComponent(nom)}+AND+given-names:${encodeURIComponent(prenom)}&rows=8`;

        // Requêtes parallèles vers IdRef et ORCID
        let [r2, r3] = await Promise.all([
            fetch(qUrl),
            fetch(orcidUrl, { headers: { 'Accept': 'application/json' } })
        ]);

        let txt = await r2.text();
        let idrefOk = txt.trim().startsWith('{');
        let orcidData = null;
        try {
            orcidData = await r3.json();
        } catch (e) {}

        // === Section IdRef ===
        html += `<div style="margin-top:10px;">
                   <h3 style="background:#E3F2FD;padding:6px;margin:0;">📚 IdRef</h3>
                   <ul style="padding-left:14px;margin-top:8px;">`;

        if (idrefOk) {
            let res = JSON.parse(txt);
            if (res.response && res.response.docs && res.response.docs.length) {
                // Pour chaque résultat IdRef
                for (const x of res.response.docs) {
                    let ppn = x.ppn_z || x.id;
                    let lien = `https://www.idref.fr/${ppn}`;
                    let lib = x.affcourt_z || x.recordtype_z || ppn;
                    let bioHtml = '';
                    let orcidHtml = '';

                    // Récupération des détails (bio + ORCID) depuis l'API JSON d'IdRef
                    try {
                        let jRes = await fetch(`https://www.idref.fr/${ppn}.json`);
                        let jData = await jRes.json();
                        
                        if (jData && jData.record && Array.isArray(jData.record.datafield)) {
                            // Recherche du champ biographie (tag 340)
                            let bioField = jData.record.datafield.find(f => f.tag === 340 || f.tag === "340");
                            if (bioField && bioField.subfield) {
                                let subs = Array.isArray(bioField.subfield) ? bioField.subfield : [bioField.subfield];
                                let bioSub = subs.find(s => s.code === "a" || s.code == "a");
                                if (bioSub && bioSub.content) {
                                    let bio = bioSub.content;
                                    let bioShort = bio.length > 100 ? bio.substring(0, 100) + '...' : bio;
                                    bioHtml = `<div style="margin-top:3px;font-size:12px;color:#555;font-style:italic;cursor:help;" title="${bio.replace(/"/g, '&quot;')}">${bioShort}</div>`;
                                }
                            }

                            // Recherche du champ ORCID (tag 035 avec code 2 = ORCID)
                            let orcidField = jData.record.datafield
                                .filter(f => f.tag === "035" || f.tag === 35)
                                .find(f => {
                                    let subs = Array.isArray(f.subfield) ? f.subfield : [f.subfield];
                                    return subs.find(s => 
                                        (s.code === "2" || s.code == "2" || s.code === 2) && 
                                        String(s.content).toUpperCase() === "ORCID"
                                    );
                                });
                            
                            if (orcidField) {
                                let subs = Array.isArray(orcidField.subfield) ? orcidField.subfield : [orcidField.subfield];
                                let aSub = subs.find(s => s.code === "a" || s.code == "a");
                                if (aSub && aSub.content) {
                                    let orcid = aSub.content;
                                    orcidHtml = `<div style="margin-top:3px;">
                                                   <b>ORCID :</b> 
                                                   <a href="https://orcid.org/${orcid}" target="_blank" rel="noopener">${orcid}</a> 
                                                   <button onclick="(function(t,b){navigator.clipboard.writeText(t).then(()=>{let o=b.textContent;b.textContent='✓';setTimeout(()=>{b.textContent=o},1000)})}('${orcid}',this))" 
                                                           style="border:none;background:#81C784;color:white;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:12px;margin-left:4px;">📋</button>
                                                 </div>`;
                                }
                            }
                        }
                    } catch (e) {}

                    // Ajout du résultat IdRef au HTML
                    html += `<li style="margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee;">
                               <a href="${lien}" target="_blank" rel="noopener"><b>${lib}</b></a>
                               ${bioHtml}
                               <div style="margin-top:4px;">
                                 <b>IDREF :</b> ${ppn} 
                                 <button onclick="(function(t,b){navigator.clipboard.writeText(t).then(()=>{let o=b.textContent;b.textContent='✓';setTimeout(()=>{b.textContent=o},1000)})}('${ppn}',this))" 
                                         style="border:none;background:#64B5F6;color:white;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:12px;margin-left:4px;">📋</button>
                                 ${orcidHtml}
                               </div>
                             </li>`;
                }
            } else {
                html += `<li>Aucun résultat</li>`;
            }
        } else {
            html += `<li>Aucun résultat</li>`;
        }
        html += `</ul></div>`;

        // === Section ORCID ===
        html += `<div style="margin-top:15px;">
                   <h3 style="background:#E8F5E9;padding:6px;margin:0;">🔬 ORCID</h3>
                   <ul style="padding-left:14px;margin-top:8px;">`;

        if (orcidData && orcidData.result && orcidData.result.length > 0) {
            // Extraction des IDs ORCID
            let orcidIds = orcidData.result
                .map(item => item['orcid-identifier']?.path)
                .filter(p => p);
            
            // Récupération des profils complets en parallèle
            let profiles = await Promise.all(
                orcidIds.map(async oid => {
                    try {
                        let pr = await fetch(`https://pub.orcid.org/v3.0/${oid}/person`, {
                            headers: { 'Accept': 'application/json' }
                        });
                        return await pr.json();
                    } catch (e) {
                        return null;
                    }
                })
            );

            // Affichage des résultats ORCID
            for (let i = 0; i < orcidIds.length; i++) {
                let orcidPath = orcidIds[i];
                let profile = profiles[i];
                let displayName = orcidPath;
                
                // Extraction du nom depuis le profil
                if (profile && profile.name) {
                    let gn = profile.name['given-names']?.value || '';
                    let fn = profile.name['family-name']?.value || '';
                    displayName = `${gn} ${fn}`.trim() || orcidPath;
                }
                
                let orcidUri = `https://orcid.org/${orcidPath}`;
                html += `<li style="margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee;">
                           <a href="${orcidUri}" target="_blank" rel="noopener"><b>${displayName}</b></a>
                           <div style="margin-top:3px;color:#666;font-size:13px;">
                             ${orcidPath} 
                             <button onclick="(function(t,b){navigator.clipboard.writeText(t).then(()=>{let o=b.textContent;b.textContent='✓';setTimeout(()=>{b.textContent=o},1000)})}('${orcidPath}',this))" 
                                     style="border:none;background:#81C784;color:white;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:12px;margin-left:4px;">📋</button>
                           </div>
                         </li>`;
            }
        } else {
            html += `<li>Aucun résultat</li>`;
        }
        
        html += `</ul></div></div>`;

        // Affichage de la popup avec les résultats
        c(html);

    } catch (e) {
        c('Erreur : ' + e.message);
    }
})();