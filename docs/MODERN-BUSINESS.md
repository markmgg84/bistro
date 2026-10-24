# Restyling Modern Business — 23 ottobre 2026

## Analisi iniziale e perimetro

Base: `e131ad9f1d08aedd5732a5b123649d7601ae340c`, branch originale `feat/bistro-control-20261023`. Il progetto usa Next.js 15 App Router, React 19, TypeScript, Tailwind 4 e icone Lucide già installate. La shell e tutte le sezioni sono in `app/workspace.tsx`; gli stili preesistenti sono in `app/globals.css`. Il login ha un componente separato che non è stato modificato. I grafici sono elementi HTML/CSS, senza librerie aggiuntive.

Il branch dedicato è `style/modern-business-20261023`. Nessun deploy, push o aggiornamento di configurazione cloud è stato eseguito per questo restyling.

## Modifiche di presentazione

- `app/modern-business.css`: tema separato, sfondo `#F5F7FB`, primario `#173D7A`, superfici `#FFFFFF`. `#F28C28` è riservato all'identificativo e all'accento Marina; testo scuro sull'arancione per il contrasto. Il logo conserva carattere, proporzioni e colore originali.
- `app/layout.tsx`: importa il nuovo tema dopo il CSS preesistente.
- `app/workspace.tsx`: soli attributi di presentazione/accessibilità: locale per gli accenti CSS, navigazione corrente, icone decorative, stato di caricamento annunciato, nomi accessibili e focus per i valori già presenti del grafico.
- `tests/ui/modern-business.cjs`: harness visivo isolato e in sola lettura. Usa soltanto librerie già presenti e dati già esistenti, senza aggiungere dati dimostrativi o chiamare le API dell'app.

Menu laterale, spaziatura, card KPI, tabularità dei numeri, grafici, filtri, tabelle e moduli hanno una gerarchia più chiara. Controlli di almeno 44 px, testo dei campi a 16 px su smartphone, menu inferiore con safe area, focus visibile, reduced motion e modalità forced colors. Nessuna formula, etichetta funzionale, condizione di autorizzazione, richiesta dati o funzione di gestione eventi è stata cambiata.

`app/globals.css`, database, Prisma, migrazioni, seed, API, autenticazione, permessi, calcoli, dati, manifest, dipendenze e lockfile sono rimasti invariati. Nessun reset o seed eseguito.

## Verifiche

Baseline prima del restyling: 12 test unitari, typecheck e build superati. `npm run lint` fallisce già sulla baseline perché non esiste uno script `lint`; non sono state introdotte dipendenze o configurazioni lint per aggirarlo.

Comandi di verifica dopo le modifiche:

```sh
npm test
npm run typecheck
npm run build
node --env-file=.env --import tsx --test tests/ui/modern-business.cjs
```

I test UI richiedono il database esistente già avviato e Chromium (come i test browser preesistenti; `CHROMIUM_PATH` consente di scegliere il percorso). Non inizializzano alcun database. Le query vengono eseguite in transazioni PostgreSQL `READ ONLY`; un server temporaneo su loopback rende il solo componente UI e blocca tutte le richieste di scrittura. Non usa il login e non crea sessioni. Il server viene chiuso al termine. I file tecnici e le schermate vanno nella cartella già ignorata `.local/ui-modern-business/`.

Esito: **12 test unitari e 4 test UI superati**, typecheck e build superati. Nessun nuovo errore rilevato; lint non disponibile per la mancanza preesistente dello script.

Copertura: tutte e cinque le sezioni, navigazione corrente, filtri, corrispondenza dei KPI ai dati letti, colore Marina, larghezze 320/390/768/1024/1440 px, assenza di overflow della pagina, touch target, login mobile, focus tastiera, caricamento/errore e contrasto almeno 4,5:1 per i testi principali controllati. Le tabelle rimangono scorrevoli orizzontalmente dentro il proprio contenitore. Questa verifica Chromium non equivale a una certificazione WCAG completa o a un test su Safari/iPhone fisico.

Non sono state eseguite le suite preesistenti `test:integration` e `test:e2e`: scrivono presenze, utenti, obiettivi, importazioni, audit o sessioni. Eseguirle sul database attuale contrasterebbe con il vincolo di lasciare i dati invariati. Nessuno script di setup, migrazione, seed, backup DB o riavvio DB è stato eseguito.

## Copia di sicurezza e ripristino

Creata prima delle modifiche, fuori dal checkout:

- `/workspace/backups/bistro-modern-business-20261023/source.bundle`: storia Git e riferimenti originali; verificato con `git bundle verify`.
- `/workspace/backups/bistro-modern-business-20261023/source.tar.gz`: copia dei sorgenti al commit originale.

Queste copie contengono solo sorgenti versionati, senza `.env`, password, database o file `.local`.

Per tornare alla versione precedente, con working tree pulito:

```sh
git switch feat/bistro-control-20261023
```

Questo riporta il codice a `e131ad9`, senza reset, senza riscrivere la storia e senza toccare i dati locali ignorati. Per annullare il restyling mantenendo lo stesso branch, usare `git revert` sul commit UI riportato nella consegna: crea un nuovo commit di annullamento. Salvare prima eventuali successive modifiche proprie; non usare comandi che scartino file.

Per recuperare il backup indipendentemente dal checkout attuale:

```sh
git clone /workspace/backups/bistro-modern-business-20261023/source.bundle /workspace/bistro-source-recovery
```

Il recupero crea una cartella distinta e non sovrascrive il progetto in uso. Le credenziali e il database esistenti non vanno copiati nel repository o pubblicati.
