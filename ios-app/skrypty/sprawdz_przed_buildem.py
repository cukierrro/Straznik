import io, re, json, sys
sys.stdout.reconfigure(encoding="utf-8")

css = io.open("frontend/style.css", encoding="utf-8", errors="replace").read()
h = io.open("frontend/index.html", encoding="utf-8", errors="replace").read()
js = io.open("frontend/app.js", encoding="utf-8", errors="replace").read()
blad = []

# --- stale sprawdzenia ---
bez = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
a = len(re.findall(r"-webkit-backdrop-filter\s*:", bez))
b = len(re.findall(r"(?<!-)backdrop-filter\s*:", bez))
print(f"prefiksy: {a}/{b}", "OK" if a == b else "UWAGA")
if a != b:
    blad.append("prefiksy")

for i, k in [("quiet-hours", "android-only"), ("yv-ios-note", "ios-only"), ("rs-ios-note", "ios-only")]:
    m = re.search(r'<[^>]*id="' + i + r'"[^>]*>', h)
    ok = bool(m and k in m.group(0))
    print(f"{i} ({k}):", "OK" if ok else "UWAGA")
    if not ok:
        blad.append(i)

m = re.search(r"function godzinyCiszyTeraz[^\n]*\n([^\n]*)", js)
print("godziny ciszy wychodza na iOS:", "OK" if m and "IS_IOS" in m.group(1) else "UWAGA")

m = re.search(r"ALARM_MAX_MIN\s*=\s*(\d+)", js)
limit = int(m.group(1)) if m else None
i = js.find("function wyciszAlarmPoLimicie")
print(f"ALARM_MAX_MIN = {limit}, wola stopSiren:",
      "OK" if i > 0 and "stopSiren();" in js[i:i + 400] else "UWAGA")

sw = io.open("ios-app/straznik-background/ios/Sources/StraznikBackgroundPlugin/StraznikBackgroundPlugin.swift",
             encoding="utf-8").read()
bez_s = int(re.search(r"withTimeInterval: (\d+)", sw).group(1))
print(f"bezpiecznik syreny {bez_s} s:", "OK" if bez_s / 60 > limit else "UWAGA — nie dluzszy niz limit")

d = json.load(io.open("grota/data/polska.min.json", encoding="utf-8"))
print("GROTA:", d.get("data_danych"), len(d.get("punkty", [])))

for k in ["app.js?v=", "engine.js?v="]:
    m = re.search(re.escape(k) + r"([0-9a-zA-Z.]+)", h)
    print(f"klucz {k}", m.group(1) if m else "nie znalazlem")

# --- SEDNO: przyciski, ktorych na iOS BYC NIE MOZE (App Store 3.1.1) ---
print("\n=== przyciski zakazane na iOS ===")
for klasa in ["web-only", "no-ios", "no-sklep"]:
    # czy CSS chowa te klase w aplikacji iOS
    wzor = re.compile(r"\.ios-app[^{]*\." + klasa + r"[^{]*\{[^}]*display\s*:\s*none", re.S)
    wzor2 = re.compile(r"\." + klasa + r"[^{]*\{[^}]*display\s*:\s*none", re.S)
    chowa_ios = bool(wzor.search(css))
    chowa_ogolnie = bool(wzor2.search(css))
    print(f"  .{klasa}: regula .ios-app ->", "JEST" if chowa_ios else "brak",
          "| jakakolwiek display:none ->", "JEST" if chowa_ogolnie else "brak")
    if not (chowa_ios or chowa_ogolnie):
        blad.append(f"klasa {klasa} nigdzie nie jest chowana")

# czy same elementy maja te klasy
for szukaj, opis in [("APK bez Google Play", "przycisk APK"), ("buycoffee", "kawa"), ("Postaw kaw", "kawa (tekst)")]:
    for m in re.finditer(r"<[^>]*>[^<]{0,80}" + re.escape(szukaj), h):
        frag = m.group(0)
        tag = re.search(r"<[^>]+>", frag).group(0)
        klasy = re.search(r'class="([^"]*)"', tag)
        klasy = klasy.group(1) if klasy else "(brak class)"
        ok = any(k in klasy for k in ["web-only", "no-ios", "no-sklep"])
        print(f"  {opis}: class=\"{klasy}\"", "OK" if ok else "!!! BRAK KLASY UKRYWAJACEJ")
        if not ok:
            blad.append(opis)

print("\nWYNIK:", "wszystko OK" if not blad else "DO SPRAWDZENIA: " + ", ".join(blad))
