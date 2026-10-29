# Produktstatus

Motosalt er en mobilapp til iOS og Android for motorcyklister og ejere af klassiske biler i hele Danmark. Brugeren vælger selv by/adresse eller frivillig GPS. Der er ingen demoture eller simulerede forhold i appen.

## Implementeret

- Personlige rundture på rigtige veje: motorcykel/bil, bløde/tætte sving eller åbne veje, tid, retning, motorvej/grus.
- OSM-kort, danske rutetrin, manuelle stop, GPX, ruteopskrifter og op til 30 gemte ture.
- Virkelige Open-Meteo-data ved tre rutepunkter: regnhistorik, prognose, temperatur, vindstød, sigtbarhed og nedbørsrisiko.
- Turboks med “Perfekt turvejr”, “Genovervej” eller “Anbefales ikke”, beregnet for turens planlagte tidsrum. Ukendt saltstatus står særskilt.
- Vejdirektoratets offentlige vinterregistreringer, geografisk match, kilder/tidspunkter, delvis dækning, farvet vinterlag og modelregn efter en registrering. Ingen påstand om målt restsalt eller saltfri vej.
- Private gruppeinvitationer, fælles rute/mødested/afgang, roller, rækkevidder, status, beskeder og frivillige positioner via rigtig SQLite-server.
- Lokal afgangspåmindelse og kørerobservationer med særskilt samtykke til deling.
- Serverbuild, Dockerfile og deploymentkonfiguration med vedvarende disk.

## Udgivelse kræver fortsat

En faktisk offentlig HTTPS-gruppeserver og ejerens driftskonto, native signering/butiksopsætning, fysiske telefontests og afklaring af dataleverandørernes vilkår til kommerciel brug. En vellykket JS-eksport eller automatisk test er ikke dokumentation for disse trin.

Saltningsfeedet er hentet i praksis, men trafikkortets interne offentlige dataformat er ikke en kontrakt om stabil API-adgang. Huller i den kommunale dækning vises som ukendte. Der er endnu ingen valideret kemisk restsaltmodel.

Der er én aktiv gruppe pr. enhed, ingen kontogendannelse, baggrundssporing, stemmestyring, fotos eller pushalarmer om salt. Afgangspåmindelsen er lokal. Valgfri POI-søgning er afhængig af en offentlig Overpass-tjeneste; manuelle stop virker selvstændigt.
