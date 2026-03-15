COME INSTALLARE GESTORE SU UMBREL

1) Copia la cartella "gestore" dentro uno dei tuoi app store locali di Umbrel.
   Esempio tipico:
   /home/umbrel/umbrel/app-stores/<nome-store>/gestore

2) Poi installa l'app da Umbrel:
   - aprendo l'App Store e cercando "GestOre"
   - oppure da terminale:
     umbreld client apps.install.mutate --appId gestore

3) Dopo l'installazione la trovi nella dashboard di Umbrel.

NOTE
- I dati persistenti vengono salvati in:
  ${APP_DATA_DIR}/data/gestore_data.sqlite3
- Se il database persistente è vuoto al primo avvio, viene copiato quello incluso
  nel pacchetto.
- L'app espone la UI tramite app_proxy di Umbrel, quindi non serve scrivere :8080
  se la installi come vera app Umbrel.
