javascript: (async () => {
    // safe helpers
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function escapeAttr(s) {
        return escapeHtml(s).replace(/"/g, '&quot;');
    }
    function stripAccents(s) {
        return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    // Création d'une popup unique, gestion des boutons de copie via delegation
    function createPopup(html) {
        const EXISTING_ID = 'hal-idcatcher-popup';
        let prev = document.getElementById(EXISTING_ID);
        if (prev) prev.remove();

        let d = document.createElement('div');
        d.id = EXISTING_ID;
        d.style.position = 'fixed';
        d.style.top = '20px';
        d.style.right = '20px';
        d.style.backgroundColor = 'white';
        d.style.border = '2px solid #444';
        d.style.padding = '10px';
        d.style.zIndex = 99999;
        d.style.maxHeight = '70%';
        d.style.overflowY = 'auto';
        d.style.width = '520px';
        d.style.fontFamily = 'sans-serif';
        d.innerHTML = html;

        // Bouton de fermeture
        let b = document.createElement('button');
        b.textContent = 'Fermer';
        b.style.marginTop = '10px';
        b.onclick = () => d.remove();
        d.appendChild(b);

        // Delegation pour les boutons de copie
        d.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-copy]');
            if (!btn) return;
            const t = btn.getAttribute('data-copy');
            if (!t) return;
            navigator.clipboard?.writeText(t).then(() => {
                const old = btn.textContent;
                btn.textContent = '✓';
                setTimeout(() => btn.textContent = old, 1000);
            }).catch((err) => {
                console.warn('Clipboard error', err);
            });
        });

        document.body.appendChild(d);
    }

    try {
        // Extraction et normalisation de l'ID auteur depuis l'URL
        let path = (window.location && window.location.pathname) ? window.location.pathname : '';
        path = path.replace(/^\/|\/$/g, ''); // retire slash en tête/fin
        let idAur = path.split('/').pop() || '';
        if (!idAur) {
            createPopup('<b>Impossible de déterminer l\'ID auteur depuis l\'URL.</b>');
            return;
        }

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
                let urlHal = `https://api.archives-ouvertes.fr/search/?q=authIdPerson_i:${encodeURIComponent(idAur)}&fl=authFullName_s,authIdPerson_i&rows=50&wt=json`;
                let r = await fetch(urlHal);
                if (!r.ok) {
                    console.warn('HAL API non ok', r.status, r.statusText);
                } else {
                    let data = await r.json();
                    if (data.response && Array.isArray(data.response.docs) && data.response.docs.length) {
                        for (const doc of data.response.docs) {
                            let ids = doc.authIdPerson_i || [];
                            if (!Array.isArray(ids)) ids = [ids];
                            let names = doc.authFullName_s || [];
                            for (let i = 0; i < ids.length; i++) {
                                try {
                                    if (String(ids[i]) === String(idAur)) {
                                        nomTrouve = names[i];
                                        break;
                                    }
                                } catch (e) { /* ignore malformed */ }
                            }
                            if (nomTrouve) break;
                        }
                    }
                }
            } catch (e) {
                console.warn('Erreur fetch HAL', e);
            }
        }

        if (!nomTrouve) {
            createPopup("<b>Impossible de déterminer le nom de l'auteur.</b>");
            return;
        }

        let parts = nomTrouve.split(/\s+/).filter(Boolean);
        let prenom = parts.shift() || '';
        let nom = parts.join(' ') || '';

        // Construire des requêtes tolérantes si prenom/nom manquants
        let idrefQuery;
        if (prenom && nom) {
            idrefQuery = `persname_t:(\"${nom}\" AND \"${prenom}\")`;
        } else {
            // recherche sur le nom complet si manque de tokens
            idrefQuery = `persname_t:(\"${nomTrouve}\")`;
        }
        let qUrl = `https://www.idref.fr/Sru/Solr?q=${encodeURIComponent(idrefQuery)}&fl=id,ppn_z,affcourt_z,recordtype_z&rows=20&wt=json`;
        let orcidQuery;
        if (nom && prenom) {
            orcidQuery = `family-name:${encodeURIComponent(stripAccents(nom))}+AND+given-names:${encodeURIComponent(stripAccents(prenom))}`;
        } else {
            orcidQuery = encodeURIComponent(nomTrouve);
        }
        let orcidUrl = `https://pub.orcid.org/v3.0/search/?q=${orcidQuery}&rows=8`;

        // Requêtes parallèles (avec vérifications)
        let [r2, r3] = await Promise.allSettled([
            fetch(qUrl),
            fetch(orcidUrl, { headers: { 'Accept': 'application/json' } })
        ]);

        let idrefOk = false;
        let idrefJson = null;
        if (r2.status === 'fulfilled') {
            try {
                let resp = r2.value;
                if (resp.ok) {
                    const txt = await resp.text();
                    if (txt && txt.trim().startsWith('{')) {
                        idrefJson = JSON.parse(txt);
                        idrefOk = true;
                    }
                } else {
                    console.warn('IdRef fetch non ok', resp.status, resp.statusText);
                }
            } catch (e) {
                console.warn('Erreur parse IdRef', e);
            }
        } else {
            console.warn('IdRef fetch rejeté', r2.reason);
        }

        let orcidData = null;
        if (r3.status === 'fulfilled') {
            try {
                if (r3.value.ok) {
                    orcidData = await r3.value.json();
                } else {
                    console.warn('ORCID fetch non ok', r3.value.status, r3.value.statusText);
                }
            } catch (e) {
                console.warn('Erreur parse ORCID', e);
            }
        } else {
            console.warn('ORCID fetch rejeté', r3.reason);
        }

        // Début HTML
        let html = `<div style="padding:6px;"><b>Résultats pour ${escapeHtml(nomTrouve)} :</b>`;

        // === IdRef ===
        html += `<div style="margin-top:10px;">
                   <h3 style="background:#E3F2FD;padding:6px;margin:0;">📚 IdRef</h3>
                   <ul style="padding-left:14px;margin-top:8px;">`;

        if (idrefOk && idrefJson && idrefJson.response && Array.isArray(idrefJson.response.docs) && idrefJson.response.docs.length) {
            const docs = idrefJson.response.docs;
            // Récupérer la liste de ppn et préparer les fetch en parallèle (allSettled pour robustesse)
            let items = docs.map(x => {
                const ppn = x.ppn_z || x.id || '';
                return { ppn, lib: x.affcourt_z || x.recordtype_z || ppn };
            }).filter(it => it.ppn);

            // Fetch des détails en parallèle
            let detailsResults = await Promise.allSettled(items.map(it =>
                fetch(`https://www.idref.fr/${encodeURIComponent(it.ppn)}.json`)
                    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
            ));

            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                const ppn = it.ppn;
                const lib = it.lib;
                let bioHtml = '';
                let orcidHtml = '';

                const dr = detailsResults[i];
                if (dr.status === 'fulfilled' && dr.value && dr.value.record && Array.isArray(dr.value.record.datafield)) {
                    try {
                        const jData = dr.value;
                        // biographie (tag 340)
                        let bioField = jData.record.datafield.find(f => String(f.tag) === '340');
                        if (bioField && bioField.subfield) {
                            let subs = Array.isArray(bioField.subfield) ? bioField.subfield : [bioField.subfield];
                            let bioSub = subs.find(s => String(s.code) === 'a');
                            if (bioSub && bioSub.content) {
                                let bio = String(bioSub.content);
                                let bioShort = bio.length > 100 ? bio.substring(0, 100) + '...' : bio;
                                bioHtml = `<div style="margin-top:3px;font-size:12px;color:#555;font-style:italic;cursor:help;" title="${escapeAttr(bio)}">${escapeHtml(bioShort)}</div>`;
                            }
                        }

                        // ORCID (035 with code 2 content "ORCID")
                        let orcidField = (jData.record.datafield || [])
                            .filter(f => String(f.tag) === '035')
                            .find(f => {
                                let subs = Array.isArray(f.subfield) ? f.subfield : [f.subfield];
                                return subs.find(s => (String(s.code) === '2') && String(s.content).toUpperCase() === 'ORCID');
                            });

                        if (orcidField) {
                            let subs = Array.isArray(orcidField.subfield) ? orcidField.subfield : [orcidField.subfield];
                            let aSub = subs.find(s => String(s.code) === 'a');
                            if (aSub && aSub.content) {
                                let orcid = String(aSub.content);
                                orcidHtml = `<div style="margin-top:3px;">
                                                   <b>ORCID :</b> 
                                                   <a href="https://orcid.org/${escapeAttr(orcid)}" target="_blank" rel="noopener">${escapeHtml(orcid)}</a> 
                                                   <button data-copy="${escapeAttr(orcid)}" style="border:none;background:#81C784;color:white;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:12px;margin-left:4px;">📋</button>
                                                 </div>`;
                            }
                        }

                        // affiliations (510)
                        let affFields = (jData.record.datafield || []).filter(f => String(f.tag) === '510');
                        if (affFields.length > 0) {
                            let affList = [];
                            for (const affField of affFields) {
                                let subs = Array.isArray(affField.subfield) ? affField.subfield : [affField.subfield];
                                let affName = subs.find(s => String(s.code) === 'a')?.content;
                                let affYear = subs.find(s => String(s.code) === '0')?.content;
                                if (affName) {
                                    let year = '';
                                    if (affYear) {
                                        let match = String(affYear).match(/^(\d{4})/);
                                        if (match) year = match[1];
                                    }
                                    affList.push({ name: String(affName), year });
                                }
                            }
                            if (affList.length) {
                                bioHtml += `<div style="margin-top:5px;font-size:12px;color:#444;">
                                              <b>Affiliation(s) :</b><br/>`;
                                for (const aff of affList) {
                                    bioHtml += `<span style="margin-left:8px;">• ${escapeHtml(aff.name)}`;
                                    if (aff.year) bioHtml += ` <i>(depuis ${escapeHtml(aff.year)})</i>`;
                                    bioHtml += `</span><br/>`;
                                }
                                bioHtml += `</div>`;
                            }
                        }
                    } catch (e) {
                        console.warn('Erreur traitement details IdRef pour', ppn, e);
                    }
                } else {
                    if (dr.status === 'rejected') {
                        console.warn('Erreur fetch detail IdRef', it.ppn, dr.reason);
                    }
                }

                html += `<li style="margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee;">
                           <a href="https://www.idref.fr/${escapeAttr(ppn)}" target="_blank" rel="noopener"><b>${escapeHtml(lib)}</b></a>
                           ${bioHtml}
                           <div style="margin-top:4px;">
                             <b>IDREF :</b> ${escapeHtml(ppn)} 
                             <button data-copy="${escapeAttr(ppn)}" style="border:none;background:#64B5F6;color:white;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:12px;margin-left:4px;">📋</button>
                             ${orcidHtml}
                           </div>
                         </li>`;
            }
        } else {
            html += `<li>Aucun résultat</li>`;
        }

        html += `</ul></div>`;

        // === ORCID ===
        html += `<div style="margin-top:15px;">
                   <h3 style="background:#E8F5E9;padding:6px;margin:0;">🔬 ORCID</h3>
                   <ul style="padding-left:14px;margin-top:8px;">`;

        if (orcidData && Array.isArray(orcidData.result) && orcidData.result.length > 0) {
            let orcidIds = orcidData.result
                .map(item => item['orcid-identifier']?.path)
                .filter(p => p);

            // Récupération des profils ORCID (parallèle, tolérant les échecs)
            let profiles = await Promise.allSettled(
                orcidIds.map(async oid => {
                    try {
                        let pr = await fetch(`https://pub.orcid.org/v3.0/${encodeURIComponent(oid)}/person`, {
                            headers: { 'Accept': 'application/json' }
                        });
                        if (!pr.ok) throw new Error('HTTP ' + pr.status);
                        return await pr.json();
                    } catch (e) {
                        console.warn('Erreur fetch ORCID person', oid, e);
                        return null;
                    }
                })
            );

            for (let i = 0; i < orcidIds.length; i++) {
                let orcidPath = orcidIds[i];
                let profRes = profiles[i];
                let profile = (profRes && profRes.status === 'fulfilled') ? profRes.value : null;
                let displayName = orcidPath;

                if (profile && profile.name) {
                    let gn = profile.name['given-names']?.value || '';
                    let fn = profile.name['family-name']?.value || '';
                    displayName = `${gn} ${fn}`.trim() || orcidPath;
                }

                let orcidUri = `https://orcid.org/${escapeAttr(orcidPath)}`;
                html += `<li style="margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee;">
                           <a href="${orcidUri}" target="_blank" rel="noopener"><b>${escapeHtml(displayName)}</b></a>
                           <div style="margin-top:3px;color:#666;font-size:13px;">
                             ${escapeHtml(orcidPath)} 
                             <button data-copy="${escapeAttr(orcidPath)}" style="border:none;background:#81C784;color:white;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:12px;margin-left:4px;">📋</button>
                           </div>
                         </li>`;
            }
        } else {
            html += `<li>Aucun résultat</li>`;
        }

        html += `</ul></div></div>`;

        // Affiche la popup
        createPopup(html);

    } catch (e) {
        console.error('Erreur générale', e);
        const msg = escapeHtml(e && e.message ? e.message : String(e));
        createPopup('Erreur : ' + msg);
    }
})();
