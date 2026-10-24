# Importare Statistiche Categorie da Wycash

In **Incassi**, il riquadro **Wycash · vendite per categoria** accetta il CSV originale con le colonne Categoria Merceologica, Sottocategoria, Totale Pezzi, Totale € e Totale Media €. In **Vendite** si consultano gli stessi riepiloghi già salvati.

1. Selezionare il locale in alto.
2. Caricare il CSV nel riquadro dedicato a Wycash.
3. Indicare le date iniziale e finale esatte impostate nell’esportazione Wycash, estremi compresi. Il file non contiene né queste date né il locale: non possono essere ricavati automaticamente.
4. Controllare anteprima, quantità e importi, quindi confermare l’importazione nel locale indicato.
5. Ricaricare la pagina e consultare il riepilogo salvato. Sono elencati gli ultimi 50 riepiloghi di quel locale.

Ogni file è un riepilogo dell’intero periodo. Non viene ripartito sui singoli giorni, non genera scontrini o coperti e non alimenta i KPI giornalieri della Dashboard. Le categorie non sono prodotti. Il valore Media Wycash è conservato come dichiarato nel file; non è usato per ricalcolare o sostituire gli importi. La quota è calcolata rispetto alla somma delle righe di quel singolo riepilogo.

I filtri Giorno/Settimana/Mese della pagina non riducono il periodo di un riepilogo. Si consulta un riepilogo alla volta: report con periodi sovrapposti non vengono sommati. Non è consentito inserire due report per lo stesso locale e le stesse date, neanche con un altro nome file o contenuto diverso. Per una correzione di un report già importato occorre una procedura di rettifica dedicata, non falsificare le date per superare il controllo.

Sono supportati virgola o punto e virgola come separatori CSV, BOM UTF-8 e importi con punto decimale o formato italiano (es. 1.234,56). Massimo 2 MB e 5.000 righe. Quantità intere non negative e importi non negativi con al massimo due decimali. Le righe con coppia categoria/sottocategoria duplicata o con un totale generale esplicito sono rifiutate. Un errore annulla tutto l’import.

Il formato scontrini preesistente resta nel riquadro **Importa gli incassi per scontrino**. Se si seleziona lì un CSV Categorie, il messaggio indirizza al riquadro corretto.

## Aggiornamento sul Mac

Lasciare Postgres avviato. Nel Terminale dell’app premere **Ctrl+C**. Scaricare il ramo `feat/wycash-categorie` con **Code → Download ZIP** e decomprimerlo. Da una nuova scheda del Terminale scrivere `bash `, trascinare il file `scripts/apply-wycash.sh` dall’archivio appena scaricato, poi premere Invio.

Lo script cerca `~/Downloads/bistro-modern-business`, salva una copia dei file interessati e applica una migrazione aggiuntiva. La connessione del proprietario deve essere già configurata in `MIGRATION_DATABASE_URL`. Non modificare `.env`, non eseguire reset o seed, non sostituire `.local` e non cancellare database. Se lo script segnala una connessione mancante, fermarsi e configurarla localmente con il proprietario del database.

La migrazione crea soltanto `CategoryReport`, con vincolo univoco su locale e periodo. Nel setup standard assegna SELECT/INSERT al ruolo `bistro_app`; su installazioni con altri ruoli applicativi il proprietario assegna questi stessi permessi al ruolo effettivo. La creazione del riepilogo e dell’audit è un’unica transazione. Le API verificano sessione, membership del locale, ruolo responsabile/amministratore e origine delle scritture.

Al termine, dalla cartella dell’app: `npm run dev`. Aprire `http://localhost:3000`, ricaricare con Comando+Maiusc+R e usare gli account esistenti.

## Verifiche

21 test unitari superati (9 nuovi per parser, centesimi, formati locali, periodi, duplicati e limiti), TypeScript e build Next.js superati. Migrazione iniziale più migrazione categorie provate con PostgreSQL embedded PGlite: vincoli di periodo e unicità, report distinti per locale, rollback atomico in caso di audit fallito, grant SELECT/INSERT e scontrini preesistenti preservati. Script di aggiornamento provato in cartelle temporanee con comandi npm simulati, sia in caso di successo sia di migrazione fallita. PGlite è stato usato solo per una verifica locale temporanea e non è una dipendenza del progetto.

Non sono state eseguite prove complete delle API con Prisma su PostgreSQL esterno né prove browser di questo modulo. Queste verifiche sul Mac vanno eseguite dopo l’aggiornamento; questa sessione non accede al database del dispositivo.

Il CSV dell’utente e i suoi dati non sono inclusi nel repository. I test usano soltanto esempi sintetici.
