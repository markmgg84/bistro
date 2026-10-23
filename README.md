# Bistrò Control — anteprima privata con PostgreSQL

Gestionale dimostrativo in italiano per **Bistrò** e **Marina di Levante**. Autenticazione, autorizzazioni lato server, database PostgreSQL persistente, migrazioni Prisma e audit. Solo dati fittizi. Nessun deploy o tunnel pubblico è stato creato.

## Aprire l'app su Mac e iPhone (passo per passo)

1. Scaricare e decomprimere l'archivio del progetto sul Mac. Aprire Terminale nella cartella che contiene `package.json` (si può digitare `cd ` e trascinare la cartella nel Terminale).
2. Installare **Node.js 24 LTS** e **PostgreSQL 17**. Con Homebrew già installato:

   ```sh
   brew install node@24 postgresql@17
   export PATH="$(brew --prefix node@24)/bin:$(brew --prefix postgresql@17)/bin:$PATH"
   node --version
   postgres --version
   ```

   Senza Homebrew, usare gli installer ufficiali Node.js e PostgreSQL e aggiungere le rispettive cartelle `bin` al PATH. Non servono Docker né un database in rete.

3. Nella cartella del progetto eseguire:

   ```sh
   npm ci
   npm run setup:local
   ```

   Il comando genera `.env` con password casuali, inizializza un cluster privato in `.local/postgres`, lo avvia solo su `127.0.0.1:55432`, applica le migrazioni e inserisce dati fittizi. È ripetibile: non azzera i dati e non sovrascrive account o obiettivi già presenti. Non avviare `brew services start postgresql`: questo progetto usa il proprio cluster. Non copiare `.env.example` prima del setup locale.

4. Aprire il file riservato degli account, **solo sul proprio Mac**:

   ```sh
   open -a TextEdit .local/demo-accounts.json
   ```

   Ci sono un amministratore per entrambi i locali, un responsabile Bistrò, un responsabile Marina e un dipendente Bistrò. Ogni password è generata durante il setup, senza credenziali predefinite nel codice. Non condividere il file, non caricarlo su Git e non inviarlo in chat.

5. Collegare Mac e iPhone alla **stessa rete Wi-Fi privata**, quindi:

   ```sh
   npm run dev:iphone
   ```

   Il Terminale stampa `Anteprima nella tua rete Wi-Fi: http://INDIRIZZO-DEL-MAC:3000`. Aprire **quell'esatto indirizzo** in Safari su iPhone e anche sul Mac; accedere con un account del file. Lasciare aperto il Terminale. Se macOS chiede l'accesso alla rete locale per Node/Terminale, consentirlo sulla rete privata. Non configurare port forwarding sul router.

6. Se l'indirizzo scelto è quello di una VPN o di un'altra scheda, trovare l'IP Wi-Fi del Mac in **Impostazioni di Sistema → Wi-Fi → Dettagli → TCP/IP**, poi:

   ```sh
   LAN_IP=192.168.1.50 npm run dev:iphone
   ```

   Sostituire l'IP con quello effettivo. Disattivare per la prova eventuali VPN o isolamento client della rete ospiti. Se compare “Origine non autorizzata”, chiudere le altre istanze e usare l'indirizzo stampato dal comando, senza alternarlo con `localhost` o con un altro hostname.

7. Arrestare la web app con Ctrl+C. Dopo il riavvio del Mac:

   ```sh
   npm run db:start
   npm run dev:iphone
   ```

   I dati sono su disco, non nella memoria del browser. Fermare Node o PostgreSQL non li cancella. Non eliminare `.local/postgres` né `.env`. Per fermare anche il cluster: `pg_ctl -D "$PWD/.local/postgres" -m fast stop` (con PostgreSQL nel PATH).

Per lavorare solo sul Mac: `npm run dev`, poi usare l'indirizzo locale stampato dal server. La build ottimizzata si prova con `npm run build` e `npm start`. Non avviare più server sulla stessa porta.

**Limite iPhone/PWA:** il browser funziona via Wi-Fi in HTTP per questa demo. Service worker, installazione PWA completa e cookie Secure richiedono HTTPS su un indirizzo diverso da localhost. Non sono stati verificati su un iPhone fisico. Non usare dati reali nella prova HTTP. Non viene creato alcun accesso pubblico.

## Cosa provare

- Amministratore: passare tra i due locali, cambiare obiettivo dolci e ricaricare: la modifica resta nel locale selezionato.
- Responsabile Bistrò: vede solo Bistrò; non può modificare gli obiettivi amministrativi. Un identificativo Marina inserito manualmente nelle API riceve 403.
- Dipendente: vede solo la propria anagrafica, turni, presenze e assenze. Può timbrare entrata, pausa, ripresa e uscita; non vede costi o incassi.
- Personale: aggiungere un dipendente fittizio, pianificare un turno anche oltre mezzanotte, richiedere un'assenza. Il responsabile può approvare le richieste altrui; non la propria. Rettifiche solo su presenze chiuse, con motivo e controllo versione: prima/dopo e autore vengono registrati nella stessa transazione.
- Incassi: importare `docs/incassi-esempio.csv`, mappare le colonne e confermare. Reimportarlo nello stesso locale restituisce un duplicato; l'intero import viene annullato. Lo stesso identificativo scontrino può appartenere all'altro locale.
- Vendite: esportare i dati del periodo. Il dettaglio prodotti proviene dalle righe prodotto nel DB; il CSV riepilogativo degli incassi non inventa righe prodotto.
- Dashboard: KPI e confronti derivano dal DB; nessun moltiplicatore fittizio. Il seed contiene 40 giorni di dati sintetici e presenze di ieri: provare il periodo Settimana o Mese.

CSV con intestazioni `date,receipt,revenue,covers,desserts`, date ISO `YYYY-MM-DD`, importi con punto decimale e al massimo due decimali. Anche Excel `.xlsx` è supportato, con anteprima delle prime 20 righe. Massimo 2 MB e 5.000 righe. I duplicati sono identificati da locale + data operativa + scontrino, con identificativo sensibile alle maiuscole.

## Migrazioni e architettura

`prisma/migrations/202610230001_initial/migration.sql` è la migrazione iniziale versionata, comprensiva dei vincoli SQL non esprimibili in Prisma (presenza aperta unica, pause e orari validi). `setup:local` esegue `prisma migrate deploy` con il proprietario del DB e assegna all'app soltanto i permessi DML necessari. Il ruolo applicativo non può modificare lo schema né aggiornare/cancellare l'audit.

```sh
npm run db:generate
npm run db:status
npm run db:deploy
npm run db:seed
```

`db:status`, `db:deploy` e `db:migrate` usano `MIGRATION_DATABASE_URL` tramite un wrapper, senza stampare la credenziale. In un futuro deploy fornire questa credenziale solo al job delle migrazioni, non al processo web; la `.env` locale contiene entrambi gli URL solo per comodità di sviluppo.

Le future migrazioni si creano con `npm run db:migrate -- --name DESCRIZIONE` in un database di sviluppo dedicato usando un proprietario con permessi DDL e database shadow configurato. Non usare `migrate dev` su DB di anteprima condivisi o di produzione. Per aggiornare la demo locale usare di nuovo `npm run setup:local`: applica soltanto migrazioni mancanti. Per un server PostgreSQL esterno, configurare gli URL distinti del proprietario e dell'app tramite segreti della piattaforma e replicare i grant descritti in `scripts/setup-local.ts`; non eseguire `setup:local` sul server esterno.

- `app/page.tsx`: controllo sessione lato server, redirect al login.
- `app/workspace.tsx`: UI responsive e richieste autenticate; nasconde i dati precedenti durante il cambio locale.
- `app/api/[...path]/route.ts`, `lib/server/`: endpoint Node, sessioni, controlli tenant e ruoli, transazioni Prisma.
- `lib/domain.ts`, `lib/time.ts`: validazione e calcoli. Fuso `Europe/Rome`; una presenza intera è attribuita al giorno di entrata. Ore effettive = durata trascorsa meno pause registrate; costo basato sul costo orario salvato alla timbratura, non su quello corrente.
- `prisma/`: schema, migrazione e seed idempotente; `scripts/`: avvio, setup, backup e verifica persistenza.
- `lib/integration.ts`: sola interfaccia interna per l'integrazione futura. Nessuna API Wycash viene presunta o chiamata.

## Test automatici

Node.js 24, database locale avviato e seed completato:

```sh
npm test
npm run typecheck
npm run test:integration
npm run build
npm run test:e2e
npm run backup:verify
npm run db:verify-restart
```

I test browser usano Chromium e un server dedicato sulla porta 3100, con origine consentita dedicata. Nel cloud Chromium è `/usr/bin/chromium`. Sul Mac, se non presente, eseguire `npx playwright install chromium`, poi impostare `CHROMIUM_PATH` al relativo eseguibile; in alternativa usare Google Chrome installato: `CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:e2e`. I test modificano solo dati fittizi, ripristinano gli obiettivi e rimuovono i record temporanei; gli audit rimangono intenzionalmente tracciati. Non puntare i test a un DB con dati reali.

`db:verify-restart` scrive un record temporaneo, arresta e riavvia il cluster locale, verifica che il record sia rimasto e lo rimuove. Eseguirlo solo con app e altri test fermi.

La copertura include accesso/logout, cookie HttpOnly, revoca sessione, ruoli, isolamento locali, CSRF/origine, import atomici, persistenza dopo ricarica, presenze e pause, rettifiche/versioni, layout a 390 px e cache offline priva di pagine autenticate. I test mobile Chromium non sostituiscono una prova Safari su iPhone fisico.

## Sicurezza e limiti prima di qualsiasi produzione

Sessioni casuali da 256 bit, nel DB solo l'hash SHA-256 del token, scadenza 12 ore e revoca al logout. Password scrypt con salt casuale e confronto a tempo costante. Cookie HttpOnly/SameSite=Lax; Secure automatico quando APP_ORIGIN è HTTPS. Ogni POST controlla l'origine esatta; ogni operazione controlla sessione, ruolo e membership del locale sul server. Rate limit login persistente per account, 10 tentativi ogni 15 minuti; errori di accesso generici. Nessuna registrazione pubblica.

Questa è una base di test privata, **non certificata pronta per produzione**. Mancano gestione utenti/password/reset e MFA, limitazione distribuita per rete al reverse proxy, revisione indipendente della sicurezza, CSP definitiva, privacy e conservazione concordate, paghe/CCNL e arrotondamenti validati, monitoraggio e backup remoti pianificati. Le sessioni scadute e i bucket di login richiedono una pulizia programmata in un deploy operativo. I filtri hanno limiti di 500 turni/assenze e 1.000 presenze per periodo: aggiungere paginazione e aggregazioni prima di grandi volumi. Premi non attivi. I moduli sono una base funzionale, non un sistema paghe.

Le ore ambigue o inesistenti del cambio ora legale vengono rifiutate dal form locale; le API richiedono timestamp ISO con offset esplicito. Validare con il responsabile del personale la regola di attribuzione del turno al giorno di entrata prima di usarla contabilmente.

## Backup, ripristino e conservazione

`npm run backup:verify` crea un dump PostgreSQL, lo cifra con AES-256-GCM, salva un checksum e verifica la decifratura ripristinandolo in un DB locale temporaneo. Confronta conteggi di utenti/locali/incassi/presenze/audit e totale degli incassi; elimina solo il DB di verifica appena creato. Il ruolo dell'app non può creare database, perciò usa il proprietario locale. Gli archivi cifrati sono in `.local/backups/`; la chiave è `.local/backup-key`, con permessi riservati. Conservare una copia della chiave separata dagli archivi: senza la chiave sono irrecuperabili. La verifica funziona solo sul DB locale standard e contiene esclusivamente dati fittizi. Eseguirla senza altri test o utenti che stanno modificando dati.

Non è un servizio di backup remoto: concordare retention, RPO/RTO, cifratura con chiavi separate, pianificazione, storage esterno e prove periodiche prima dell'uso operativo. Non inserire `.env`, `.local`, dump o password nell'archivio del codice o su Git.

## Ambiente cloud

L’archivio del progetto include solo codice e migrazioni: non contiene password o dati del cluster cloud. Il setup sul Mac crea una demo separata con nuove credenziali e dati fittizi.

Nel cloud il progetto è in `/workspace/bistro`, PostgreSQL è estratto da pacchetti Debian firmati in `/workspace/postgres`, i dati persistono in `.local/postgres`. `scripts/install-cloud.sh` riproduce setup e verifiche senza permessi root. Lo snapshot dell'ambiente e i processi in esecuzione sono distinti: al riavvio eseguire `npm run db:start`, poi avviare Next.js. Non è stato creato un URL di anteprima pubblica o privata esterna: questa sessione non dispone di un servizio di forwarding privato. Per aprire su iPhone usare il Mac e la rete Wi-Fi come sopra. Salvare una bozza di configurazione cloud non pubblica l'applicazione sul web.
