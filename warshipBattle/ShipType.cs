namespace warshipBattle;

// Purchasable ship; serialized (camelCase) to game.js
public sealed record ShipType(
    string Id,
    string Name,
    string Description,
    int Price,
    int Hp,
    double Speed,
    double Accel,
    double Turn,
    double TurretTurn,
    double Reload,
    double Damage,
    double ShellSpeed,
    double Range,
    double Spread,
    double Length,
    double Width,
    int Turrets,
    int Barrels,
    double Bow,
    string Style,
    string Hull,
    string Deck,
    string Turret,
    string Special = "",
    int SpecialCount = 0,
    double SpecialCooldown = 0,
    double TurretSize = 0,
    double[]? TurretSlots = null,
    int Jets = 0,
    string Weapon = "",
    double[]? LauncherSlots = null,
    bool Hover = false)
{
    public string GunLabel => Turrets == 0 ? "geen"
        : Weapon == "mg" ? $"{Turrets} × {Barrels} mitrailleur" : $"{Turrets} × {Barrels}";

    public string SpecialName => Special switch
    {
        "torpedo" => $"Torpedo's ({SpecialCount}×)",
        "mines" => $"Mijnen ({SpecialCount}×)",
        "missile" => $"Geleide raketten ({SpecialCount}×)",
        "overdrive" => "Overdrive (snel herladen)",
        "smoke" => "Rookgordijn (onzichtbaar)",
        "seekmines" => $"Zoekmijnen ({SpecialCount}×)",
        "barrage" => $"Raketsalvo ({SpecialCount}×)",
        "shield" => "Actief pantser (70% minder schade)",
        "emp" => "EMP-puls (vijanden stil)",
        "heal" => "Reparatieteams (45% herstel)",
        _ => ""
    };
}

public static class ShipCatalog
{
    // Turn / TurretTurn in degrees per second, Spread in degrees, Bow = taper start (lower = sharper)
    public static readonly IReadOnlyList<ShipType> All = new List<ShipType>
    {
        new("fregat", "Fregat Zeemeeuw", "Betrouwbaar startschip, alles gemiddeld.",
            0, 100, 90, 22, 34, 32, 2.6, 20, 430, 650, 0.6, 110, 26, 3, 2, 0.15, "fregat", "#5d6b78", "#8b9aa6", "#6c7882"),
        new("korvet", "Korvet Pijl", "Klein en razendsnel, twee lichte kanonnen.",
            1500, 60, 160, 45, 65, 70, 1.3, 10, 460, 520, 0.9, 80, 18, 2, 1, -0.05, "jager", "#7a8590", "#aab4bd", "#6a747d"),
        new("specht", "Mitrailleurboot Specht", "Snelle boot met twee dubbele mitrailleurs: korte afstand, enorme vuursnelheid.",
            2500, 70, 155, 44, 62, 120, 0.09, 1.6, 900, 450, 2.2, 78, 18, 2, 2, -0.05, "jager", "#5d6a5e", "#8c9a8d", "#3d463e",
            TurretSize: 14, Weapon: "mg"),
        new("jager", "Torpedojager Haai", "Snel en wendbaar, licht pantser, snel draaiende torens.",
            3000, 80, 145, 40, 58, 65, 1.6, 13, 460, 560, 0.8, 95, 20, 2, 1, -0.05, "jager", "#4f6a5a", "#7f9a88", "#5f7a6a"),
        new("monitor", "Monitor Bulldog", "Traag, één zware toren met enorme klap en bereik.",
            4500, 200, 60, 12, 26, 25, 3.8, 60, 480, 900, 0.5, 100, 34, 1, 3, 0.3, "fregat", "#55606a", "#7d8890", "#3f474e"),
        new("kruiser", "Kruiser Stormvogel", "Gebalanceerd: meer bereik en vuurkracht.",
            6000, 160, 105, 26, 36, 42, 2.0, 26, 470, 760, 0.5, 125, 28, 4, 2, 0.1, "kruiser", "#4a5a7a", "#7d8db0", "#5a6a8a"),
        new("wesp", "Torpedoboot Wesp", "Snelle boot met een dubbele torpedolanceerder.",
            7500, 70, 150, 42, 60, 60, 1.8, 11, 460, 540, 0.9, 88, 19, 2, 1, -0.05, "jager", "#3e6e70", "#6fa3a5", "#2f5a5c",
            "torpedo", 2, 12),
        new("horzel", "Raketboot Horzel", "Snelle boot met twee zelfzoekende raketten.",
            8000, 75, 150, 42, 60, 60, 1.8, 11, 460, 540, 0.9, 90, 20, 2, 1, -0.05, "jager", "#5e6670", "#8d96a0", "#4a525a",
            "missile", 2, 10, LauncherSlots: new[] { -0.2, 0.0 }),
        new("valk", "Lichte kruiser Valk", "Snel herladen, drie torens, wendbaar.",
            9000, 140, 125, 32, 44, 55, 1.5, 22, 470, 720, 0.6, 120, 26, 3, 2, 0.05, "kruiser", "#3f6470", "#73a0ad", "#4f7480"),
        new("spin", "Mijnenlegger Spin", "Laat mijnen achter zich die vijanden opblazen.",
            11000, 150, 95, 22, 34, 36, 2.2, 22, 470, 680, 0.6, 120, 28, 3, 2, 0.15, "fregat", "#5c5a3e", "#8e8b68", "#4a4830",
            "mines", 3, 15),
        new("zwaar", "Zware kruiser Donder", "Snelle torens, kort herladen, flinke klap.",
            14000, 220, 110, 24, 38, 50, 1.7, 34, 480, 840, 0.5, 140, 30, 4, 3, 0.18, "zwaar", "#6a5a4a", "#a08d78", "#7a6a5a"),
        new("orka", "Torpedokruiser Orka", "Kruiser met een waaier van vier torpedo's.",
            18000, 200, 115, 28, 38, 45, 1.9, 26, 470, 760, 0.5, 135, 28, 3, 2, 0.05, "kruiser", "#263240", "#55657a", "#1e2833",
            "torpedo", 4, 14),
        new("arend", "Raketkruiser Arend", "Vuurt vier raketten die zelf hun doel zoeken.",
            20000, 190, 115, 28, 38, 45, 1.9, 24, 470, 760, 0.5, 135, 28, 3, 2, 0.08, "kruiser", "#4c5866", "#7b8898", "#3c4652",
            "missile", 4, 12, LauncherSlots: new[] { -0.22, -0.25, -0.22, 0.25 }),
        new("titan", "Slagschip Titan", "Zwaar pantser, enorm bereik en schade, maar traag draaiende torens.",
            22000, 340, 68, 14, 22, 20, 3.4, 55, 500, 980, 0.4, 170, 36, 4, 3, 0.28, "titan", "#3d4247", "#6e757c", "#4d5358"),
        new("schim", "Stealthfregat Schim", "Legt een rookgordijn: vijanden verliezen je uit het oog.",
            25000, 160, 135, 36, 50, 55, 1.6, 28, 480, 740, 0.5, 115, 24, 3, 2, -0.02, "jager", "#2c2f33", "#55595e", "#1f2225",
            "smoke", 0, 25),
        new("furie", "Slagkruiser Furie", "Overdrive: torens herladen kort razendsnel.",
            30000, 300, 105, 24, 32, 40, 2.2, 45, 490, 900, 0.45, 160, 32, 4, 3, 0.12, "zwaar", "#6e2f2f", "#a05a52", "#5a2626",
            "overdrive", 0, 30),
        new("zeus", "Raketslagschip Zeus", "Zwaar slagschip met een salvo van zes geleide raketten.",
            40000, 380, 72, 16, 26, 26, 2.8, 50, 500, 960, 0.4, 175, 36, 4, 3, 0.2, "zwaar", "#454b52", "#737a82", "#353a40",
            "missile", 6, 14, LauncherSlots: new[] { -0.08, -0.36, -0.08, 0.36 }),
        new("poseidon", "Vliegdekschip Poseidon", "Het ultieme schip: 20 straaljagers met elk 5 bommen, 4 geleide raketten uit 4 lanceerbuizen en enorm pantser.",
            100000, 900, 72, 12, 16, 50, 1.4, 22, 520, 820, 0.6, 290, 64, 0, 2, 0.32, "carrier", "#474d53", "#5a6066", "#3a4046",
            "missile", 4, 12,
            Jets: 20, LauncherSlots: new[] { 0.08, -0.47, -0.08, -0.47, 0.03, 0.47, -0.12, 0.47 }),
        new("leviathan", "Superslagschip Leviathan", "Vijf zware torens, onverwoestbaar, maar log.",
            45000, 480, 60, 11, 18, 18, 3.0, 60, 510, 1050, 0.4, 200, 42, 5, 3, 0.3, "titan", "#2f3a33", "#5f6e63", "#3f4a43"),

        // Mine ships
        new("mol", "Mijnenlegger Mol", "Kleine, snelle mijnenlegger: twee mijnen per keer.",
            5000, 90, 120, 34, 50, 55, 1.8, 12, 450, 560, 0.8, 92, 22, 2, 1, -0.02, "jager", "#5a5a44", "#8a8a6c", "#45452f",
            "mines", 2, 10),
        new("zeeslang", "Zoekmijnenlegger Zeeslang", "Legt vier zoekmijnen die zelf naar vijanden toe drijven.",
            16500, 170, 105, 26, 38, 42, 2.0, 22, 470, 700, 0.6, 125, 28, 3, 2, 0.12, "kruiser", "#3d4f3a", "#6b8066", "#2f3d2c",
            "seekmines", 4, 16),
        new("bever", "Mijnenkruiser Bever", "Strooit een veld van zes mijnen achter zich.",
            24000, 210, 100, 24, 36, 45, 1.9, 26, 470, 780, 0.5, 135, 30, 3, 2, 0.1, "kruiser", "#5e5038", "#8f7f60", "#473c2a",
            "mines", 6, 18),
        new("kraken", "Mijnenslagschip Kraken", "Slagschip dat acht zoekmijnen tegelijk uitzet.",
            55000, 420, 65, 13, 22, 22, 3.0, 52, 500, 980, 0.4, 185, 38, 4, 3, 0.25, "titan", "#2d3a40", "#5b6c74", "#1f2a30",
            "seekmines", 8, 20),

        // Rocket artillery
        new("hagel", "Raketboot Hagel", "Vuurt een salvo van 8 ongeleide raketten op een gebied.",
            9500, 80, 145, 40, 58, 60, 1.8, 11, 460, 540, 0.9, 90, 20, 2, 1, -0.05, "jager", "#6a5e4e", "#9a8e7a", "#4e4438",
            "barrage", 8, 12),
        new("vulkaan", "Raketartillerie Vulkaan", "Een salvo van 16 raketten verwoest een heel gebied.",
            28000, 240, 95, 22, 32, 40, 2.2, 30, 480, 820, 0.5, 150, 32, 3, 2, 0.15, "zwaar", "#5a3e34", "#8a6a5c", "#432d25",
            "barrage", 16, 18),
        new("ragnarok", "Artillerieslagschip Ragnarok", "Slagschip met een vernietigend salvo van 24 raketten.",
            65000, 460, 62, 12, 20, 20, 3.0, 56, 510, 1000, 0.4, 195, 40, 4, 3, 0.28, "titan", "#4a2a2a", "#7a5050", "#361e1e",
            "barrage", 24, 20),

        // Active armour
        new("schildpad", "Pantserschip Schildpad", "Actief pantser: 8 seconden lang 70% minder schade.",
            15500, 260, 70, 16, 26, 30, 2.6, 30, 470, 760, 0.5, 125, 32, 3, 2, 0.25, "fregat", "#4d5a52", "#78867d", "#39433d",
            "shield", 0, 25),
        new("bastion", "Pantserkruiser Bastion", "Zware kruiser met actief pantser en vier torens.",
            23000, 260, 100, 22, 34, 45, 1.9, 32, 480, 820, 0.5, 145, 30, 4, 2, 0.18, "zwaar", "#5b6066", "#8b9096", "#454a50",
            "shield", 0, 22),

        // EMP
        new("bliksem", "EMP-fregat Bliksem", "Een elektromagnetische puls legt alle vijanden in de buurt 6 seconden stil.",
            19000, 150, 130, 34, 48, 55, 1.6, 22, 470, 720, 0.6, 115, 24, 3, 2, -0.02, "jager", "#2e3d55", "#5a6d8a", "#223047",
            "emp", 0, 28),
        new("tempest", "EMP-kruiser Tempest", "Sterke kruiser met EMP-puls en vier torens.",
            36000, 260, 110, 26, 36, 48, 1.8, 30, 480, 840, 0.5, 145, 30, 4, 2, 0.08, "kruiser", "#30365a", "#5d6390", "#24294a",
            "emp", 0, 24),

        // Repair
        new("ooievaar", "Reparatieschip Ooievaar", "Reparatieteams herstellen 45% van je romp in 8 seconden.",
            13000, 170, 95, 22, 34, 40, 2.2, 20, 460, 660, 0.6, 120, 28, 2, 2, 0.15, "fregat", "#c9ced3", "#e2e6ea", "#7d868e",
            "heal", 0, 30),
        new("feniks", "Slagkruiser Feniks", "Zware slagkruiser die zichzelf herstelt.",
            42000, 360, 100, 22, 30, 38, 2.2, 46, 490, 900, 0.45, 165, 34, 4, 3, 0.14, "zwaar", "#7a4a22", "#b07a4a", "#5c3618",
            "heal", 0, 26),

        // Hovercraft: very fast on water, slow on land, can cross beaches (not into vegetation)
        new("zwaluw", "Hovercraft Zwaluw", "Razendsnelle hovercraft met een dubbele mitrailleur. Kan over land, ook door de bossen.",
            6500, 70, 240, 70, 70, 120, 0.09, 1.6, 900, 450, 2.2, 70, 32, 1, 2, 0.35, "hover", "#6b7a5a", "#93a283", "#3d463e",
            TurretSize: 14, TurretSlots: new[] { 0.36, 0.0 }, Weapon: "mg", Hover: true),
        new("storm", "Aanvalshovercraft Storm", "Snelle hovercraft met twee kanonnen en een raketsalvo. Kan over land.",
            17000, 110, 220, 60, 60, 75, 1.5, 16, 470, 620, 0.8, 86, 38, 2, 1, 0.35, "hover", "#5a6470", "#8792a0", "#434c56",
            "barrage", 6, 12, TurretSlots: new[] { 0.38, 0.0, 0.02, 0.0 }, Hover: true),
        new("tornado", "Zware hovercraft Tornado", "Gepantserde landingshovercraft met rookgordijn. Snel op zee, kan over land.",
            29000, 170, 200, 50, 50, 60, 1.7, 24, 480, 720, 0.7, 100, 44, 2, 2, 0.35, "hover", "#4e5a46", "#7b8870", "#384232",
            "smoke", 0, 22, TurretSlots: new[] { 0.38, 0.0, 0.04, 0.0 }, Hover: true),

        // Torpedoes
        new("hydra", "Torpedokruiser Hydra", "Een waaier van zes torpedo's tegelijk.",
            32000, 230, 115, 28, 38, 45, 1.9, 26, 470, 780, 0.5, 140, 28, 3, 2, 0.05, "kruiser", "#1f3a44", "#4d6e7a", "#172c34",
            "torpedo", 6, 16),
    }.OrderBy(s => s.Price).ToList();

    public static ShipType Get(string? id) => All.FirstOrDefault(s => s.Id == id) ?? All[0];
}

// Difficulty level; serialized (camelCase) to game.js
public sealed record Difficulty(
    string Id,
    string Name,
    int Reward,
    int Unlock,
    double EnemyHp,
    double EnemyDamage,
    double EnemyReload,
    double EnemySpread,
    int StartEnemies,
    int MaxEnemies);

public static class DifficultyCatalog
{
    // Unlock = total coins ever earned needed to pick this level
    public static readonly IReadOnlyList<Difficulty> All = new List<Difficulty>
    {
        new("makkelijk", "Makkelijk", 500, 0, 0.7, 0.6, 1.3, 1.5, 2, 5),
        new("normaal", "Normaal", 1000, 0, 1.0, 1.0, 1.0, 1.0, 3, 8),
        new("moeilijk", "Moeilijk", 2000, 0, 1.4, 1.4, 0.8, 0.8, 4, 10),
        new("extreem", "Extreem", 4000, 0, 2.0, 1.9, 0.65, 0.6, 5, 12),
    };

    public static Difficulty Get(string? id) => All.FirstOrDefault(d => d.Id == id) ?? All[1];
}
