namespace warshipBattle;

// Flyable aircraft (take off from island airstrips); serialized (camelCase) to game.js
public sealed record PlaneType(
    string Id,
    string Name,
    string Description,
    int Price,
    int Hp,
    double Speed,       // top speed
    double MinSpeed,    // stall speed
    double Turn,        // degrees per second
    string Gun,         // "mg" or "cannon"
    int Guns,
    double GunDamage,
    double GunRate,     // seconds between bursts
    string Ord,         // "", "bomb", "rocket", "torpedo", "missile"
    int OrdCount,
    double OrdDamage,
    double Fuel,        // seconds of flight
    double Length,
    double Span,
    string Color,
    bool Jet = false)
{
    public string GunLabel => $"{Guns} × {(Gun == "cannon" ? "boordkanon" : "machinegeweer")}";

    public string OrdLabel => Ord switch
    {
        "bomb" => $"{OrdCount} × bom",
        "rocket" => $"{OrdCount} × raket",
        "torpedo" => $"{OrdCount} × torpedo",
        "missile" => $"{OrdCount} × geleide raket",
        _ => "geen"
    };
}

public static class PlaneCatalog
{
    public static readonly IReadOnlyList<PlaneType> All = new List<PlaneType>
    {
        new("valkje", "Jager Valkje", "Wendbare lichte jager met twee machinegeweren.",
            4000, 40, 300, 130, 115, "mg", 2, 2, 0.08, "", 0, 0, 90, 22, 30, "#6b7a5a"),
        new("mustang", "Jager Mustang", "Snel en sterk: vier machinegeweren en twee raketten.",
            9000, 55, 330, 140, 100, "mg", 4, 2, 0.07, "rocket", 2, 40, 110, 24, 32, "#8a8f96"),
        new("stuka", "Duikbommenwerper Stuka", "Gooit één zware bom die bijna elk schip in één keer verwoest.",
            12000, 60, 240, 110, 85, "mg", 2, 2, 0.09, "bomb", 1, 230, 100, 25, 34, "#5e6650"),
        new("avenger", "Torpedobommenwerper Avenger", "Werpt een torpedo in het water die ook onderzeeërs raakt.",
            15000, 75, 230, 110, 75, "mg", 2, 2, 0.09, "torpedo", 1, 170, 110, 27, 38, "#3e5470"),
        new("typhoon", "Raketjager Typhoon", "Twee boordkanonnen en acht raketten onder de vleugels.",
            18000, 70, 310, 140, 90, "cannon", 2, 6, 0.15, "rocket", 8, 45, 100, 25, 36, "#6a6a52"),
        new("mosquito", "Snelle bommenwerper Mosquito", "Razendsnel met vier machinegeweren en twee bommen.",
            22000, 60, 340, 150, 95, "mg", 4, 2, 0.07, "bomb", 2, 140, 120, 26, 40, "#4e5e48"),
        new("corsair", "Jachtbommenwerper Corsair", "Zes machinegeweren en vier raketten: een vliegend fort voor aanvallen.",
            26000, 80, 320, 140, 95, "mg", 6, 2.2, 0.06, "rocket", 4, 45, 120, 26, 36, "#2e4a6e"),
        new("lancaster", "Zware bommenwerper Lancaster", "Traag maar sterk, met zes zware bommen en lang vliegbereik.",
            32000, 160, 200, 100, 55, "mg", 2, 2, 0.1, "bomb", 6, 180, 160, 34, 52, "#3a3e36"),
        new("meteor", "Straaljager Meteor", "Supersnelle straaljager met vier boordkanonnen.",
            40000, 70, 480, 200, 80, "cannon", 4, 7, 0.12, "", 0, 0, 70, 28, 30, "#9aa0a6", true),
        new("phantom", "Straaljager Phantom", "Het snelste toestel: een snelvuurkanon en vier geleide raketten.",
            60000, 100, 520, 220, 85, "cannon", 1, 9, 0.05, "missile", 4, 90, 80, 34, 28, "#5d6a5a", true),
    };

    public static PlaneType? Get(string? id) => All.FirstOrDefault(p => p.Id == id);
}
