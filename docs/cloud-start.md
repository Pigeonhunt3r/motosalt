# Motosalt cloud environment

Use the existing `/workspace/motosalt` checkout. Read AGENTS.md for the user's standing authorization to create and maintain necessary project files. Do not create a worktree unless requested, reset the checkout, overwrite `.env`, or remove `.data`. The repository began unborn and its new source files may not yet be pushed to GitHub. Preserve them and user data.

The product is an Expo SDK 58 / React Native / TypeScript mobile app for iOS and Android, throughout Denmark. The user chooses their place or optional GPS. There are no demo routes or simulated road conditions in the app. Fixtures in tests are not shipped app data.

Use Node 24.19.0 and npm. Run `npm ci` from `/workspace/motosalt` to refresh dependencies; keep package-lock.json and TLS/integrity verification. Postinstall generates local Leaflet assets. Run `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 npm run check` for lint, type checks, 79 app tests, 6 server tests, compiled API build/restart/SQLite checks and Android/iOS/web JS/Hermes exports. Do not confuse exports with native installation files.

Start the group API in a persistent terminal:

```sh
cd /workspace/motosalt
NODE_USE_ENV_PROXY=1 npm run server
```

Port 3001; SQLite `.data/motosalt.sqlite`. It loads `.env` without overriding existing variables. Optional settings: MOTOSALT_API_PORT, MOTOSALT_DATABASE_PATH, MOTOSALT_CORS_ORIGINS. The existing cloud proxy is needed for Node's live winter requests. Compiled alternative: `npm run server:build` then `NODE_USE_ENV_PROXY=1 npm run server:start`.

Start Metro in another persistent terminal:

```sh
cd /workspace/motosalt
EXPO_NO_TELEMETRY=1 EXPO_UNSTABLE_HEADLESS=1 npm run start:cloud
```

Port 8081; installed/offline Expo metadata still allows app network calls. Do not set CI=1 for the watching development server. If ports are occupied, reuse the project's healthy process instead of killing unrelated services. Processes need restarting in future tasks; PIDs/ports alone do not prove readiness.

Internal readiness checks, not user-facing phone links:

```sh
curl --fail --silent --show-error http://127.0.0.1:3001/health
curl --fail --silent --show-error http://127.0.0.1:8081/status
```

Health must identify Motosalt/status ok; Metro must return packager-status:running. Compile a representative bundle if needed: `curl --fail --silent --show-error --max-time 60 --output /tmp/motosalt-android-dev.bundle 'http://127.0.0.1:8081/index.bundle?platform=android&dev=true&minify=false'`.

Connected services: Photon search, Valhalla motorcycle/car routing, bundled Leaflet/OpenStreetMap maps, Open-Meteo rain/showers/temperature/wind/gust/probability/WMO/visibility at three route samples, and Vejdirektoratet's public winter feed plus versioned EPSG:25832 vector tiles. Winter records come from storage.googleapis.com/trafikkort-data-tiles; geometry from tiles.trafikinfo.net/winter-network. Native fetches directly. Web uses the fixed/cached `/v1/winter/*` API proxy. No API keys were extracted or invented.

Winter data has been fetched and geometrically matched in real calls. One recorded Roskilde route matched 38/41 control points; another generated route matched 21/37. Sampled Aarhus/Rønne routes had no unambiguous supported-class matches. This is partial source coverage, not proof of salt absence. Old/invalid/missing source timestamps, unknown classes or ambiguous matches stay unknown. Do not turn rain or an old salting date into a salt-free/safe guarantee. Advice is explicitly about the forecast, with residual salt unknown. See docs/data-sources.md for source semantics and provider terms.

Manual live checks: `NODE_USE_ENV_PROXY=1 npm run test:live`, `test:coverage`, `test:winter`, optionally `test:stops`. Keep these outside network-independent CI. Overpass POI lookup has been unavailable/rejected here; manual route stops remain usable. Never silently replace an upstream failure with invented places/weather/salting.

Private groups use SQLite and random hashed access/invite tokens. Native participant access uses SecureStore, web uses sessionStorage. Never include the owner's participant token in invitations. GPS/group position is opt-in, foreground-only and stops at background. Local reminders are departure reminders, not salt alerts. Reports are unverified and sharing is opt-in.

The native Linux build script is `npm run android:apk`. It installs SHA256-verified portable JDK 17/21, Android tooling/SDK, and a pinned Expo template in `/workspace/.cache/motosalt-android`; generated Android files are ignored. It builds a self-contained ARM64 APK, embeds Hermes and copies output to `artifacts/motosalt-0.3.0-android-arm64.apk` with a SHA256 sidecar only after success. Build log: `/workspace/.cache/motosalt-android/gradle-build.log`. For JS-only changes with unchanged native configuration, `npm run android:apk -- --reuse-native` reuses the generated project. Full prebuild regenerates it, so preserve any deliberate native changes before rerunning.

This is a real installable app with live sources, using the generated development signing key for installation tests. It is not the owner's Play Store signature. A physical phone/emulator has not been used here. Verify APK signatures/manifest if rebuilding; do not claim physical testing from a successful build.

Dockerfile, server/package-lock.json and render.yaml prepare public deployment with a persistent disk. The container runtime was tested for real group creation, restart, SQLite persistence and authorised deletion. Local Docker validation installed the locked dependencies from the verified npm cache because this cloud's build-container network could not use normal external npm access. No trust store was changed.

There is no deployed public group API or hosting/account credential in this environment. The Render configuration would create a paid Starter service/disk only if the owner deploys it; nothing was ordered. The standalone app needs the actual EXPO_PUBLIC_API_URL before building to create groups against a public HTTPS server. Do not invent an address, put private keys in EXPO_PUBLIC variables, or present localhost as a public phone connection. iOS/store publication needs the owner's Apple/Expo accounts and release signing. See docs/deployment.md.

Live sources were verified with normal TLS in Node/curl. A mobile-size browser consumer used recorded, TLS-verified routing/weather responses and the actual live winter proxy. Direct external Chromium HTTPS was blocked by its CA setup; automatic approval previously rejected a permanent Chromium trust-store modification. None was changed. Do not bypass certificate verification or repeat that permanent trust-store change. Physical GPS/sharing/notifications/deep-link testing and commercial source agreements remain release work.
