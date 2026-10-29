# Motosalt

Mobilapp til **iOS og Android** med personlige rundture, turvejr, vinterdrift og gruppeture i **hele Danmark**. Brugeren vælger selv startsted eller frivillig GPS. Der er ingen demoture eller simulerede vejforhold i appen.

## Funktioner

- Photon-stedssøgning og Valhalla-rundture på rigtige veje. Motorcykel/bil, bløde/tætte sving eller åbne veje, tid, retning og motorvejs-/gruspræferencer.
- Interaktivt OpenStreetMap-kort med bundlet Leaflet i native WebView. Ingen Google Maps-nøgle. Danske rutetrin, manuelle rutestop, GPX og deling.
- Op til 30 lokalt gemte ture med geometri og senest hentede vejr.
- Open-Meteo-regn/byger, temperatur, vind, vindstød, nedbørssandsynlighed, sigtbarhed og vejrkode ved tre rutepunkter. Syv dages historik og tre dages prognose.
- **Perfekt turvejr / Genovervej / Anbefales ikke**, beregnet for turens afgang og omtrentlige varighed. Manglende eller forældede prognoser giver ikke en positiv vurdering.
- **Vejdirektoratets offentlige vinterfeed**: registreret saltning/snerydning, igangværende arbejde, geografisk match og vinterlag med datadækning og tidsstempler. Modelregn siden registreringen vises, når perioden og området er dækket.
- Privat gruppetur med invitation, fælles rute/mødested/afgang, deltagere, mindste rækkevidde, leder/bagtrop, status, beskeder og frivillig positionsdeling i forgrunden.
- Lokal afgangspåmindelse og lokale eller udtrykkeligt delte kørerobservationer.

**Saltstatus er ukendt på veje uden dækkende, aktuelle oplysninger.** Et vejrmæssigt godt tidspunkt er ikke dokumentation for saltfri vej. Vinterfeedet beskriver registreret behandling/føre, ikke målt restsalt. Regn tæller aldrig automatisk som bevis for, at salt er væk.

## Udvikling

Brug Node **24.19.0** og npm:

```sh
npm ci
npm run server
# I en anden terminal:
npm start
```

Cloudmiljø med eksisterende netværksproxy:

```sh
NODE_USE_ENV_PROXY=1 npm run server
EXPO_NO_TELEMETRY=1 EXPO_UNSTABLE_HEADLESS=1 npm run start:cloud
```

API: port 3001, SQLite i `.data/motosalt.sqlite`. Metro: port 8081. Cloudstart bruger installerede SDK-metadata; appens egne datakald er stadig online. `npm ci` genererer Leaflet-assets fra den låste npm-afhængighed. Sæt kun `CI=1` under kontroller/eksport, så udviklingsserverens filovervågning bevares. Bevar `.env`, `.data` og eksisterende brugerarbejde.

## Kontroller

```sh
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 npm run check
```

Kører lint, app-/servertypekontrol, tests, selvstændigt serverbuild, genstart/SQLite-kontrol og JS-/Hermes-eksport til Android/iOS/web. Web er supplerende validering af den mobile app.

Netværksafhængige livekontroller, adskilt fra CI:

```sh
NODE_USE_ENV_PROXY=1 npm run test:live
NODE_USE_ENV_PROXY=1 npm run test:coverage
NODE_USE_ENV_PROXY=1 npm run test:winter
NODE_USE_ENV_PROXY=1 npm run test:stops
```

Rundture er hentet ved Aarhus, Roskilde og Rønne, og motorcykel-/bilprofiler er prøvet. Vinterfeed og geometri er hentet i praksis; Roskilde gav 38/41 match i den første kontrol, Aarhus/Rønne nul entydige match med understøttede vejklasser. Det er kildeafhængige øjebliksbilleder, ikke fuld dansk datadækning. Overpass-søgning efter caféer/tankstationer blev afvist/utilgængelig i cloud; **manuelle rutestop fungerer uafhængigt af opslaget**.

## Installerbar Android-version

```sh
npm run android:apk
```

Linux x86_64-scriptet henter kontrollerede JDK-/Android-værktøjer, genererer native projektet og bygger en selvstændig ARM64-APK med indbygget JS. Det bruger udviklingssignaturen til installationstest og kopierer kun en fil til `artifacts/`, når native buildet lykkes. Det er forskelligt fra `dist/`, som kun indeholder JS-/Hermes-eksporter. Byg med den faktiske `EXPO_PUBLIC_API_URL` for at tilslutte en offentligt tilgængelig gruppeserver.

iOS kræver macOS/Xcode eller ejerens EAS/Apple-opsætning. EAS-profiler er forberedt i `eas.json`; ingen butikskonto eller betaling er oprettet. Fysisk telefontest og ejerens release-signering er stadig nødvendige før offentlig udgivelse.

## Gruppens server og deployment

```sh
npm run server:build
npm run server:start
```

Serveren læser `.env` uden at overskrive eksisterende procesvariabler. Se `.env.example`:

- `EXPO_PUBLIC_API_URL`: faktisk offentlig HTTPS-adresse, indbygget i appen. Ikke en hemmelighed. Lokal udvikling kan finde Expo-værten automatisk.
- `MOTOSALT_API_PORT`, `MOTOSALT_DATABASE_PATH`: port og vedvarende SQLite-placering.
- `MOTOSALT_CORS_ORIGINS`: tilladte weborigins, kommasepareret.

Native deltageradgang gemmes i SecureStore, webkontrollen bruger sessionStorage. Invitationer indeholder aldrig arrangørens deltager-token. Der er én aktiv gruppe pr. enhed og ingen kontogendannelse. Position deles kun efter tilvalg og stoppes ved baggrund; påmindelser er lokale, ikke saltalarmer.

Serveren har også en afgrænset, cachet `/v1/winter/*`-proxy til webkontrollen. Native henter de offentlige vinterressourcer direkte.

`Dockerfile` og `render.yaml` klargør deployment med health check og vedvarende disk. Render-konfigurationen kræver en betalt service/disk efter udbyderens aktuelle priser; ingen tjeneste er bestilt. Der er endnu ingen offentlig gruppeserver eller butikspublicering. Se [deployment](docs/deployment.md).

## Datakvalitet og udgivelse

Vejr: Open-Meteo, CC BY 4.0; gratis API-adgang er til ikke-kommerciel brug. Vinterdrift: Vejdirektoratets offentlige trafikkort; integrationen virker, men er ikke en aftalt stabil API-kontrakt. Kort: OpenStreetMap-bidragsydere. Offentlige API'er kræver afklaret kapacitet og genbrugsvilkår til kommerciel lancering.

Svingønsker er præferencer, ikke en valideret klassifikation af alle kurver. Køretid udelader pauser og aktuelle trafikforhold. GPX/rutetrin er ikke stemmestyret navigation. Friktion, vejtemperatur og restsalt måles ikke af appen.

Se [datakilder](docs/data-sources.md), [produktstatus](docs/product.md), [deployment](docs/deployment.md) og [arbejdsinstruktioner](AGENTS.md).

## Seneste validering

Ren `npm ci` og hele `npm run check` består med 79 app-tests og 6 server-tests. Selvstændig ARM64-APK er bygget og signaturkontrolleret; den indeholder Hermes-bundlen. Servercontaineren er afprøvet med gruppeoprettelse, genstart og bevaret SQLite-data. Mobilvisningen er kontrolleret med registrerede, TLS-verificerede rute-/vejrsvar og det levende vinterfeed. Det erstatter ikke fysisk telefontest eller en offentlig deployment.
