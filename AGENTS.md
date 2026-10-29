# Arbejdsinstruktioner for Motosalt

## Brugerens faste instruktion

Brugeren har bedt om, at nødvendige projektfiler oprettes, og har udtrykkeligt gjort denne tilladelse gældende for fremtidige opgaver i dette repository. Opret og vedligehold derfor selv den kode, de tests, afhængigheder, mapper, hjælpefiler og den konfiguration, der er nødvendige for den aktuelle opgave. Spørg ikke igen om tilladelse til almindelig oprettelse eller ændring af disse filer. Det gælder også ved opsætning af udviklingsmiljøet. Bevar eksisterende brugerændringer.

## Produkt

- Motosalt er en **mobilapp til iOS og Android**, bygget med Expo, React Native og TypeScript. Webeksport er et supplerende valideringsværktøj.
- Appen skal fungere i hele Danmark, inklusive Jylland, Sjælland og øerne. Antag aldrig brugerens placering, og forudvælg ikke Fyn/Odense. Brug stedssøgning eller GPS efter brugerens valg. Appen må ikke tilbyde demoture eller simulerede vejforhold.
- Målgruppen er motorcyklister og ejere af klassiske biler. Kombiner personlige rundture, overblik over restsalt og gruppeture med planlagte stop.
- Skeln mellem bløde sving, tætte sving og åbne veje.
- Vis saltningshistorik, regn siden saltning, kilder, tidspunkter og usikkerhed. Regn alene er ikke dokumentation for saltfri vej.
- Brug aldrig “saltfri” eller “sikker at køre” som et løfte fra en estimeret saltstatus. Manglende eller forældede data skal give “ukendt”.
- Livekortet bruger OpenStreetMap, og livegeometrien kommer fra Valhalla. Vejrdata kommer fra Open-Meteo. Vinteroplysninger hentes fra Vejdirektoratets offentlige trafikkort med synlig kilde, tidsstempel, dækning og usikkerhed. Opfind ikke et officielt saltnings-API eller erstat manglende data med et gæt.
- Se `docs/product.md` og `docs/data-sources.md` for scope og åbne integrationer.

## Udviklingsmiljø

- Brug det eksisterende checkout. Cloudopgaver er allerede isolerede; opret ikke et ekstra Git-worktree, medmindre brugeren udtrykkeligt beder om det.
- Brug Node-versionen i `.node-version` og npm med `package-lock.json`.
- Installer med `npm ci`. `.npmrc` placerer pakkecachen i den ignorerede mappe `.cache/npm`.
- `npm run server` starter gruppeserveren med SQLite og filovervågning på port 3001. `npm run server:build` bygger en selvstændig Node-server; `npm run server:start` starter den byggede server.
- `npm start` starter Metro. `npm run start:cloud` starter uden krav om Expo-login eller adgang til Expos metadata-API.
- Kør `npm run check` efter relevante kodeændringer: lint, typekontrol af app/server, app-/servertests, serverbuild og eksport af iOS-, Android- og webbundles.
- I cloud sættes `EXPO_NO_TELEMETRY=1`, `EXPO_OFFLINE=1` og `CI=1` ved kontrol/eksport. Ved serverstart bruges `EXPO_NO_TELEMETRY=1 EXPO_UNSTABLE_HEADLESS=1 npm run start:cloud` uden CI, så filovervågning virker og desktop-DevTools ikke installeres. Installation bruger stadig npm-registry med normal integritetskontrol.
- Brug Expo SDK'ets `bundledNativeModules.json` / `expo install` til kompatible native versioner. Gem lockfilen ved en autoriseret afhængighedsændring; brug derefter `npm ci`.
- En vellykket JS-/Hermes-eksport er ikke en signeret native app eller dokumentation for afprøvning på en telefon. Hold resultaterne adskilt.
- Gem aldrig credentials i kode, dokumentation eller logs. Opdater README, når opsætning eller arbejdsgang ændres.

- Gruppens deltageradgang gemmes i SecureStore på native og sessionStorage i webkontrollen. Del aldrig deltager-tokenet i invitationslinket. Position deles kun ved et udtrykkeligt tilvalg og skal stoppes ved app-baggrund eller afbrudt tracking.
- `npm run test:live` og `npm run test:coverage` er manuelle tests mod offentlige tjenester, ikke en del af den netværksuafhængige CI. Brug de eksisterende proxyindstillinger; på Node i cloud kan `NODE_USE_ENV_PROXY=1` være nødvendig.
