# Datakilder

Afprøvet 27. oktober 2026 med almindelig TLS-kontrol. Appen bruger levende datakilder; testfixtures indlæses kun af tests.

## Vinterdrift fra Vejdirektoratet

Det offentlige [trafikkort](https://trafikkort.vejdirektoratet.dk/) anvender disse offentlige ressourcer, identificeret i kortets egen klientkode:

- [Aktuelle vinterregistreringer](https://storage.googleapis.com/trafikkort-data-tiles/winter.json).
- [Vejnettets version](https://storage.googleapis.com/trafikkort-data-tiles/winter-network-metadata.json).
- Vektorfelter under `https://tiles.trafikinfo.net/winter-network/v{version}/{z}/{x}/{y}.pbf`.

Adapteren bruger samme feature-ID'er og EPSG:25832-projektion som kortet. Den læser vejklasse, seneste registrering i Unix-sekunder, igangværende vinterarbejde og føremelding. Klassen 11 bruges som statsvej og 21–24 som kommunal vej. Cykelstier og ukendte vejklasser tæller ikke som match for en køretur. Nul eller ugyldig hændelsestid betyder **ukendt**, aldrig “aldrig saltet”.

En registrering beskriver **saltning/snerydning**, ikke en laboratoriemåling af restsalt og ikke nødvendigvis en komplet hændelseshistorik. Kilden indeholder også gamle tidspunkter og ukendte vejklasser. Opdateringstid for feedet gør ikke en gammel vejs registrering til en ny saltning.

Ruten kontrolleres omtrent hver kilometer, højst 201 punkter. Vejgeometri inden for 35 meter kan matches; forskellige feature-ID'er med næsten samme afstand (under 8 meters forskel) udelades som tvetydige. Store ruter begrænses til 96 kortfelter. Antal matchede kontrolpunkter er **ikke en procentvis garanti for hele rutens dækning**. Parallelle veje, kryds og broer kan give tvivl. Umatchede punkter forbliver ukendte.

Feedets `Last-Modified` skal være gyldigt og højst 30 minutter gammelt, ellers vises utilgængelige/forældede oplysninger. Ukendt saltstatus er altid synlig ved en positiv vejrvurdering. Vinterarbejde eller nylig registrering kan sænke anbefalingen; regn kan aldrig alene hæve den til “saltfri”.

Der er udført rigtige opslag efter feed, metadata og vektorfelter. Ved kontrollen matchede Roskilde-ruten 38 af 41 kontrolpunkter; de undersøgte Aarhus- og Rønne-ruter gav nul entydige match med understøttede vejklasser. Alle tre kunne hente kilden. Dette er øjebliksbilleder, ikke et løfte om alle danske kommuners datadækning.

Native henter de offentlige ressourcer direkte uden API-nøgle. Webkontrollen bruger den medfølgende servers `/v1/winter/*`-proxy for at undgå afhængighed af kildens CORS-politik. Proxyen accepterer kun faste ressourceadresser og validerede kortkoordinater. Den cacher aktuelle data i 30 sekunder og geometri efter version; forespørgsler har timeout og størrelsesgrænse. Klienten genkontrollerer vinterdata hver femte minut i forgrunden, ved genåbning og manuelt.

Dette er en fungerende integration med trafikkortets offentlige feed, **ikke en aftalt eller dokumenteret stabil API-kontrakt**. Genbrugsvilkår, varig adgang, kapacitet, præcis semantik og kommunal dækning skal afklares med Vejdirektoratet før kommerciel udgivelse. Der er ikke udtrukket nøgler eller sendt beskeder til myndigheden.

Vejdirektoratets områdevise vinterstatistik og Vinterman-kalendere bruges ikke som bevis for saltning eller fravær af salt på en bestemt vej.

## Vejr og regn

[Open-Meteo](https://github.com/open-meteo/open-meteo#readme) leverer modeldata fra syv dage tilbage og tre dage frem ved tre punkter fordelt langs ruten. Adapteren henter regn, byger, temperatur, vind, vindstød, nedbørssandsynlighed, WMO-vejrkode og sigtbarhed og kontrollerer enhederne. Alle disse felter er hentet og verificeret mod den levende tjeneste.

Regn er summen af flydende `rain` og `showers`; sne tælles ikke som vaskende regn. En timeværdi beskriver den foregående time. Kun hele timer efter et oplyst eller registreret behandlingstidspunkt summeres; manglende timer, nuller og dubletter giver ukendt. “Regn siden registrering” bruger nærmeste tilgængelige vejrpunkt, højst 25 km fra den viste stræknings midte, med synlig afstand. Det er modelregn omkring punktet, ikke måling på vejen.

Vurderingen følger den planlagte afgang og omtrentlige køretid gennem hele turen. Den kontrollerer også slutningen af ruten og kræver fulde, friske prognoser ved alle tre punkter. Manglende eller over tre timer gamle vejrdata kan ikke give en positiv vurdering.

De tre niveauer er **Perfekt turvejr**, **Genovervej** og **Anbefales ikke**. Frostnær luft, sne/frysende nedbør, kraftig regn/vind, torden og meget lav sigtbarhed kan give frarådning. Køligt vejr, moderat vind/regn eller nylig vinterbehandling giver forbehold. Grænserne er konservative produktregler, ikke en valideret køresikkerhedsmodel. Appen måler ikke vejtemperatur, trafik, friktion eller saltkoncentration.

Data er CC BY 4.0 med attribution. Gratis API-adgang er til ikke-kommerciel brug; en kommerciel app skal bruge en passende aftale. Eventuelle kommercielle nøgler skal ligge på en backend, aldrig i appens offentlige buildvariabler. DMI er en mulig supplerende kilde; der er ikke fundet eller tilsluttet en DMI-saltningskilde eller oprettet en DMI-aftale.

## Kort, ruter og stop

- **OpenStreetMap/Leaflet:** interaktivt kort i native WebView, synlig attribution, ingen Google-nøgle. Ingen bulkdownload eller offlinekortpakke.
- **Photon:** stedssøgning i hele Danmark uden antaget hjemsted.
- **Valhalla:** rigtig vejgeometri, motorcykel-/bilprofil og danske rutetrin. Svingønsker påvirker rutepunkter og vægte; der er ingen fysisk klassifikation af alle kurver. Motorvejsfravalg er en præference; kortdata kan have fejl.
- **Overpass:** valgfri søgning efter caféer/tankstationer. Cloudkontrollen gav afvisning/timeouts; manuel tilføjelse af rutestop virker uafhængigt af tjenesten. Fejl vises og erstattes ikke af opdigtede steder.

Offentlige fællesskabstjenester har kapacitetsgrænser og ingen garanti for drift. En offentlig/kommerciel lancering skal have passende kapacitet eller egen hosting.

## Andre vejrapps

Rain-projektets offentlige README og Open-Meteos projektliste er tidligere undersøgt som inspiration til timeoverblik, vind og tydelig offlineadfærd. CycleWeathers eget website kunne ikke afprøves. MotoMeteo/BikerWeather er nævnt i brugerens oplæg, men er ikke selvstændigt afprøvet her. Konkurrenters funktionslister dokumenterer ikke efterspørgsel eller fravær af en funktion. Der er ikke kopieret konkurrentkode eller skærmbilleder.
