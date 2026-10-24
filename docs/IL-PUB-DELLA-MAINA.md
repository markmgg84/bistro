# Il pub della Maina

L'app assume il nome **Il pub della Maina**. Il logo generale è quello fornito, ripulito dalle indicazioni di stampa “150 cm” e “SCALA 1:1”. I loghi Bistrò e Marina di Levante sono quelli originali caricati, adattati alle dimensioni web.

- Identità generale: ancora blu petrolio e scritta rossa.
- Bistrò: petrolio `#105b6c`, accento rosso `#bf1733`; nessun arancione.
- Marina: petrolio `#006e86`, accento arancione `#ffa000`.
- Accesso, menu laterale, intestazioni, grafici, pulsanti, icone e nome della PWA aggiornati.

La modifica comprende il precedente ramo Modern Business, da cui parte. API, autenticazione, autorizzazioni, struttura del database, calcoli, importazioni e dati non sono modificati.

## Aggiornare la copia già funzionante sul Mac

1. Scaricare il ramo `brand/il-pub-della-maina` da GitHub: **Code → Download ZIP**. Decomprimere lo ZIP in Download.
2. Aprire una nuova scheda del Terminale con **Comando+T**.
3. Scrivere `bash ` (con uno spazio), trascinare nel Terminale il file `scripts/apply-branding.sh` dall'archivio appena decompresso, quindi premere Invio.
4. Lo script cerca la copia già funzionante in `~/Downloads/bistro-modern-business`, crea una copia della grafica precedente e sostituisce esclusivamente i file dell'interfaccia. Per un'altra destinazione, aggiungere il percorso della cartella dopo quello dello script.
5. Nella scheda del Terminale dove gira l'app premere **Ctrl+C**, poi `npm run dev` e Invio. Lasciare Postgres avviato.
6. Aprire `http://localhost:3000` e premere **Comando+Maiusc+R**. Le credenziali restano le stesse.

Non eseguire nuovamente il setup del database e non sostituire `.env` o `.local`. Il comando di aggiornamento non li copia né li cancella.

## Verifiche

Build Next.js completata; controllo TypeScript superato; 12 test unitari superati con `node --import tsx --test tests/*.test.ts`.

Il test browser non è stato eseguito: Chromium non è disponibile nell'ambiente e il download del browser non è riuscito. Non sono state eseguite prove di accesso o scritture nel database del Mac. Sul Mac verificare accesso, cambio locale e disposizione su telefono.
