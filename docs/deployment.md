# Deployment og telefonbuild

## Gruppens API

`Dockerfile` bygger en selvstændig Node 24-server med kun serverafhængigheder i runtime. Kør med vedvarende `/data`, HTTPS foran serveren og en faktisk offentlig adresse. Der er ingen hemmelige standardnøgler. Private gruppe-/deltagertokens oprettes tilfældigt og gemmes som hashes på serveren.

```sh
docker build -t motosalt-api .
docker volume create motosalt-data
docker run --name motosalt-api -p 127.0.0.1:3001:3001 -v motosalt-data:/data motosalt-api
```

Sæt HTTPS/reverse proxy op hos din valgte udbyder, og afprøv `/health`. Ved webhosting skal `MOTOSALT_CORS_ORIGINS` indeholde den faktiske weborigin. Der skal være backup af SQLite-filen og en proces til sletning/moderation af delte observationer. Flere serverkopier kan ikke blot dele den lokale SQLite-fil.

`render.yaml` er et konkret alternativ med én Docker-webservice, health check og 1 GB vedvarende disk. **Starter-service og disk koster penge efter udbyderens aktuelle priser.** Filen har ikke oprettet eller bestilt en tjeneste. Deploy Blueprint fra ejerens Render-konto og det repository, som koden er pushed til. Der er ikke adgang til en hostingkonto i dette miljø, og ingen offentlig serveradresse er opfundet.

Efter deployment sættes `EXPO_PUBLIC_API_URL` til API'ets faktiske HTTPS-adresse før appbuild. Det er en offentlig adresse, aldrig et token. Den lokale cloudserver er ikke en offentligt tilgængelig gruppeserver.

## Android

På Linux x86_64 kan `npm run android:apk` hente SHA256-kontrollerede Temurin JDK 17/21, Android-kommandoværktøjer og en fast Expo-template til en ignoreret cache. SDK-pakker installeres med Androids normale værktøj. Gradles download har fast SHA256. Eksisterende TLS-kontrol og proxy bevares. Buildlog: `/workspace/.cache/motosalt-android/gradle-build.log` ved dette checkout.

Buildet indeholder JS-bundlen og kræver ikke Metro/Expo Go for at starte. Det er ARM64 og bruger den genererede Expo/Android-udviklingssignatur til installationstest. **Det er ikke ejerens butikssignatur.** Google Play-udgivelse skal bruge ejerens release-nøgle/Play App Signing og korrekt versionering. Resultatet kopieres til `artifacts/` med SHA256-sidefil, når hele native buildet er lykkedes. Scriptet afbryder ved fejl og laver ikke en falsk APK.

Der er også EAS-profiler i `eas.json`. EAS/Expo- eller butikskonto er ikke oprettet på ejerens vegne. iOS-build kræver macOS/Xcode eller ejerens EAS/Apple-opsætning.

## Før lancering

Afprøv GPS-tilladelser, forgrundsdeling/stop ved baggrund, WebView, deep links, GPX/deling, SecureStore og påmindelser på fysiske Android- og iOS-enheder. Kontrollér kommercielle vilkår for Open-Meteo, trafikkortets vinterfeed og fællesskabernes kort-/rutetjenester. En nøgle til et kommercielt vejr-API skal blive på en backend.
