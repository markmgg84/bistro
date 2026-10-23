# Verifiche della consegna — 23 ottobre 2026

Ambiente effettivamente usato: Linux Debian 13, Node.js 24.19, PostgreSQL 17.11, Prisma 6.19.3, Next.js 15.5.28, Chromium.

- Setup completo da pacchetti Debian verificati tramite indice APT firmato, senza disabilitare TLS o checksum. Prisma generato, schema valido e migrazione iniziale SQL applicata.
- Setup locale ripetuto senza azzerare dati o credenziali. Installazione cloud ripetuta con `npm ci` e script salvato.
- Build Next.js e TypeScript superati.
- 12 test unitari passati: KPI, validazione, password, pause, turni notturni, DST e periodi.
- 3 test PostgreSQL passati: privilegi limitati, vincolo di appartenenza al locale, presenza aperta unica tra locali.
- 12 test browser passati: login/logout e revoca sessione, autorizzazioni, tenant, dati dipendente, origine, obiettivi persistenti, CSV atomico/duplicati, anagrafiche/turni, pause, audit rettifiche, mobile 390 px, cache offline, rate limit e sessione scaduta.
- Arresto e riavvio reali del cluster: un record scritto prima dell'arresto è stato ritrovato identico dopo il riavvio, poi rimosso.
- Dump cifrato AES-256-GCM riletto da disco con checksum, decifrato e ripristinato in un database temporaneo: conteggi e totale incassi coincidenti. Il database temporaneo è stato rimosso.
- Audit npm: nessuna vulnerabilità nota segnalata alla verifica.

I test operano su dati fittizi. Non equivalgono a una revisione indipendente della sicurezza o a una validazione paghe/privacy. Il layout mobile è stato verificato in Chromium: macOS, Safari/iPhone fisici, HTTPS LAN e installabilità PWA sul dispositivo non sono stati testati in questa macchina Linux. Nessun hosting o tunnel pubblico è stato creato. L'archivio del codice non include il database, le password, `.env` o `.local`.
