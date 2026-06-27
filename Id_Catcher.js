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
    // Normalisation pour comparaison de noms (accents, casse, ponctuation)
    function normName(s) {
        return stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }
    // Jetons triés d'un nom → permet une comparaison indépendante de l'ordre prénom/nom
    function nameKey(s) {
        return normName(s).split(/\s+/).filter(Boolean).sort().join(' ');
    }

    // Petite pastille « identifiant » colorée avec bouton copier (modèle Druid)
    function idPill(label, value, link, bg) {
        const inner = link
            ? `<a href="${escapeAttr(link)}" target="_blank" rel="noopener" style="color:#fff;text-decoration:none;">${escapeHtml(value)}</a>`
            : escapeHtml(value);
        return `<span style="display:inline-flex;align-items:center;gap:5px;background:${bg};color:#fff;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;margin:3px 4px 0 0;">`
            + `${escapeHtml(label)} ${inner}`
            + `<button data-copy="${escapeAttr(value)}" title="Copier" style="border:none;background:rgba(255,255,255,.25);color:#fff;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:11px;line-height:1;padding:0;">⧉</button>`
            + `</span>`;
    }

    // Popup unique avec délégation pour les boutons de copie
    function createPopup(html) {
        let prev = document.getElementById('hal-idcatcher-popup');
        if (prev) prev.remove();
        let d = document.createElement('div');
        d.id = 'hal-idcatcher-popup';
        d.style.cssText = 'position:fixed;top:20px;right:20px;background:white;border:2px solid #444;padding:10px;z-index:99999;max-height:80%;overflow-y:auto;width:560px;font-family:sans-serif;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.25);';
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

        const isCreatePage = /\/create\//i.test(window.location.pathname);

        // Récupération prénom/nom depuis l'API HAL
        if (!isCreatePage) {
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
        }
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
        let nomTrouveKey = nameKey(nomTrouve);   // pour le surlignage « nom exact »

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

        // ORCID retournés par la recherche par nom → sert au lien croisé IdRef ↔ ORCID
        let orcidSearchSet = new Set(
            (orcidData?.result || []).map(it => it['orcid-identifier']?.path).filter(Boolean).map(p => p.toUpperCase())
        );

        let html = `<div style="padding:6px;"><b>Résultats pour ${escapeHtml(nomTrouve)} :</b>`;

        // === IdRef ===
        html += `<div style="margin-top:10px;"><h3 style="background:#E3F2FD;padding:6px;margin:0;border-radius:4px;">📚 IdRef</h3><ul style="list-style:none;padding-left:0;margin-top:8px;">`;

        let docs = idrefJson?.response?.docs || [];
        let items = docs.map(x => ({ ppn: x.ppn_z || x.id || '', lib: x.affcourt_z || x.recordtype_z || '' })).filter(it => it.ppn);

        if (items.length) {
            // Fetch des détails de chaque PPN en parallèle (notice UniMARC JSON)
            let details = await Promise.allSettled(items.map(it =>
                fetch(`https://www.idref.fr/${it.ppn}.json`).then(r => r.ok ? r.json() : Promise.reject())
            ));

            // Construit un candidat enrichi par PPN (mêmes tags UniMARC que Druid)
            let cands = items.map((it, i) => {
                const c = { ppn: it.ppn, lib: it.lib, name: '', job: '', birth: '', death: '', gender: '', bio: '', orcid: '', idhal: '', affs: [] };
                const dr = details[i];
                if (dr.status === 'fulfilled' && Array.isArray(dr.value?.record?.datafield)) {
                    const fields = dr.value.record.datafield;
                    const subs = f => Array.isArray(f.subfield) ? f.subfield : (f.subfield ? [f.subfield] : []);
                    const sub = (f, code) => subs(f).find(s => String(s.code) === code)?.content;

                    // 200 : $a nom, $b prénom, $c métier  (repli 300$a pour le métier)
                    const f200 = fields.find(f => String(f.tag) === '200');
                    if (f200) {
                        const last = String(sub(f200, 'a') || ''), first = String(sub(f200, 'b') || '');
                        c.name = `${first} ${last}`.trim();
                        c.job = String(sub(f200, 'c') || '');
                    }
                    if (!c.job) {
                        const f300 = fields.find(f => String(f.tag) === '300');
                        if (f300) c.job = String(sub(f300, 'a') || '');
                    }
                    // 103 : $a naissance, $b décès → on garde l'année
                    const f103 = fields.find(f => String(f.tag) === '103');
                    if (f103) {
                        c.birth = (String(sub(f103, 'a') || '').match(/\d{4}/) || [''])[0];
                        c.death = (String(sub(f103, 'b') || '').match(/\d{4}/) || [''])[0];
                    }
                    // 120 : $a genre (aa = F, ba = M)
                    const f120 = fields.find(f => String(f.tag) === '120');
                    if (f120) {
                        const g = String(sub(f120, 'a') || '').slice(0, 2);
                        c.gender = g === 'aa' ? 'F' : g === 'ba' ? 'M' : '';
                    }
                    // 340 : biographie / note
                    const f340 = fields.find(f => String(f.tag) === '340');
                    if (f340) c.bio = String(sub(f340, 'a') || '');
                    // 035 : ORCID / IdHAL (code 2 = source de l'identifiant)
                    for (const f of fields.filter(f => String(f.tag) === '035')) {
                        const srcLabel = String(sub(f, '2') || '').toUpperCase();
                        const val = String(sub(f, 'a') || '');
                        if (!val) continue;
                        if (srcLabel === 'ORCID' && !c.orcid) c.orcid = val;
                        if (srcLabel === 'HAL' && !c.idhal) c.idhal = val;
                    }
                    // 510 : affiliations ($a nom, $0 année)
                    c.affs = fields.filter(f => String(f.tag) === '510').map(f => ({
                        name: String(sub(f, 'a') || ''),
                        year: (String(sub(f, '0') || '').match(/^(\d{4})/) || [])[1] || ''
                    })).filter(a => a.name);
                }
                // Surlignage « nom exact » : le nom de la notice (ou affcourt) correspond à l'auteur recherché
                c.exact = !!nomTrouveKey && (nameKey(c.name || c.lib) === nomTrouveKey);
                return c;
            });

            // Les correspondances de nom exact remontent en tête (équivalent du « strong » de Druid)
            cands.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0));

            for (const c of cands) {
                // Ligne de métadonnées : métier · (dates) · genre
                const meta = [];
                if (c.job) meta.push(escapeHtml(c.job));
                if (c.birth || c.death) meta.push(`(${escapeHtml(c.birth || '?')}${c.death ? '–' + escapeHtml(c.death) : '– '})`);
                if (c.gender) meta.push(c.gender === 'F' ? '♀' : '♂');
                const metaHtml = meta.length ? `<div style="margin-top:2px;font-size:12px;color:#555;">${meta.join(' · ')}</div>` : '';

                // Biographie tronquée (2 lignes) avec tooltip = bio complète
                const bioHtml = c.bio
                    ? `<div style="margin-top:4px;font-size:12px;color:#666;font-style:italic;cursor:help;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${escapeAttr(c.bio)}">${escapeHtml(c.bio)}</div>`
                    : '';

                // Affiliations
                let affHtml = '';
                if (c.affs.length) {
                    affHtml = `<div style="margin-top:4px;font-size:12px;color:#444;">🏛 ${c.affs.map(a => escapeHtml(a.name) + (a.year ? ` <i style="color:#888;">(depuis ${a.year})</i>` : '')).join(' · ')}</div>`;
                }

                // Pastilles identifiants
                let pills = idPill('📚 IDREF', c.ppn, `https://www.idref.fr/${c.ppn}`, '#1976D2');
                if (c.orcid) pills += idPill('🔬 ORCID', c.orcid, `https://orcid.org/${c.orcid}`, '#43A047');
                if (c.idhal) pills += idPill('HAL', c.idhal, null, '#1565C0');

                const exactTag = c.exact
                    ? `<span style="float:right;background:#C8E6C9;color:#1B5E20;font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px;">✓ nom exact</span>`
                    : '';
                const crossTag = (c.orcid && orcidSearchSet.has(c.orcid.toUpperCase()))
                    ? `<div style="margin-top:3px;font-size:11px;color:#2E7D32;">↔ aussi listé dans la section ORCID</div>`
                    : '';

                html += `<li style="margin-bottom:10px;padding:8px;border:1px solid #e3e3e3;border-left:4px solid ${c.exact ? '#43A047' : '#90CAF9'};border-radius:5px;">
                           ${exactTag}
                           <a href="https://www.idref.fr/${escapeAttr(c.ppn)}" target="_blank" rel="noopener" style="font-weight:700;color:#0d47a1;text-decoration:none;">${escapeHtml(c.name || c.lib)}</a>
                           ${metaHtml}
                           ${bioHtml}
                           ${affHtml}
                           <div style="margin-top:6px;">${pills}</div>
                           ${crossTag}
                         </li>`;
            }
        } else {
            html += `<li>Aucun résultat</li>`;
        }
        html += `</ul></div>`;

        // === ORCID ===
        html += `<div style="margin-top:15px;"><h3 style="background:#E8F5E9;padding:6px;margin:0;border-radius:4px;">🔬 ORCID</h3><ul style="list-style:none;padding-left:0;margin-top:8px;">`;
        let orcidIds = (orcidData?.result || []).map(item => item['orcid-identifier']?.path).filter(p => p);
        if (orcidIds.length) {
            let [profiles, employments] = await Promise.all([
                Promise.allSettled(orcidIds.map(oid =>
                    fetch(`https://pub.orcid.org/v3.0/${oid}/person`, { headers: { 'Accept': 'application/json' } })
                        .then(r => r.ok ? r.json() : null)
                )),
                Promise.allSettled(orcidIds.map(oid =>
                    fetch(`https://pub.orcid.org/v3.0/${oid}/employments`, { headers: { 'Accept': 'application/json' } })
                        .then(r => r.ok ? r.json() : null)
                ))
            ]);

            for (let i = 0; i < orcidIds.length; i++) {
                let oid = orcidIds[i];
                let profile = profiles[i].status === 'fulfilled' ? profiles[i].value : null;
                let empData = employments[i].status === 'fulfilled' ? employments[i].value : null;

                let displayName = oid;
                if (profile?.name) {
                    let gn = profile.name['given-names']?.value || '';
                    let fn = profile.name['family-name']?.value || '';
                    displayName = `${gn} ${fn}`.trim() || oid;
                }

                // Emplois en cours (pas de date de fin)
                let currentEmp = (empData?.['affiliation-group'] || [])
                    .flatMap(g => g.summaries?.map(s => s['employment-summary']) || [])
                    .filter(e => e && !e['end-date'])
                    .map(e => e.organization?.name)
                    .filter(name => name);
                let empHtml = currentEmp.length
                    ? `<div style="font-size:12px;color:#555;font-style:italic;margin-top:3px;">🏛 ${currentEmp.map(n => escapeHtml(n)).join(', ')}</div>`
                    : '';

                const exactTag = (nomTrouveKey && nameKey(displayName) === nomTrouveKey)
                    ? `<span style="float:right;background:#C8E6C9;color:#1B5E20;font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px;">✓ nom exact</span>`
                    : '';

                html += `<li style="margin-bottom:10px;padding:8px;border:1px solid #e3e3e3;border-left:4px solid #A5D6A7;border-radius:5px;">
                           ${exactTag}
                           <a href="https://orcid.org/${escapeAttr(oid)}" target="_blank" rel="noopener" style="font-weight:700;color:#1b5e20;text-decoration:none;">${escapeHtml(displayName)}</a>
                           ${empHtml}
                           <div style="margin-top:6px;">${idPill('🔬 ORCID', oid, `https://orcid.org/${oid}`, '#43A047')}</div>
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
