# Warship Battle

Een 2D top-down zeeslagspel in de browser: vaar over een eindeloze oceaan, breng vijandelijke schepen tot zinken, vlieg je eigen vliegtuigen en verdien coins voor nieuwe schepen, vliegtuigen en upgrades.

Gebouwd met **Blazor WebAssembly (.NET 10)**; de hele game-engine draait in JavaScript op een canvas (2D + WebGL-water).

## Spelen

- **Start**: kies een moeilijkheid en druk op *Start*.
- **Scheepswerf**: schepen kopen, kiezen en upgraden (pantser, herladen, bereik, snelheid).
- **✈ Hangar**: vliegtuigen kopen en kiezen. Er is altijd één voertuig geselecteerd: een schip óf een vliegtuig.
- **🏅 Prestaties**: medailles en de top 5 per moeilijkheid.

### Besturing — computer

| Toets | Schip | Vliegtuig |
|---|---|---|
| W / S | vaart | gas (op de grond: taxiën) |
| A / D | roer | sturen |
| Muis | torens richten | — |
| Klik / spatie | vuren | boordwapens |
| F / rechtsklik | speciaal wapen | bommen / raketten / torpedo |
| G | dieptebommen | — |
| R | noodreparatie | — |
| T | opstijgen (landingsbaan of vliegdekschip) / terug naar je vliegtuig | landen / opstijgen |
| E | — | na de landing: terug naar je schip |
| X | stop | — |
| + / − / scrollwiel | zoomen | zoomen |
| M / Esc | geluid / pauze | geluid / pauze |

### Besturing — telefoon

Stuurwiel (links), gashendel (rechts) en knoppen ⚡ 🔧 💥 💣 ✈ 🚢. Tik op zee om te richten en te vuren; tik je vlak bij een schip of vliegtuig, dan richt je er precies op. Knijp met twee vingers om te zoomen.

## Wat zit er in

- **Eindeloze oceaan** met grote, langgerekte eilanden: strand, bos met losse bomen, palmen en rotsen. Detailniveau schaalt mee met de zoom.
- **36 schepen** om te kopen (fregatten tot slagschepen, mijnenleggers, raketartillerie, EMP-schepen, hovercrafts en vliegdekschip Poseidon), elk met een eigen speciaal wapen.
- **10 vliegtuigen** (jagers, duik- en torpedobommenwerpers, zware bommenwerper, straaljagers). Opstijgen en landen op landingsbanen of op je vliegdekschip (katapult en vanghaak); na de landing bijtanken, herbewapenen en zelf terug taxiën.
- **23 soorten vijanden**, waaronder torpedoboten en onderzeeërs (alleen te raken met torpedo's en dieptebommen), plus vijandelijke bommenwerpers.
- **Missies** (vernietigen, vliegtuigen neerhalen, konvooi escorteren van haven naar haven), **havens** voor gratis reparatie, **gedeeltelijke schade** (toren, brand, motor).
- **Weer en dag/nacht**: storm, mist en nacht met zoeklicht; radar wordt belangrijk.
- **Radar** (alleen op schepen met een radarmast), realistische motor-, schiet- en explosiegeluiden.

## Projectstructuur

```
warshipBattle.slnx
warshipBattle/
  ShipType.cs          schepen (ShipCatalog) en moeilijkheden (DifficultyCatalog)
  PlaneType.cs         vliegtuigen (PlaneCatalog)
  WarshipGame.razor    UI: HUD, scheepswerf, hangar, prestaties, voortgang (localStorage)
  wwwroot/
    index.html         CSS en auto-update (pollt version.json)
    js/game.js         complete game-engine
.github/workflows/deploy.yml   publicatie naar GitHub Pages
```

Instellingen staan als constanten bovenaan en in de blokken van `game.js`, o.a. `RANGE_FACTOR`, `ZOOM_MIN`, `ENEMY_TYPES`, `ISLAND_*`, `AIRSTRIP`, `PLANE`, `PART`, `HARBOR`, `ENV`.

## Lokaal draaien

```
dotnet run --project warshipBattle
```

Of open `warshipBattle.slnx` in Visual Studio en start het project. Na elke wijziging opnieuw bouwen: `game.js` wordt geladen met `?v={versie}-{BuildId}` zodat de browser altijd de nieuwste versie ophaalt.

## Publiceren

Een push naar GitHub start `.github/workflows/deploy.yml`: publish, `base href` aanpassen, `404.html`, `.nojekyll` en `version.json`. Zet in de repository **Settings → Pages → Source** op *GitHub Actions*. Open spelers krijgen een nieuwe versie automatisch binnen.

## Opslag

Voortgang wordt in de browser bewaard (`localStorage`): coins, gekochte schepen/vliegtuigen, upgrades, keuze, moeilijkheid, medailles (`wb-medals`) en scores (`wb-scores`).
