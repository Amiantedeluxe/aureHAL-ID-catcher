javascript:(async () => {

    // Helpers sécurité
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function escapeAttr(s) { return escapeHtml(s); }
    function stripAccents(s) {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    // Popup unique avec délégation pour les boutons de copie
    function createPopup(html) {
        let prev = document.getElementById('hal-idcatcher-popup');
        if (prev) prev.remove();
        let d = document.createElement('div');
        d.id = 'hal-idcatcher-popup';
        d.style.cssText = 'position:fixed;top:20px;right:20px;background:white;border:2px solid #444;padding:10px;z-index:99999;max-height:70%;overflow-y:auto;width:520px;font-family:sans-serif;border-radius:15px;';
        d.innerHTML = html;
        let b = document.createElement('button');
        b.textContent = 'Fermer';
        b.style.marginTop = '10px';
        b.onclick = () => d.remove();
        d.appendChild(b);
        d.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-copy]');
            if (!btn) return;
            const t = btn.getAttribute('data-copy');
            navigator.clipboard?.writeText(t).then(() => {
                const old = btn.textContent;
                btn.textContent = '✓';
                setTimeout(() => btn.textContent = old, 1000);
            });
        });
        document.body.appendChild(d);
    }

    try {
        // Extraction de l'ID auteur depuis l'URL
        let idAur = window.location.pathname.replace(/^\/|\/$/g, '').split('/').pop() || '';
        if (!idAur) { createPopup('<b>Impossible de déterminer l\'ID auteur depuis l\'URL.</b>'); return; }

        let prenom = '', nom = '';

        // Récupération prénom/nom depuis l'API HAL
        try {
            let r = await fetch(`https://api.archives-ouvertes.fr/search/?q=authIdPerson_i:${idAur}&fl=authLastName_s,authFirstName_s,authIdPerson_i&rows=50&wt=json`);
            if (r.ok) {
                let data = await r.json();
                for (const doc of (data.response?.docs || [])) {
                    let ids = Array.isArray(doc.authIdPerson_i) ? doc.authIdPerson_i : [doc.authIdPerson_i];
                    let idx = ids.findIndex(id => String(id) === String(idAur));
                    if (idx !== -1) {
                        prenom = (doc.authFirstName_s || [])[idx] || '';
                        nom    = (doc.authLastName_s  || [])[idx] || '';
                        break;
                    }
                }
            }
        } catch(e) {}

        // Fallback DOM si l'API HAL n'a rien retourné
        if (!prenom && !nom) {
            let header = document.querySelector('h3.mb-4') ||
                Array.from(document.querySelectorAll('h3')).find(h =>
                    /Modifications des informations de/i.test(h.innerText) ||
                    /Auteur\s*:/i.test(h.innerText) ||
                    /Création d'un auteur identifié/i.test(h.innerText)
                );
            if (header) {
                let t = header.innerText.trim();
                let m = t.match(/Auteur\s*:\s*(.+)/i) || t.match(/Modifications des informations de\s+(.+)/i);
                if (m) {
                    let parts = m[1].trim().split(/\s+/).filter(Boolean);
                    prenom = parts.shift() || '';
                    nom = parts.join(' ') || '';
                }
                if (!prenom && !nom && /Création d'un auteur identifié/i.test(t)) {
                    let li = document.querySelector('#sortable-form li[data-firstname][data-lastname]');
                    if (li) {
                        prenom = li.getAttribute('data-firstname') || '';
                        nom    = li.getAttribute('data-lastname')  || '';
                    }
                }
            }
        }

        if (!prenom && !nom) { createPopup("<b>Impossible de déterminer le nom de l'auteur.</b>"); return; }

        let nomTrouve = `${prenom} ${nom}`.trim();

        // Construction des requêtes IdRef et ORCID
        let qUrl = `https://www.idref.fr/Sru/Solr?q=${encodeURIComponent(`persname_t:(${nom} AND ${prenom})`)}&fl=id,ppn_z,affcourt_z,recordtype_z&rows=20&wt=json`;
        let orcidUrl = `https://pub.orcid.org/v3.0/search/?q=family-name:${encodeURIComponent(stripAccents(nom))}+AND+given-names:${encodeURIComponent(stripAccents(prenom))}&rows=8`;

        // Requêtes parallèles IdRef + ORCID
        let [r2, r3] = await Promise.allSettled([
            fetch(qUrl),
            fetch(orcidUrl, { headers: { 'Accept': 'application/json' } })
        ]);

        let idrefJson = null;
        if (r2.status === 'fulfilled' && r2.value.ok) {
            try { let txt = await r2.value.text(); if (txt.trim().startsWith('{')) idrefJson = JSON.parse(txt); } catch(e) {}
        }
        let orcidData = null;
        if (r3.status === 'fulfilled' && r3.value.ok) {
            try { orcidData = await r3.value.json(); } catch(e) {}
        }

        let html = `<div style="padding:6px;"><b>Résultats pour ${escapeHtml(nomTrouve)} :</b>`;

        // === IdRef ===
        html += `<div style="margin-top:10px;"><h3 style="background:#E3F2FD;padding:6px;margin:0;">📚 IdRef</h3><ul style="padding-left:14px;margin-top:8px;">`;

        let docs = idrefJson?.response?.docs || [];
        let items = docs.map(x => ({ ppn: x.ppn_z || x.id || '', lib: x.affcourt_z || x.recordtype_z || '' })).filter(it => it.ppn);

        if (items.length) {
            // Fetch des détails de chaque PPN en parallèle
            let details = await Promise.allSettled(items.map(it =>
                fetch(`https://www.idref.fr/${it.ppn}.json`).then(r => r.ok ? r.json() : Promise.reject())
            ));

            for (let i = 0; i < items.length; i++) {
                const { ppn, lib } = items[i];
                let bioHtml = '', orcidHtml = '', halHtml = '';
                const dr = details[i];

                if (dr.status === 'fulfilled' && Array.isArray(dr.value?.record?.datafield)) {
                    const fields = dr.value.record.datafield;
                    const subs = f => Array.isArray(f.subfield) ? f.subfield : [f.subfield];
                    const sub = (f, code) => subs(f).find(s => String(s.code) === code)?.content;

                    // Biographie (tag 340)
                    let bioField = fields.find(f => String(f.tag) === '340');
                    if (bioField) {
                        let bio = String(sub(bioField, 'a') || '');
                        if (bio) {
                            let bioShort = bio.length > 100 ? bio.substring(0, 100) + '...' : bio;
                            bioHtml = `<div style="margin-top:3px;font-size:12px;color:#555;font-style:italic;cursor:help;" title="${escapeAttr(bio)}">${escapeHtml(bioShort)}</div>`;
                        }
                    }

                    // ORCID (tag 035, code 2 = "ORCID")
                    let orcidField = fields.filter(f => String(f.tag) === '035')
                        .find(f => subs(f).find(s => String(s.code) === '2' && String(s.content).toUpperCase() === 'ORCID'));
                    if (orcidField) {
                        let orcid = String(sub(orcidField, 'a') || '');
                        if (orcid) orcidHtml = `<div style="margin-top:3px;"><b>ORCID :</b> <a href="https://orcid.org/${escapeAttr(orcid)}" target="_blank" rel="noopener">${escapeHtml(orcid)}</a> <button data-copy="${escapeAttr(orcid)}" style="border:none;background:#81C784;color:white;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:12px;margin-left:4px;">📋</button></div>`;
                        
                        // idHal (tag 035, code 2 = "HAL")
let halField = fields.filter(f => String(f.tag) === '035')
    .find(f => subs(f).find(s => String(s.code) === '2' && String(s.content).toUpperCase() === 'HAL'));
let halHtml = '';
if (halField) {
    let idHal = String(sub(halField, 'a') || '');
    if (idHal) halHtml = `<div style="margin-top:3px;"><b>idHal :</b> ${escapeHtml(idHal)} <button data-copy="${escapeAttr(idHal)}" style="border:none;background:#1565C0;color:white;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:12px;margin-left:4px;">📋</button></div>`;
}
                    }

                    // Affiliations (tag 510)
                    let affFields = fields.filter(f => String(f.tag) === '510');
                    if (affFields.length) {
                        let affList = affFields.map(f => ({
                            name: String(sub(f, 'a') || ''),
                            year: (String(sub(f, '0') || '').match(/^(\d{4})/) || [])[1] || ''
                        })).filter(a => a.name);
                        if (affList.length) {
                            bioHtml += `<div style="margin-top:5px;font-size:12px;color:#444;"><b>Affiliation(s) :</b><br/>`;
                            for (const aff of affList) {
                                bioHtml += `<span style="margin-left:8px;">• ${escapeHtml(aff.name)}`;
                                if (aff.year) bioHtml += ` <i>(depuis ${aff.year})</i>`;
                                bioHtml += `</span><br/>`;
                            }
                            bioHtml += `</div>`;
                        }
                    }
                }

                html += `<li style="margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee;">
                           <a href="https://www.idref.fr/${escapeAttr(ppn)}" target="_blank" rel="noopener"><b>${escapeHtml(lib)}</b></a>
                           ${bioHtml}
                           <div style="margin-top:4px;"><b>IDREF :</b> ${escapeHtml(ppn)} <button data-copy="${escapeAttr(ppn)}" style="border:none;background:#64B5F6;color:white;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:12px;margin-left:4px;">📋</button>${orcidHtml}${halHtml}</div>
                         </li>`;
            }
        } else {
            html += `<li>Aucun résultat</li>`;
        }
        html += `</ul></div>`;

        // === ORCID ===
        html += `<div style="margin-top:15px;"><h3 style="background:#E8F5E9;padding:6px;margin:0;">🔬 ORCID</h3><ul style="padding-left:14px;margin-top:8px;">`;

        let orcidIds = (orcidData?.result || []).map(item => item['orcid-identifier']?.path).filter(p => p);
        if (orcidIds.length) {
            let profiles = await Promise.allSettled(orcidIds.map(oid =>
                fetch(`https://pub.orcid.org/v3.0/${oid}/person`, { headers: { 'Accept': 'application/json' } })
                    .then(r => r.ok ? r.json() : null)
            ));
            for (let i = 0; i < orcidIds.length; i++) {
                let oid = orcidIds[i];
                let profile = profiles[i].status === 'fulfilled' ? profiles[i].value : null;
                let displayName = oid;
                if (profile?.name) {
                    let gn = profile.name['given-names']?.value || '';
                    let fn = profile.name['family-name']?.value || '';
                    displayName = `${gn} ${fn}`.trim() || oid;
                }
                html += `<li style="margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee;">
                           <a href="https://orcid.org/${escapeAttr(oid)}" target="_blank" rel="noopener"><b>${escapeHtml(displayName)}</b></a>
                           <div style="margin-top:3px;color:#666;font-size:13px;">${escapeHtml(oid)} <button data-copy="${escapeAttr(oid)}" style="border:none;background:#81C784;color:white;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:12px;margin-left:4px;">📋</button></div>
                         </li>`;
            }
        } else {
            html += `<li>Aucun résultat</li>`;
        }

        html += `</ul></div></div>`;
        createPopup(html);

    } catch(e) {
        createPopup('Erreur : ' + escapeHtml(e?.message || String(e)));
    }
})();




